// Spike (a, suite) — réplication RxDB <-> CouchDB avec jeton Bearer, isolation et renouvellement de jeton.
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUD, bearerFetch, ensureSystemDbs, guardedFetch, mintJwt, waitForCouch, type Fetcher } from "../src/couch.js";
import { provisionInstance } from "../src/provision.js";
import { makeDb, noteSchema, replicate, until } from "../src/rx.js";

beforeAll(async () => {
  await waitForCouch(CLOUD);
  await ensureSystemDbs(CLOUD);
  await provisionInstance(CLOUD, "b1");
  await provisionInstance(CLOUD, "b2");
});

async function client(label: string) {
  const db = await makeDb(label);
  const cols = await db.addCollections({ notes: { schema: noteSchema } });
  return { db, notes: cols.notes };
}

describe("RxDB <-> CouchDB (JWT)", () => {
  it("élève et enseignant convergent en direct sur une instance", async () => {
    const alice = await client("alice");
    const prof = await client("prof");
    const aliceTok = await mintJwt("alice", ["inst:b1:member"]);
    const profTok = await mintJwt("prof", ["inst:b1:teacher"]);
    const ra = replicate(alice.notes, `${CLOUD}/inst_b1/`, bearerFetch(aliceTok), "b1-alice");
    const rp = replicate(prof.notes, `${CLOUD}/inst_b1/`, bearerFetch(profTok), "b1-prof");

    await alice.notes.insert({ id: "n1", authorId: "alice", text: "hello" });
    await until(async () => (await prof.notes.findOne("n1").exec()) !== null);
    expect((await prof.notes.findOne("n1").exec())!.text).toBe("hello");

    // retour : l'enseignant modifie un doc de l'élève (autorisé pour lui)
    await (await prof.notes.findOne("n1").exec())!.patch({ text: "corrigé" });
    await until(async () => (await alice.notes.findOne("n1").exec())?.text === "corrigé");
    await ra.cancel();
    await rp.cancel();
  });

  it("la base d'un autre groupe est refusée à la réplication", async () => {
    const alice = await client("alice2");
    const tok = await mintJwt("alice", ["inst:b1:member"]);
    const r = replicate(alice.notes, `${CLOUD}/inst_b2/`, guardedFetch(async () => tok, async () => tok), "b2-alice-denied");
    const errors: unknown[] = [];
    r.error$.subscribe((e) => errors.push(e));
    await alice.notes.insert({ id: "x", authorId: "alice", text: "intrus" });
    await until(() => errors.length > 0);
    expect(errors.length).toBeGreaterThan(0);
    // l'écriture reste locale (hors ligne), jamais envoyée à une base interdite
    expect((await alice.notes.findOne("x").exec())!.text).toBe("intrus");
    await r.cancel();
  });

  it("renouvelle un jeton expiré (retry sur 400/401) sans perdre l'écriture hors ligne", async () => {
    const alice = await client("alice3");
    let token = await mintJwt("alice", ["inst:b1:member"], { expiresIn: "-5s" });
    let refreshes = 0;
    const refreshing: Fetcher = async (url, init) => {
      let res = await bearerFetch(token)(url, init);
      if (res.status === 400 || res.status === 401) {
        refreshes++;
        token = await mintJwt("alice", ["inst:b1:member"]);
        res = await bearerFetch(token)(url, init);
      }
      return res;
    };
    await alice.notes.insert({ id: "offline1", authorId: "alice", text: "écrit avec jeton expiré" });
    const r = replicate(alice.notes, `${CLOUD}/inst_b1/`, refreshing, "b1-refresh");
    const prof = await client("prof3");
    const rp = replicate(prof.notes, `${CLOUD}/inst_b1/`, bearerFetch(await mintJwt("prof", ["inst:b1:teacher"])), "b1-prof3");
    await until(async () => (await prof.notes.findOne("offline1").exec()) !== null);
    expect(refreshes).toBeGreaterThan(0);
    await r.cancel();
    await rp.cancel();
  });
});
