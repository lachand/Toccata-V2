import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import type { RxStorage } from "rxdb";

/** Réglages de la couche données ; les tests remplacent `storage` par une base en mémoire. */
export const dataConfig: { storage: () => RxStorage<unknown, unknown>; multiInstance: boolean; sync: boolean; syncBaseUrl: string } = {
  storage: () => getRxStorageDexie() as unknown as RxStorage<unknown, unknown>,
  multiInstance: true,
  sync: true,
  // CouchDB derrière le même domaine que l'interface (proxy Vite en développement, Caddy en production) : pas de CORS.
  syncBaseUrl: "/couch",
};
