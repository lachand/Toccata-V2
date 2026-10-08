import { instantiateBundle, toBundle, type Bundle, type Id } from "@toccata/schema";
import { activitiesApi } from "../auth/api";
import type { Workspace } from "../data/workspace";
import { sanitizeHtml } from "../richtext/sanitize";
import { packBundle } from "./zip";
import { firstValueFrom, filter } from "rxjs";
import type { MasterContent } from "@toccata/schema";

type Api = Pick<ReturnType<typeof activitiesApi>, "create">;

const contentOf = async (ws: Workspace, activityId: string): Promise<MasterContent> =>
  (await firstValueFrom(ws.content$(activityId).pipe(filter((c): c is MasterContent => c !== null)))) as MasterContent;

/** Rassemble une activité et ses fichiers locaux en archive `.toccata`. Les fichiers introuvables hors ligne sont comptés, pas inventés. */
export async function exportActivity(ws: Workspace, activityId: string, now = Date.now()): Promise<{ blob: Blob; filename: string; missingFiles: number }> {
  const content = await contentOf(ws, activityId);
  const files = new Map<string, Blob>();
  let missing = 0;
  for (const r of content.resources) {
    if (r.source.type !== "file" || files.has(r.source.fileId)) continue;
    const blob = await ws.readFile(activityId, r.source.fileId);
    if (blob) files.set(r.source.fileId, blob);
    else missing++;
  }
  const bundle = toBundle(content, now);
  const kept: Bundle = { ...bundle, resources: bundle.resources.filter((r) => r.source.type !== "file" || files.has(r.source.fileId)) };
  const safe = content.activity.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "activite";
  return { blob: await packBundle(kept, files), filename: `${safe}.toccata`, missingFiles: missing };
}

/**
 * Crée une activité NEUVE à partir d'un lot : le serveur approvisionne la base (identifiant réservé), puis le contenu est écrit
 * localement (donc répliqué) avec des identifiants tous recréés. Les consignes sont assainies : un lot vient de l'extérieur.
 */
export async function createFromBundle(ws: Workspace, api: Api, ownerId: Id, bundle: Bundle, files: ReadonlyMap<string, Blob>, opts: { forkedFrom?: Id; title?: string } = {}): Promise<{ id: string; missingFiles: number }> {
  const { id } = await api.create();
  const inst = instantiateBundle(bundle, ownerId, ws.now(), { ...opts, activityId: id as Id });
  const steps = inst.steps.map((s) => ({ ...s, instructions: sanitizeHtml(s.instructions) }));
  // une ressource de type fichier dont le contenu manque (lot sans le fichier) serait un lien mort : on ne la crée pas
  const resources = inst.resources.filter((r) => r.source.type !== "file" || files.has(r.source.fileId));
  const missingFiles = inst.resources.length - resources.length;
  await ws.writeMasterDocs(id, [inst.activity, ...steps, ...resources, ...inst.apps]);
  for (const fileId of inst.fileIds) {
    const blob = files.get(fileId);
    if (blob) await ws.adoptFile(id, fileId, blob);
  }
  return { id, missingFiles };
}

/** Copie une activité du même enseignant (lignée `forkedFrom`). */
export async function duplicateActivity(ws: Workspace, api: Api, ownerId: Id, sourceId: string, title: string): Promise<{ id: string; missingFiles: number }> {
  const content = await contentOf(ws, sourceId);
  const files = new Map<string, Blob>();
  for (const r of content.resources) {
    if (r.source.type !== "file" || files.has(r.source.fileId)) continue;
    const blob = await ws.readFile(sourceId, r.source.fileId);
    if (blob) files.set(r.source.fileId, blob);
  }
  return createFromBundle(ws, api, ownerId, toBundle(content, ws.now()), files, { forkedFrom: sourceId as Id, title });
}
