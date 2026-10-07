// @vitest-environment node
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { firstValueFrom, filter } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";
import { newId, type MasterContent } from "@toccata/schema";
import { Workspace } from "./workspace";

let n = 0;
const open = (userId = newId()) => Workspace.open({ userId: `${userId}${n++}`, storage: getRxStorageMemory() as never, multiInstance: false });
const open$ = <T>(w: Workspace, id: string, pick: (c: MasterContent) => T) =>
  firstValueFrom(w.content$(id).pipe(filter((c): c is MasterContent => c !== null))).then(pick);

const opened: Workspace[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((w) => w.close()));
});
const make = async () => {
  const w = await open();
  opened.push(w);
  const owner = newId();
  const id = newId();
  await w.createActivity(id, owner, "Atelier", "fr");
  return { w, id, owner };
};

describe("Workspace (RxDB hors ligne)", () => {
  it("crée une activité et la liste", async () => {
    const { w, id } = await make();
    const rows = await firstValueFrom(w.activities$());
    expect(rows).toMatchObject([{ id, title: "Atelier", stepCount: 0 }]);
  });

  it("ajoute des étapes dans l'ordre, en insère une au milieu, sans renuméroter", async () => {
    const { w, id } = await make();
    const a = await w.addStep(id, "A");
    const c = await w.addStep(id, "C");
    const b = await w.addStep(id, "B", a);
    const steps = await open$(w, id, (x) => x.steps.sort((p, q) => (p.order < q.order ? -1 : 1)).map((s) => s.id));
    expect(steps).toEqual([a, b, c]);
  });

  it("déplace une étape en tête, au milieu et en queue", async () => {
    const { w, id } = await make();
    const [a, b, c] = [await w.addStep(id, "A"), await w.addStep(id, "B"), await w.addStep(id, "C")] as [string, string, string];
    const order = () => open$(w, id, (x) => [...x.steps].sort((p, q) => (p.order < q.order ? -1 : 1)).map((s) => s.title));
    await w.moveStep(id, c, 0);
    expect(await order()).toEqual(["C", "A", "B"]);
    await w.moveStep(id, c, 1);
    expect(await order()).toEqual(["A", "C", "B"]);
    await w.moveStep(id, a, 99);
    expect(await order()).toEqual(["C", "B", "A"]);
    void b;
  });

  it("renomme, masque et supprime une étape", async () => {
    const { w, id } = await make();
    const a = await w.addStep(id, "A");
    await w.patchStep(id, a, { title: "Alpha", hidden: true });
    expect(await open$(w, id, (x) => x.steps[0])).toMatchObject({ title: "Alpha", hidden: true });
    expect((await firstValueFrom(w.activities$()))[0]).toMatchObject({ stepCount: 1, hiddenCount: 1 });
    await w.removeStep(id, a);
    expect((await firstValueFrom(w.activities$()))[0]).toMatchObject({ stepCount: 0 });
  });

  it("retrouve les activités mémorisées après réouverture des collections", async () => {
    const { w, id } = await make();
    await w.openKnown();
    expect((await firstValueFrom(w.activities$())).map((r) => r.id)).toEqual([id]);
  });
});
