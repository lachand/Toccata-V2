import { createRxDatabase } from "rxdb";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { replicateCouchDB } from "rxdb/plugins/replication-couchdb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, bootstrap, COUCH_URL, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await bootstrap(); });
afterAll(async () => { await ctx.cleanup(); });

const schema = { version: 0, primaryKey: "id", type: "object", properties: { id: { type: "string", maxLength: 100 }, authorId: { type: "string" }, text: { type: "string" } }, required: ["id", "authorId", "text"] } as const;

async function open(label: string) {
  const db = await createRxDatabase({ name: `${label}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory(), multiInstance: false });
  return (await db.addCollections({ notes: { schema } })).notes;
}
const until = async (f: () => Promise<boolean>, ms = 15_000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error("until"); };

describe("réplication RxDB avec des jetons émis par le service", () => {
  it("un élève et son enseignant convergent ; un autre groupe ne reçoit rien", async () => {
    const t = await ctx.signupTeacher("repl.teacher");
    const { students: [s1, s2] } = await ctx.makeClass(t.token, ["Rep Un", "Rep Deux"]);
    const act = (await ctx.call("POST", "/activities", { token: t.token })).json;
    const i1 = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: t.token, body: { memberIds: [s1!.id] } })).json;
    const i2 = (await ctx.call("POST", `/activities/${act.id}/instances`, { token: t.token, body: { memberIds: [s2!.id] } })).json;
    for (const d of [act.dbName, i1.dbName, i2.dbName]) ctx.track(d);
    const tok1 = (await ctx.login(s1!.username, s1!.passphrase)).json.accessToken as string;

    const student = await open("stu");
    const teacher = await open("tea");
    const fetchAs = (token: string) => ((url: string, init?: RequestInit) => asUser(token)(url.replace(`${COUCH_URL}/`, ""), init)) as typeof fetch;
    const rs = replicateCouchDB({ replicationIdentifier: "s1", collection: student, url: `${COUCH_URL}/${i1.dbName}/`, fetch: fetchAs(tok1), live: true, pull: { heartbeat: 1000 }, push: {} });
    const rt = replicateCouchDB({ replicationIdentifier: "t1", collection: teacher, url: `${COUCH_URL}/${i1.dbName}/`, fetch: fetchAs(t.token), live: true, pull: { heartbeat: 1000 }, push: {} });

    await student.insert({ id: "n1", authorId: s1!.id, text: "écrit hors ligne puis synchronisé" });
    await until(async () => (await teacher.findOne("n1").exec()) !== null);
    expect((await teacher.findOne("n1").exec())!.text).toBe("écrit hors ligne puis synchronisé");
    await (await teacher.findOne("n1").exec())!.patch({ text: "relu par l'enseignant" });
    await until(async () => (await student.findOne("n1").exec())?.text === "relu par l'enseignant");

    // l'élève ne peut pas lire la base d'un autre groupe
    expect((await asUser(tok1)(i2.dbName)).status).toBe(403);
    await rs.cancel(); await rt.cancel();
  });
});
