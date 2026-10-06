// Spike (d) — bascule d'endpoint serveur local → cloud → hors ligne, sans perte d'écriture.
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_PASS, ADMIN_USER, CLOUD, LOCAL, adminFetch, ensureSystemDbs, guardedFetch, mintJwt, putJson, waitForCouch } from "../src/couch.js";
import { SyncManager } from "../src/endpoint.js";
import { provisionInstance } from "../src/provision.js";
import { makeDb, noteSchema, replicate, until } from "../src/rx.js";

const auth = { basic: { username: ADMIN_USER, password: ADMIN_PASS } };
const sh = (c: string) => execSync(c, { stdio: "pipe" }).toString();

async function link(from: "couch-local" | "couch-cloud", to: "couch-local" | "couch-cloud", name: string, db: string) {
  const node = from === "couch-local" ? LOCAL : CLOUD;
  const r = await putJson(adminFetch, `${node}/_replicator/${name}`, {
    source: { url: `http://${from}:5984/${db}`, auth },
    target: { url: `http://${to}:5984/${db}`, auth },
    continuous: true,
  });
  expect([201, 409]).toContain(r.status);
}

beforeAll(async () => {
  await waitForCouch(CLOUD);
  await waitForCouch(LOCAL);
  await ensureSystemDbs(CLOUD);
  await ensureSystemDbs(LOCAL);
  await provisionInstance(CLOUD, "e1");
  await provisionInstance(LOCAL, "e1");
  await adminFetch(`${LOCAL}/_replicator/e1-l2c`, { method: "DELETE" });
  await link("couch-local", "couch-cloud", `e1-l2c-${Date.now()}`, "inst_e1");
  await link("couch-cloud", "couch-local", `e1-c2l-${Date.now()}`, "inst_e1");
});

afterAll(() => {
  for (const s of ["couch-local", "couch-cloud"]) {
    try { sh(`docker start infra-${s}-1`); } catch { /* déjà démarré */ }
  }
});

const waitUp = async (url: string) => { await waitForCouch(url, 60); };
const remoteHas = async (base: string, id: string) =>
  (await adminFetch(`${base}/inst_e1/${id}`)).status === 200;

describe("résilience réseau : local → cloud → hors ligne", () => {
  it("bascule sans perdre d'écriture", async () => {
    const tok = await mintJwt("alice", ["inst:e1:member"]);
    const db = await makeDb("alice-e");
    const { notes } = await db.addCollections({ notes: { schema: noteSchema } });
    const mgr = new SyncManager(
      [
        { name: "local", url: LOCAL },
        { name: "cloud", url: CLOUD },
      ],
      (e) => replicate(notes, `${e.url}/inst_e1/`, guardedFetch(async () => tok, async () => tok), `e1-alice-${e.name}`),
    );
    mgr.start();

    // 1. serveur local joignable : l'écriture va au local, puis le serveur la pousse au cloud
    await until(() => mgr.current?.name === "local");
    await notes.insert({ id: "n1", authorId: "alice", text: "sur le local" });
    await until(() => remoteHas(LOCAL, "n1"));
    await until(() => remoteHas(CLOUD, "n1"), 30000);

    // 2. le serveur local tombe : bascule vers le cloud
    sh("docker stop -t 1 infra-couch-local-1");
    await until(() => mgr.current?.name === "cloud", 15000);
    await notes.insert({ id: "n2", authorId: "alice", text: "sur le cloud" });
    await until(() => remoteHas(CLOUD, "n2"));

    // 3. plus aucun serveur : hors ligne, l'écriture reste locale
    sh("docker stop -t 1 infra-couch-cloud-1");
    await until(() => mgr.current === null, 15000);
    await notes.insert({ id: "n3", authorId: "alice", text: "hors ligne" });
    expect(await notes.findOne("n3").exec()).not.toBeNull();

    // 4. retour du réseau : tout remonte, puis le serveur local rattrape son retard
    sh("docker start infra-couch-cloud-1");
    await waitUp(CLOUD);
    await until(() => remoteHas(CLOUD, "n3"), 30000);
    sh("docker start infra-couch-local-1");
    await waitUp(LOCAL);
    await until(() => remoteHas(LOCAL, "n3"), 60000);

    await until(() => mgr.current?.name === "local", 30000);
    expect(mgr.history).toEqual(["local", "cloud", null, "cloud", "local"]);
    await mgr.stop();
  }, 180000);
});
