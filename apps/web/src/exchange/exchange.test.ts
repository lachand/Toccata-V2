import { newId, toBundle, type Bundle, type MasterContent } from "@toccata/schema";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { firstValueFrom, filter } from "rxjs";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Hex } from "../data/files";
import { Workspace } from "../data/workspace";
import { createFromBundle, duplicateActivity, exportActivity } from "./activities";
import { ImportError, packBundle, unpackBundle } from "./zip";

const opened: Workspace[] = [];
afterEach(async () => void (await Promise.all(opened.splice(0).map((w) => w.close()))));

async function setup() {
  const owner = newId();
  const w = await Workspace.open({ userId: owner, storage: getRxStorageMemory() as never, multiInstance: false });
  opened.push(w);
  // « le serveur » : réserve un identifiant d'activité à chaque appel
  const api = { create: async () => ({ id: newId(), dbName: "x" }) };
  const act = newId();
  await w.createActivity(act, owner, "Atelier source", "fr");
  const s1 = await w.addStep(act, "Étape 1");
  await w.patchStep(act, s1, { instructions: "<p>Bonjour</p><script>alert(1)</script>" });
  await w.addResource(act, { scope: { type: "step", stepId: s1 }, name: "Lien", source: { type: "url", url: "https://example.org/", display: "link" } });
  await w.addApp(act, { scope: { type: "step", stepId: s1 }, name: "Chrono", type: "timer", config: { durationSec: 120 } });
  return { w, owner, api, act };
}
const content = (w: Workspace, id: string) => firstValueFrom(w.content$(id).pipe(filter((c): c is MasterContent => c !== null)));

describe("échange d'activités", () => {
  it("exporte puis importe : une activité neuve, tout recréé, consignes assainies, sans trace de l'ancienne", async () => {
    const { w, owner, api, act } = await setup();
    const { blob, filename } = await exportActivity(w, act);
    expect(filename).toBe("Atelier-source.toccata");
    const { bundle, files } = await unpackBundle(blob);
    const out = await createFromBundle(w, api, owner as never, bundle, files);
    expect(out.id).not.toBe(act);
    const copy = await content(w, out.id);
    expect(copy.activity).toMatchObject({ title: "Atelier source", ownerId: owner });
    expect(copy.steps).toHaveLength(1);
    expect(copy.steps[0]!.id).not.toBe((await content(w, act)).steps[0]!.id);
    expect(copy.steps[0]!.instructions).toBe("<p>Bonjour</p>"); // le <script> d'un lot venu d'ailleurs n'entre pas
    expect(copy.resources).toHaveLength(1);
    expect(copy.apps).toHaveLength(1);
    expect(copy.resources[0]!.scope).toEqual({ type: "step", stepId: copy.steps[0]!.id });
  });

  it("duplique en gardant la lignée, et le fichier suit la copie", async () => {
    const { w, owner, api, act } = await setup();
    const png = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    await w.attachFile(act, png, "pixel.png", { type: "activity" });
    const { id, missingFiles } = await duplicateActivity(w, api, owner as never, act, "Copie");
    expect(missingFiles).toBe(0);
    const copy = await content(w, id);
    expect(copy.activity).toMatchObject({ title: "Copie", forkedFrom: act });
    const file = copy.resources.find((r) => r.source.type === "file")!;
    expect(file.source).toMatchObject({ type: "file", size: 4 });
    expect(await w.readFile(id, (file.source as { fileId: string }).fileId)).not.toBeNull();
  });

  it("compte les fichiers introuvables au lieu de créer des liens morts", async () => {
    const { w, owner, api, act } = await setup();
    const b = toBundle(await content(w, act), 1);
    const orphan: Bundle = { ...b, resources: [...b.resources, { ...b.resources[0]!, id: newId(), scope: { type: "activity" }, source: { type: "file", fileId: `file_${"b".repeat(64)}`, mime: "image/png", size: 1 } }] };
    const out = await createFromBundle(w, api, owner as never, orphan, new Map());
    expect(out.missingFiles).toBe(1);
    expect((await content(w, out.id)).resources.every((r) => r.source.type !== "file")).toBe(true);
  });
});

describe("archive .toccata reçue de l'extérieur", () => {
  const bundleJson = (b: Bundle) => strToU8(JSON.stringify(b));
  const base = (): Bundle => ({ format: "toccata", version: 1, exportedAt: 1, activity: { title: "t", description: "" }, steps: [], resources: [], apps: [] });
  const zip = (e: Record<string, Uint8Array>) => new Blob([zipSync(e) as BlobPart]);

  it("relit ce qu'elle a écrit, fichiers compris", async () => {
    const data = new Uint8Array([9, 8, 7]);
    const blob = new Blob([data]);
    const id = `file_${await sha256Hex(blob)}`;
    const back = await unpackBundle(await packBundle(base(), new Map([[id, blob]])));
    expect(back.files.has(id)).toBe(true);
  });

  it("refuse un fichier dont le contenu ne correspond pas à son empreinte", async () => {
    const id = `file_${"c".repeat(64)}`;
    await expect(unpackBundle(zip({ "activity.json": bundleJson(base()), [`files/${id}`]: new Uint8Array([1]) }))).rejects.toMatchObject({ code: "file_mismatch" });
  });

  it("ignore les entrées inattendues (chemins piégés, exécutables) sans les lire", async () => {
    const out = await unpackBundle(zip({ "activity.json": bundleJson(base()), "../../etc/passwd": strToU8("x"), "files/../x": strToU8("y"), "run.sh": strToU8("rm -rf /") }));
    expect(out.files.size).toBe(0);
  });

  it.each([
    ["pas une archive", new Blob(["pas du zip"]), "not_toccata"],
    ["archive sans activity.json", zip({ "autre.txt": strToU8("x") }), "not_toccata"],
    ["JSON illisible", zip({ "activity.json": strToU8("{pas du json") }), "not_toccata"],
    ["version inconnue", zip({ "activity.json": strToU8(JSON.stringify({ format: "toccata", version: 7 })) }), "unsupported_version"],
    ["contenu invalide", zip({ "activity.json": strToU8(JSON.stringify({ format: "toccata", version: 1 })) }), "invalid"],
  ])("refuse : %s", async (_n, blob, code) => {
    await expect(unpackBundle(blob)).rejects.toBeInstanceOf(ImportError);
    await expect(unpackBundle(blob)).rejects.toMatchObject({ code });
  });
});
