import { parseBundle, type Bundle } from "@toccata/schema";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { MAX_FILE_BYTES, sha256Hex } from "../data/files";

/** Limites à la lecture d'une archive reçue : elle vient de l'extérieur, donc rien n'est présumé. */
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 100;
const FILE_ENTRY = /^files\/(file_[0-9a-f]{64})$/;

export type ImportErrorCode = "not_toccata" | "unsupported_version" | "invalid" | "too_large" | "file_mismatch";
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
  }
}

/** `.toccata` = archive ZIP : `activity.json` (le lot) et `files/<empreinte>` (un fichier par empreinte). */
export async function packBundle(bundle: Bundle, files: ReadonlyMap<string, Blob>): Promise<Blob> {
  const entries: Record<string, Uint8Array> = { "activity.json": strToU8(JSON.stringify(bundle)) };
  for (const [id, blob] of files) entries[`files/${id}`] = new Uint8Array(await blob.arrayBuffer());
  const zipped = zipSync(entries, { level: 6 });
  return new Blob([zipped as BlobPart], { type: "application/x-toccata" });
}

export async function unpackBundle(archive: Blob): Promise<{ bundle: Bundle; files: Map<string, Blob> }> {
  if (archive.size > MAX_ARCHIVE_BYTES) throw new ImportError("too_large");
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await archive.arrayBuffer()), {
      // seules les entrées attendues, et de taille raisonnable, sont décompressées (protège des archives piégées)
      filter: (f) => (f.name === "activity.json" ? f.originalSize <= MAX_JSON_BYTES : FILE_ENTRY.test(f.name) && f.originalSize <= MAX_FILE_BYTES),
    });
  } catch {
    throw new ImportError("not_toccata");
  }
  const raw = entries["activity.json"];
  if (!raw) throw new ImportError("not_toccata");
  let json: unknown;
  try {
    json = JSON.parse(strFromU8(raw));
  } catch {
    throw new ImportError("not_toccata");
  }
  const parsed = parseBundle(json);
  if (!parsed.ok) throw new ImportError(parsed.reason);

  const files = new Map<string, Blob>();
  for (const [name, data] of Object.entries(entries)) {
    const m = FILE_ENTRY.exec(name);
    if (!m) continue;
    if (files.size >= MAX_FILES) throw new ImportError("too_large");
    const blob = new Blob([data as BlobPart]);
    // le nom EST l'empreinte du contenu : une archive dont le contenu ne correspond pas est refusée
    if (`file_${await sha256Hex(blob)}` !== m[1]) throw new ImportError("file_mismatch");
    files.set(m[1]!, blob);
  }
  return { bundle: parsed.bundle, files };
}
