import { createRxDatabase } from "rxdb";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { describe, expect, it } from "vitest";
import { assembleContent, collectionNameFor, decodeInstanceDocs, decodeMasterDocs, envelopeSchema, findInstanceDoc, masterDbName, resolve, type MasterDoc } from "../src";
import { genMaster, idFactory, makeInstance, rng } from "./factories";

async function openCollection(dbName: string) {
  const db = await createRxDatabase({ name: "t" + Math.random().toString(36).slice(2), storage: getRxStorageMemory(), multiInstance: false });
  const cols = await db.addCollections({ [collectionNameFor(dbName)]: { schema: envelopeSchema as never } });
  return Object.values(cols)[0]!;
}

describe("RxDB : enveloppe + Zod", () => {
  const r = rng(7);
  const ids = idFactory(r);
  const master = genMaster(r, ids);
  const docs: MasterDoc[] = [master.activity, ...master.steps, ...master.resources, ...master.apps];

  it("stocke et relit sans perte des documents de plusieurs genres", async () => {
    const col = await openCollection(masterDbName(master.activity.id));
    await col.bulkInsert(docs as never);
    const raw = (await col.find().exec()).map((d) => d.toJSON());
    const { docs: decoded, issues } = decodeMasterDocs(raw);
    expect(issues).toEqual([]);
    expect(decoded).toHaveLength(docs.length);
    const content = assembleContent(decoded)!;
    expect(content.steps.map((s) => s.id).sort()).toEqual(master.steps.map((s) => s.id).sort());
    // le contenu relu se résout comme le contenu d'origine
    const inst = makeInstance(ids(), master.activity.id, master.activity.ownerId);
    expect(resolve(content, inst, { role: "teacher" }).steps.map((s) => s.id)).toEqual(resolve(master, inst, { role: "teacher" }).steps.map((s) => s.id));
  });

  it("filtre par genre grâce à l'index", async () => {
    const col = await openCollection(masterDbName(master.activity.id));
    await col.bulkInsert(docs as never);
    const steps = await col.find({ selector: { kind: "step" } }).exec();
    expect(steps).toHaveLength(master.steps.length);
  });

  it("écarte et signale un document invalide au lieu de planter", async () => {
    const col = await openCollection(masterDbName(master.activity.id));
    const bad = { id: "mauvais", kind: "step", updatedAt: 1, title: 42 };
    await col.bulkInsert([...docs, bad] as never);
    const { docs: decoded, issues } = decodeMasterDocs((await col.find().exec()).map((d) => d.toJSON()));
    expect(issues).toEqual([{ id: "mauvais", reason: "invalid" }]);
    expect(decoded).toHaveLength(docs.length);
  });

  it("assembleContent renvoie null tant que l'activité n'est pas arrivée", () => {
    expect(assembleContent(master.steps)).toBeNull();
    expect(assembleContent([])).toBeNull();
  });

  it("retrouve le document d'instance parmi d'autres documents", () => {
    const inst = makeInstance(ids(), master.activity.id, master.activity.ownerId);
    const older = { ...inst, updatedAt: 1, name: "ancien" };
    const { docs: d } = decodeInstanceDocs([older, inst, { nope: true }]);
    expect(findInstanceDoc(d)?.id).toBe(inst.id);
    expect(findInstanceDoc([])).toBeNull();
  });

  it("refuse un nom de base qui n'est pas un nom de collection", () => {
    expect(() => collectionNameFor("Master-Bad")).toThrow(RangeError);
  });
});
