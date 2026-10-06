import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from "rxdb";
import { RxDBAttachmentsPlugin } from "rxdb/plugins/attachments";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { replicateCouchDB, getFetchWithCouchDBAuthorization } from "rxdb/plugins/replication-couchdb";
import type { Fetcher } from "./couch.js";

addRxPlugin(RxDBAttachmentsPlugin);

let n = 0;
/** Base RxDB en mémoire (en prod : stockage Dexie/IndexedDB ; la logique de réplication est identique). */
export async function makeDb(label: string): Promise<RxDatabase> {
  return createRxDatabase({
    name: `${label}${Date.now()}${n++}`.toLowerCase(),
    storage: getRxStorageMemory(),
    multiInstance: false,
  });
}

export const noteSchema = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    authorId: { type: "string" },
    text: { type: "string" },
  },
  required: ["id", "authorId", "text"],
} as const;

export function replicate<T>(
  collection: RxCollection<T>,
  url: string,
  fetchFn: Fetcher,
  id: string,
  live = true,
) {
  return replicateCouchDB<T>({
    replicationIdentifier: id,
    collection,
    url,
    fetch: fetchFn as typeof fetch,
    live,
    pull: { heartbeat: 1000 },
    push: {},
  });
}

export async function until(cond: () => Promise<boolean> | boolean, ms = 15000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error("until: condition non atteinte");
}
export { getFetchWithCouchDBAuthorization };
