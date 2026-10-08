import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error — outil de développement en JavaScript, sans déclaration de types
import { startProxy } from "../../../../tools/switchable-proxy.mjs";
import { asUser, asUserOn, bootstrap, type Ctx } from "./helpers";

// Deux CouchDB réels (5984 « cloud », 5985 « serveur de classe ») et un proxy coupable entre eux :
// la pile de la Phase 6 (réplication entre serveurs, authentification locale, coupure puis rétablissement).
const LOCAL = "http://127.0.0.1:5985";
const ADMIN = { user: process.env["COUCHDB_ADMIN_USER"] ?? process.env["COUCHDB_USER"] ?? "admin", pass: process.env["COUCHDB_ADMIN_PASSWORD"] ?? process.env["COUCHDB_PASSWORD"] ?? "spike-admin-pass" };

type Proxy = { port: number; setOn(v: boolean): void; close(): Promise<void> };
let proxy: Proxy;
let cloud: Ctx;
let local: Ctx;
let teacher: { token: string; id: string };
let other: { token: string; id: string };
let students: { id: string; username: string; passphrase: string }[];
let act: { id: string; dbName: string };
let inst: { id: string; dbName: string }[];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Rejoue une passe de rapprochement et attend qu'une condition soit vraie (les réplications ont besoin de quelques secondes). */
async function converge(cond: () => Promise<boolean>, what: string, ms = 60_000) {
  const t0 = Date.now();
  let last: unknown;
  while (Date.now() - t0 < ms) {
    await local.reconciler.run();
    try {
      if (await cond()) return;
    } catch (e) {
      last = e;
    }
    await sleep(1000);
  }
  throw new Error(`pas de convergence : ${what}${last ? ` (${String(last)})` : ""}`);
}

