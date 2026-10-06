# ADR 0001 — Pile technique

**Statut** : accepté

- Front : React 19 + Vite + TypeScript strict.
- Données : RxDB (stockage Dexie/IndexedDB, gratuit) répliqué avec CouchDB.
- Texte collaboratif : TipTap + Yjs (CRDT), mises à jour stockées comme documents.
- UI : Tailwind CSS + shadcn/ui (Radix), dnd-kit.
- PWA : vite-plugin-pwa.
- Tout composant doit être gratuit et sous licence MIT/Apache/BSD/ISC (CKEditor 5 et
  jQWidgets écartés).

**Raison** : conserver l'architecture à trois couches de l'article (cloud, serveur local,
appareil) et la résilience réseau, avec des outils maintenus.
