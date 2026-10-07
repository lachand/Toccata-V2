import type { FileDoc } from "@toccata/schema";

/** Taille maximale d'un fichier ajouté à une activité (ADR 0004 : pièces jointes CouchDB, pas un stockage d'objets). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Types affichables sans risque dans l'application (le reste se télécharge). */
export type FileKind = "image" | "video" | "audio" | "pdf" | "other";
export function fileKind(mime: string): FileKind {
  if (/^image\/(png|jpeg|gif|webp|avif)$/.test(mime)) return "image"; // pas de SVG : il peut contenir des scripts
  if (/^video\/(mp4|webm|ogg)$/.test(mime)) return "video";
  if (/^audio\/(mpeg|mp3|ogg|wav|webm|aac|mp4)$/.test(mime)) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "other";
}

/**
 * Envoi idempotent vers CouchDB : document `file_<sha256>` puis pièce jointe native `blob` (spike b).
 * 409 = le document existe déjà (même contenu) : on s'assure seulement que la pièce jointe est là.
 */
export async function uploadFile(f: typeof fetch, baseUrl: string, dbName: string, id: string, blob: Blob, authorId: string, now: number): Promise<void> {
  const db = `${baseUrl}/${dbName}`;
  const meta: FileDoc = { id: id as FileDoc["id"], kind: "file", authorId, mime: blob.type || "application/octet-stream", size: blob.size, createdAt: now, updatedAt: now };
  const { id: _omit, ...body } = meta;
  const put = await f(`${db}/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let rev: string;
  if (put.status === 409) {
    const head = await f(`${db}/${id}`, { headers: { accept: "application/json" } });
    const doc = (await head.json()) as { _rev: string; _attachments?: Record<string, unknown> };
    if (doc._attachments?.["blob"]) return;
    rev = doc._rev;
  } else if (put.ok) {
    rev = ((await put.json()) as { rev: string }).rev;
  } else throw new Error(`upload ${put.status}`);
  const att = await f(`${db}/${id}/blob?rev=${rev}`, { method: "PUT", headers: { "content-type": meta.mime }, body: blob });
  if (!att.ok && att.status !== 409) throw new Error(`upload ${att.status}`);
}

export async function downloadFile(f: typeof fetch, baseUrl: string, dbName: string, id: string): Promise<Blob> {
  const r = await f(`${baseUrl}/${dbName}/${id}/blob`);
  if (!r.ok) throw new Error(`download ${r.status}`);
  return r.blob();
}
