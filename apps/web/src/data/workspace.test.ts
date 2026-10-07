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

  it("ajoute, renomme et retire une ressource lien et une application ; supprimer une étape retire ce qui lui est propre", async () => {
    const { w, id } = await make();
    const step = await w.addStep(id, "A");
    const keep = await w.addResource(id, { scope: { type: "activity" }, name: "Wikipédia", source: { type: "url", url: "https://fr.wikipedia.org/", display: "link" } });
    const own = await w.addResource(id, { scope: { type: "step", stepId: step }, name: "Fiche", source: { type: "url", url: "https://example.org/", display: "iframe" } });
    const app = await w.addApp(id, { scope: { type: "step", stepId: step }, name: "Chrono", type: "timer", config: { durationSec: 300 } });
    await w.renameResource(id, keep, "Encyclopédie");
    const c1 = await open$(w, id, (x) => x);
    expect(c1.resources.map((r) => r.name).sort()).toEqual(["Encyclopédie", "Fiche"]);
    expect(c1.apps).toHaveLength(1);
    await w.patchApp(id, app, { config: { durationSec: 600 } });
    expect((await open$(w, id, (x) => x.apps[0]))?.config).toEqual({ durationSec: 600 });
    await w.removeStep(id, step);
    const c2 = await open$(w, id, (x) => x);
    expect(c2.resources.map((r) => r.id)).toEqual([keep]);
    expect(c2.apps).toEqual([]);
    expect(own).toBeTruthy();
  });

  it("garde un fichier localement, le met en file, puis l'envoie une seule fois quand la synchronisation démarre", async () => {
    const { w, id } = await make();
    const puts: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET" && url.includes("/file_")) puts.push(`${method} ${url}`);
      if (method === "PUT" && !url.includes("/blob")) return new Response(JSON.stringify({ ok: true, rev: "1-a" }), { status: 201 });
      if (method === "PUT") return new Response(JSON.stringify({ ok: true }), { status: 201 });
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;

    const file = new Blob(["bonjour"], { type: "text/plain" });
    const rid = await w.attachFile(id, file, "note.txt", { type: "activity" });
    const res = (await open$(w, id, (x) => x.resources)).find((r) => r.id === rid)!;
    expect(res.source).toMatchObject({ type: "file", mime: "text/plain", size: 7 });
    expect(await firstValueFrom(w.pendingUploads$())).toBe(1);
    expect(puts).toEqual([]); // pas de synchronisation : rien ne part

    await w.startSync({ fetch: fake, baseUrl: "/couch", replicateData: false });
    await w.flushUploads();
    expect(puts).toHaveLength(2); // document puis pièce jointe
    expect(puts[0]).toMatch(/PUT \/couch\/master_\w+\/file_[0-9a-f]{64}$/);
    expect(puts[1]).toMatch(/\/blob\?rev=1-a$/);
    expect(await firstValueFrom(w.pendingUploads$())).toBe(0);
  });

  it("refuse un fichier trop gros", async () => {
    const { w, id } = await make();
    const big = { size: 26 * 1024 * 1024, type: "video/mp4", arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;
    await expect(w.attachFile(id, big, "x.mp4", { type: "activity" })).rejects.toThrow("file_too_large");
  });
});
