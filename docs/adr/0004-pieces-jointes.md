# ADR 0004 — Stockage des fichiers (à trancher en Phase 0)

**Statut** : proposé

La réplication CouchDB de RxDB gère mal les pièces jointes. Le spike compare :
1. attachments CouchDB natifs ;
2. stockage objet (MinIO sur serveur local, Cloudflare R2 en cloud) référencé par hash,
   avec cache `Cache API` côté client.

La décision sera consignée ici après le spike.
