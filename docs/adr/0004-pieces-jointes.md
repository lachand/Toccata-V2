# ADR 0004 — Stockage des fichiers

**Statut** : accepté (spike b, voir `docs/phase0-spikes.md`)

## Constat
Les pièces jointes RxDB sont **inutilisables** avec `replication-couchdb` : le push envoie les
« stubs » `_attachments` sans contenu, CouchDB rejette le `_bulk_docs` et le plugin lève
`responseJson.forEach is not a function`. Le document n'atteint jamais le serveur.

## Décision
Les fichiers sont des **pièces jointes natives CouchDB** d'un document `file_<sha256>`
(contenu adressé), envoyés en HTTP direct (`PUT /<db>/file_<sha>/blob?rev=…`), hors du
plugin de réplication :
- l'enveloppe est un document RxDB normal (`{kind:"file", mime, size, authorId}`) ;
- l'envoi est **idempotent** (409 = déjà présent) et validé par `validate_doc_update` ;
- un autre groupe ne peut pas télécharger le fichier (403) ;
- la réplication **CouchDB ↔ CouchDB** (cloud ↔ serveur local) transporte les pièces jointes
  nativement, y compris 5 Mo testés.

## À construire en Phase 3
File d'envoi hors ligne : le fichier est gardé localement (IndexedDB) tant qu'il n'est pas
parti, avec un état `pending|uploaded` ; téléchargement à la demande avec cache.

## Note d'exploitation
Pour `_replicate` / `_replicator` entre conteneurs, indiquer **source et cible par URL
complète** : un nom de base local est résolu en `http://any:5984` (NXDOMAIN) avec
`bind_address` par défaut.
