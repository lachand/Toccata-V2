import { createHash } from "node:crypto";
import { putJson, type Fetcher } from "./couch.js";

export const sha256 = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * Envoi idempotent d'un fichier vers CouchDB en pièce jointe NATIVE d'un document
 * `file_<sha256>` (contenu adressé : un même fichier n'est stocké qu'une fois par base).
 * Retourne l'identifiant du document.
 */
export async function uploadFile(
  f: Fetcher,
  dbUrl: string,
  data: Uint8Array,
  mime: string,
  authorId: string,
): Promise<string> {
  const id = `file_${sha256(data)}`;
  const meta = await putJson(f, `${dbUrl}/${id}`, { authorId, mime, size: data.byteLength, kind: "file" });
  if (meta.status === 409) return id; // déjà présent : rien à renvoyer
  if (!meta.ok) throw new Error(`meta ${meta.status}: ${await meta.text()}`);
  const { rev } = (await meta.json()) as { rev: string };
  const att = await f(`${dbUrl}/${id}/blob?rev=${rev}`, {
    method: "PUT",
    headers: { "content-type": mime },
    body: data as unknown as BodyInit,
  });
  if (!att.ok) throw new Error(`pièce jointe ${att.status}: ${await att.text()}`);
  return id;
}

export async function downloadFile(f: Fetcher, dbUrl: string, id: string): Promise<Uint8Array> {
  const r = await f(`${dbUrl}/${id}/blob`);
  if (!r.ok) throw new Error(`téléchargement ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
