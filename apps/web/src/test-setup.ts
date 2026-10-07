import "@testing-library/jest-dom/vitest";
import { getRxStorageMemory } from "rxdb/plugins/storage-memory";
import { dataConfig } from "./data/config";

// Les tests n'ouvrent jamais IndexedDB : base en mémoire, un onglet, pas de synchronisation vers un vrai serveur.
dataConfig.storage = () => getRxStorageMemory() as never;
dataConfig.multiInstance = false;
dataConfig.sync = false; // la réplication est couverte par les tests d'intégration et e2e, avec un vrai CouchDB
