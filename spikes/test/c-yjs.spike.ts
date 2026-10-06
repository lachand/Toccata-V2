// Spike (c) — texte collaboratif : Yjs + documents RxDB append-only répliqués par CouchDB.
import { beforeAll, describe, expect, it } from "vitest";
import { CLOUD, bearerFetch, ensureSystemDbs, mintJwt, waitForCouch } from "../src/couch.js";
import { provisionInstance } from "../src/provision.js";
import { makeDb, replicate, until } from "../src/rx.js";
import { YSync, yUpdateSchema } from "../src/ysync.js";

beforeAll(async () => {
  await waitForCouch(CLOUD);
  await ensureSystemDbs(CLOUD);
});

async function peer(label: string, inst: string, user: string, role: "member" | "teacher", docId: string, live = true) {
  const db = await makeDb(label);
  const { yupdates } = await db.addCollections({ yupdates: { schema: yUpdateSchema } });
  const sync = new YSync(yupdates, docId, user);
  const tok = await mintJwt(user, [`inst:${inst}:${role}`]);
  const start = () => replicate(yupdates, `${CLOUD}/inst_${inst}/`, bearerFetch(tok), `${inst}-${label}`, live);
  return { yupdates, sync, start };
}

describe("Yjs sur RxDB/CouchDB", () => {
  it("deux éditeurs hors ligne qui écrivent en même temps convergent après synchronisation", async () => {
    await provisionInstance(CLOUD, "y1");
    const a = await peer("ya", "y1", "alice", "member", "pad");
    const b = await peer("yb", "y1", "bob", "member", "pad"); // même instance (groupe de 2 élèves)
    a.sync.text.insert(0, "Bonjour ");
    b.sync.text.insert(0, "Salut ");
    a.sync.text.insert(a.sync.text.length, "de la part d'Alice.");
    b.sync.text.insert(b.sync.text.length, "de la part de Bob.");
    // Les deux sont encore déconnectés : textes divergents.
    expect(a.sync.text.toString()).not.toBe(b.sync.text.toString());
    const ra = a.start();
    const rb = b.start();
    await until(() => a.sync.text.toString() === b.sync.text.toString() && a.sync.text.length > 30);
    const final = a.sync.text.toString();
    for (const part of ["Bonjour ", "Salut ", "Alice", "Bob"]) expect(final).toContain(part);
    await ra.cancel();
    await rb.cancel();
  });

  it("la compaction réduit les documents et un nouveau venu reconstruit le même texte", async () => {
    await provisionInstance(CLOUD, "y2");
    const prof = await peer("yp", "y2", "prof", "teacher", "pad");
    for (let i = 0; i < 150; i++) prof.sync.text.insert(prof.sync.text.length, `ligne ${i}\n`);
    await until(async () => (await prof.yupdates.find().exec()).length === 150);
    await prof.sync.compact();
    expect((await prof.yupdates.find().exec()).length).toBe(1);
    const rp = prof.start();
    await rp.awaitInSync();
    const late = await peer("yl", "y2", "alice", "member", "pad");
    const rl = late.start();
    await until(() => late.sync.text.toString() === prof.sync.text.toString() && late.sync.text.length > 0);
    expect(late.sync.text.toString().split("\n").length).toBe(151);
    await rp.cancel();
    await rl.cancel();
  });
});
