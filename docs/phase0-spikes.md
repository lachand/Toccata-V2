# Phase 0 — résultats des spikes

Tous exécutés contre **deux vrais CouchDB 3.4.3** (Docker : « cloud » et « local ») et
RxDB 17.6. Lancer : voir `spikes/README.md`. **24 tests, tous verts.** Les spikes tournent
sous Node avec le stockage mémoire de RxDB ; en production le stockage sera Dexie/IndexedDB
(même logique de réplication).

| | Question | Résultat | Décision |
|---|---|---|---|
| a | RxDB ↔ CouchDB avec JWT et isolation ? | **OK** (13 + 3 tests) : jetons expirés/forgés refusés ; élève lit le master mais n'y écrit pas ; un groupe ne lit/écrit pas la base d'un autre ; usurpation d'`authorId` et modification de document `teacherOnly` refusées ; renouvellement du jeton sans perdre les écritures hors ligne | ADR 0003 (révisé : base par master + base par instance) |
| b | Pièces jointes ? | RxDB attachments **inutilisables** avec la réplication CouchDB. Pièces jointes natives CouchDB adressées par hash : OK (5 Mo, idempotent, isolé, répliqué cloud→local) | ADR 0004 |
| c | Texte collaboratif ? | **OK** : Yjs + documents append-only ; deux éditeurs hors ligne convergent ; compaction 150 → 1 document, un nouveau venu reconstruit le même texte | TipTap + Yjs confirmé |
| d | Bascule local → cloud → hors ligne ? | **OK** : bascule en quelques secondes, aucune écriture perdue, le serveur local rattrape son retard. Identifiant de réplication par endpoint (séquences non comparables) | `SyncManager` à reprendre en Phase 6 |
| e | Apps externes en iframe ? | Vikidia (CS3 de l'article), Google Docs, YouTube watch, Scratch, Canva **bloqués** ; Framapad/Framacalc/GeoGebra/Wikipédia OK | ADR 0005 (modes iframe / fenêtre liée / lien) |

## Pièges découverts (à ne pas redécouvrir)
1. Claim JWT **imbriquée** `_couchdb.roles`, pas une clé plate.
2. Noms de bases en **minuscules**.
3. `replication-couchdb` lève un rejet non géré (`results` indéfini) sur 401/403/5xx en
   lecture : envelopper `fetch` (`guardedFetch` dans `spikes/src/couch.ts`).
4. Jeton invalide → 400 **ou** 401.
5. `_replicate` entre conteneurs : URLs complètes (cf. ADR 0004).
6. Le montage de `local.ini` ne doit pas être en lecture seule avec l'image officielle
   (le conteneur s'arrête sans message).
7. Docker Hub peut renvoyer 429 : utiliser `COUCHDB_IMAGE=public.ecr.aws/docker/library/couchdb:3.4`.

## Non vérifié
- Limite de connexions simultanées d'un navigateur (HTTP/1.1 vs HTTP/2) avec beaucoup de
  réplications live enseignant — à mesurer avec Playwright + Caddy.
- Stockage Dexie/IndexedDB réel et comportement iOS Safari (éviction du stockage).

## Maquettes d'interface
Propositions v0 (cinq écrans, deux directions « Partition » et « Atelier ») : [`design/maquettes.html`](design/maquettes.html), à ouvrir dans un navigateur.