beforeAll(async () => {
  proxy = await startProxy({ target: process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984" });
  cloud = await bootstrap();
  teacher = await cloud.signupTeacher("loc.teacher");
  other = await cloud.signupTeacher("loc.other");
  ({ students } = await cloud.makeClass(teacher.token, ["Alice Locale", "Bob Locale"]));
  act = (await cloud.call("POST", "/activities", { token: teacher.token })).json;
  inst = [
    (await cloud.call("POST", `/activities/${act.id}/instances`, { token: teacher.token, body: { memberIds: [students[0]!.id] } })).json,
    (await cloud.call("POST", `/activities/${act.id}/instances`, { token: teacher.token, body: { memberIds: [students[1]!.id] } })).json,
  ];
  const otherAct = (await cloud.call("POST", "/activities", { token: other.token })).json;
  cloud.track(act.dbName); inst.forEach((i) => cloud.track(i.dbName)); cloud.track(otherAct.dbName); cloud.track(`teacher_${teacher.id}`); cloud.track(`teacher_${other.id}`);

  local = await bootstrap(
    {
      ACCOUNTS_DB: cloud.accountsDb,
      SERVER_MODE: "local",
      SERVER_NAME: "Classe 4e B",
      UPSTREAM_COUCHDB_URL: `http://host.docker.internal:${proxy.port}`,
      UPSTREAM_PROBE_URL: `http://127.0.0.1:${proxy.port}`, // le service est sur l'hôte, CouchDB dans un conteneur : ils n'ont pas le même nom pour l'hôte
      UPSTREAM_ADMIN_USER: ADMIN.user,
      UPSTREAM_ADMIN_PASSWORD: ADMIN.pass,
      TEACHER_IDS: teacher.id,
      LOCAL_COUCHDB_SELF_URL: "http://127.0.0.1:5984",
    },
    {},
    { couchUrl: LOCAL },
  );
  local.track(act.dbName); inst.forEach((i) => local.track(i.dbName)); local.track(`teacher_${teacher.id}`); local.track(cloud.accountsDb);
}, 120_000);

afterAll(async () => {
  // arrêter les réplications avant de supprimer les bases, sinon elles se relancent en boucle sur des bases disparues
  const reps = await local.couch.request("GET", "_replicator/_all_docs");
  for (const row of (reps.body?.rows ?? []) as { id: string; value: { rev: string } }[]) if (row.id.startsWith("toccata-")) await local.couch.delete("_replicator", row.id, row.value.rev).catch(() => undefined);
  await sleep(1500);
  await proxy.close();
  await local.cleanup();
  await cloud.cleanup();
}, 60_000);

describe("serveur de classe (mode local)", () => {
  it("rattrape les comptes et les bases du cloud : un élève se connecte sur le serveur de classe", async () => {
    const s = students[0]!;
    await converge(async () => (await local.login(s.username, s.passphrase)).status === 200, "connexion de l'élève sur le serveur local");
    const info = (await local.call("GET", "/server-info")).json;
    expect(info).toMatchObject({ mode: "local", name: "Classe 4e B" });
    // approvisionnement local : les bases de l'activité et des groupes existent, avec leurs droits
    await converge(async () => (await local.couch.request("GET", encodeURIComponent(inst[0]!.dbName))).status === 200, "bases d'instance sur le serveur local");
    const sec = await local.couch.request("GET", `${encodeURIComponent(inst[0]!.dbName)}/_security`);
    expect(sec.body.members.roles).toEqual(expect.arrayContaining([`owner:${teacher.id}`, `inst:${inst[0]!.id}:member`]));
  });

  it("ne copie ni les comptes ni les activités des autres enseignants", async () => {
    const accounts = await local.couch.request("POST", `${local.accountsDb}/_find`, { selector: { type: "user", username: "loc.other" } });
    expect(accounts.body.docs).toEqual([]);
    expect(((await local.couch.request("GET", "_all_dbs")).body as string[]).filter((d) => d === `teacher_${other.id}`)).toEqual([]);
    expect((await local.login("loc.other", local.PASSWORD)).status).toBe(401);
    // et les sessions (jetons de rafraîchissement) ne se répliquent jamais
    const sessions = await local.couch.request("POST", `${local.accountsDb}/_find`, { selector: { type: "session", userId: { $in: [teacher.id, other.id] } } });
    expect(sessions.body.docs).toEqual([]); // les inscriptions des enseignants sur le cloud ont chacune une session ; aucune n'a suivi
  });

  it("le contenu circule dans les deux sens", async () => {
    const s = students[0]!;
    const sTokLocal = (await local.login(s.username, s.passphrase)).json.accessToken as string;
    // cloud → local : l'enseignant écrit le contenu sur le cloud, l'élève le lit sur le serveur de classe
    const put = await asUser(teacher.token)(`${act.dbName}/step1`, { method: "PUT", body: JSON.stringify({ kind: "step", title: "Écrit sur le cloud" }) });
    expect(put.status).toBe(201);
    await converge(async () => (await asUserOn(LOCAL, sTokLocal)(`${act.dbName}/step1`)).status === 200, "contenu cloud → local");
    // local → cloud : l'élève écrit dans son groupe sur le serveur de classe, l'enseignant le voit sur le cloud
    const w = await asUserOn(LOCAL, sTokLocal)(`${inst[0]!.dbName}/card1`, { method: "PUT", body: JSON.stringify({ kind: "kanbancard", authorId: s.id, title: "Écrit en classe" }) });
    expect(w.status).toBe(201);
    await converge(async () => (await asUser(teacher.token)(`${inst[0]!.dbName}/card1`)).status === 200, "contenu local → cloud");
  });

  it("les droits sont ceux du cloud : un élève ne lit pas le groupe d'un autre", async () => {
    const s = students[0]!;
    const tok = (await local.login(s.username, s.passphrase)).json.accessToken as string;
    expect((await asUserOn(LOCAL, tok)(inst[1]!.dbName)).status).toBe(403);
    expect((await asUserOn(LOCAL, tok)(inst[0]!.dbName)).status).toBe(200);
  });

  it("la gestion des comptes reste sur le cloud : lecture seule en classe", async () => {
    const t = (await local.login("loc.teacher", local.PASSWORD)).json.accessToken as string;
    for (const [m, p, b] of [["POST", "/classes", { name: "X" }], ["POST", "/auth/teachers", { username: "intrus.local", displayName: "I", password: "Tb9#kLm2-vq8Zr!xW" }]] as const) {
      const r = await local.call(m, p, { token: t, body: b });
      expect(r.status, p).toBe(503);
      expect(r.json).toEqual({ error: "local_readonly" });
    }
    // en revanche, activités, groupes et séances fonctionnent en classe
    expect((await local.call("GET", "/activities", { token: t })).status).toBe(200);
    expect((await local.call("GET", "/me/memberships", { token: (await local.login(students[0]!.username, students[0]!.passphrase)).json.accessToken })).json).toEqual([{ activityId: act.id, instanceId: inst[0]!.id }]);
  });

  it("coupure d'Internet : le serveur de classe continue, le cloud aussi ; au rétablissement tout converge sans perte", async () => {
    const s = students[0]!;
    await converge(async () => (await local.call("GET", "/server-info")).json.upstream === "online", "amont joignable avant la coupure");

    proxy.setOn(false);
    await converge(async () => (await local.call("GET", "/server-info")).json.upstream === "offline", "coupure détectée", 90_000);
    const info = (await local.call("GET", "/server-info")).json;
    expect(info.lastSyncAt).toBeTypeOf("number");

    // pendant la coupure : connexion, lecture et écriture locales restent possibles
    const login = await local.login(s.username, s.passphrase);
    expect(login.status).toBe(200);
    const tokLocal = login.json.accessToken as string;
    expect((await asUserOn(LOCAL, tokLocal)(`${act.dbName}/step1`)).status).toBe(200);
    expect((await asUserOn(LOCAL, tokLocal)(`${inst[0]!.dbName}/card2`, { method: "PUT", body: JSON.stringify({ kind: "kanbancard", authorId: s.id, title: "Pendant la coupure (classe)" }) })).status).toBe(201);
    // ... et le cloud continue de recevoir des écritures de son côté
    expect((await asUser(teacher.token)(`${act.dbName}/step2`, { method: "PUT", body: JSON.stringify({ kind: "step", title: "Pendant la coupure (cloud)" }) })).status).toBe(201);
    await sleep(2000);
    expect((await asUser(teacher.token)(`${inst[0]!.dbName}/card2`)).status).toBe(404); // pas encore passé : la coupure est réelle

    proxy.setOn(true);
    await converge(async () => (await asUser(teacher.token)(`${inst[0]!.dbName}/card2`)).status === 200, "écriture locale → cloud après rétablissement", 120_000);
    await converge(async () => (await asUserOn(LOCAL, tokLocal)(`${act.dbName}/step2`)).status === 200, "écriture cloud → local après rétablissement", 120_000);
    await converge(async () => (await local.call("GET", "/server-info")).json.upstream === "online", "amont de nouveau en ligne", 120_000);
    // rien n'a été perdu des deux côtés
    for (const id of ["step1", "step2"]) expect((await asUserOn(LOCAL, tokLocal)(`${act.dbName}/${id}`)).status).toBe(200);
    for (const id of ["card1", "card2"]) expect((await asUser(teacher.token)(`${inst[0]!.dbName}/${id}`)).status).toBe(200);
  }, 360_000);
});
