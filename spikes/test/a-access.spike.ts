// Spike (a) — JWT + contrôle d'accès CouchDB (une base par master, une base par instance).
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUD, bearerFetch, ensureSystemDbs, mintJwt, putJson, waitForCouch } from "../src/couch.js";
import { provisionInstance, provisionMaster } from "../src/provision.js";

let teacher: ReturnType<typeof bearerFetch>;
let alice: ReturnType<typeof bearerFetch>; // élève, instance A1
let bob: ReturnType<typeof bearerFetch>; // élève, instance A2

beforeAll(async () => {
  await waitForCouch(CLOUD);
  await ensureSystemDbs(CLOUD);
  await provisionMaster(CLOUD, "a");
  await provisionInstance(CLOUD, "a1");
  await provisionInstance(CLOUD, "a2");
  teacher = bearerFetch(
    await mintJwt("prof", ["master:a:read", "master:a:write", "inst:a1:teacher", "inst:a2:teacher"]),
  );
  alice = bearerFetch(await mintJwt("alice", ["master:a:read", "inst:a1:member"]));
  bob = bearerFetch(await mintJwt("bob", ["master:a:read", "inst:a2:member"]));
});

const get = (f: typeof teacher, db: string) => f(`${CLOUD}/${db}`);

describe("authentification JWT", () => {
  it("refuse sans jeton", async () => {
    expect((await fetch(`${CLOUD}/master_a`)).status).toBe(401);
  });
  it("refuse un jeton expiré", async () => {
    const t = bearerFetch(await mintJwt("alice", ["master:a:read"], { expiresIn: "-10s" }));
    expect((await get(t, "master_a")).status).toBe(401);
  });
  it("refuse un jeton signé avec une autre clé", async () => {
    const t = bearerFetch(
      await mintJwt("alice", ["master:a:read"], { secret: new TextEncoder().encode("x".repeat(32)) }),
    );
    // CouchDB 3.4 répond 400 (signature invalide) ; le client doit traiter 400/401 comme « jeton à renouveler ».
    expect([400, 401]).toContain((await get(t, "master_a")).status);
  });
  it("identifie l'utilisateur et ses rôles", async () => {
    const r = await alice(`${CLOUD}/_session`);
    const body = (await r.json()) as any;
    expect(body.userCtx.name).toBe("alice");
    expect(body.userCtx.roles).toContain("inst:a1:member");
  });
});

describe("master : lecture pour tous, écriture enseignant", () => {
  it("l'enseignant écrit", async () => {
    const r = await putJson(teacher, `${CLOUD}/master_a/step1`, { type: "step", title: "Étape 1" });
    expect(r.status).toBe(201);
  });
  it("l'élève lit", async () => {
    expect((await alice(`${CLOUD}/master_a/step1`)).status).toBe(200);
  });
  it("l'élève ne peut pas écrire", async () => {
    const r = await putJson(alice, `${CLOUD}/master_a/hack`, { type: "step", title: "pirate" });
    expect(r.status).toBe(403);
  });
});

describe("instances : isolation entre groupes", () => {
  it("alice lit/écrit sa base", async () => {
    const r = await putJson(alice, `${CLOUD}/inst_a1/note1`, { authorId: "alice", text: "salut" });
    expect(r.status).toBe(201);
    expect((await alice(`${CLOUD}/inst_a1/note1`)).status).toBe(200);
  });
  it("alice ne peut ni lire ni écrire la base d'un autre groupe", async () => {
    expect((await get(alice, "inst_a2")).status).toBe(403);
    expect((await putJson(alice, `${CLOUD}/inst_a2/x`, { authorId: "alice" })).status).toBe(403);
  });
  it("bob ne lit pas la base d'alice", async () => {
    expect((await bob(`${CLOUD}/inst_a1/note1`)).status).toBe(403);
  });
  it("l'enseignant lit toutes les instances", async () => {
    expect((await teacher(`${CLOUD}/inst_a1/note1`)).status).toBe(200);
    expect((await get(teacher, "inst_a2")).status).toBe(200);
  });
  it("un élève ne peut pas usurper authorId", async () => {
    const r = await putJson(alice, `${CLOUD}/inst_a1/fake`, { authorId: "bob" });
    expect(r.status).toBe(403);
  });
  it("un élève ne modifie pas un document réservé à l'enseignant", async () => {
    await putJson(teacher, `${CLOUD}/inst_a1/feedback1`, { authorId: "prof", teacherOnly: true, text: "bravo" });
    const cur = (await (await alice(`${CLOUD}/inst_a1/feedback1`)).json()) as any;
    const r = await putJson(alice, `${CLOUD}/inst_a1/feedback1`, { ...cur, text: "trafiqué" });
    expect(r.status).toBe(403);
  });
});
