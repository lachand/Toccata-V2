import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import type { RxStorage } from "rxdb";
import { cacheBlobStore, type BlobStore } from "./blobs";

/** Réglages de la couche données ; les tests remplacent `storage` par une base en mémoire. */
export const dataConfig: { storage: () => RxStorage<unknown, unknown>; multiInstance: boolean; sync: boolean; probe: boolean; syncBaseUrl: string; blobs: () => BlobStore } = {
  storage: () => getRxStorageDexie() as unknown as RxStorage<unknown, unknown>,
  multiInstance: true,
  sync: true,
  probe: true,
  blobs: cacheBlobStore,
  // CouchDB derrière le même domaine que l'interface (proxy Vite en développement, Caddy en production) : pas de CORS.
  syncBaseUrl: "/couch",
};
