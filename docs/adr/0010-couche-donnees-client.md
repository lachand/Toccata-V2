# ADR 0010 — Couche de données du client

Statut : accepté (Phase 3A).

## Décisions

- **Une base RxDB par utilisateur** (`toccata_<userId>`), ouverte à la connexion, fermée à la déconnexion.
  Stockage **Dexie/IndexedDB** en production, **mémoire** dans les tests. `Workspace.acquire` sérialise
  fermeture et ouverture d'un même nom (RxDB refuse deux instances ; React rejoue les effets).
- **Une collection par base CouchDB** (`master_<id>`), schéma d'enveloppe de `@toccata/schema`
  (`id`, `kind`, `updatedAt`) ; la validité complète est vérifiée par Zod à la lecture
  (`decodeMasterDocs`) : un document invalide est écarté, jamais fatal.
- **Registre local** (`registry`) des activités connues : l'application s'ouvre hors ligne sur ses
  données. Au retour du réseau, `GET /api/activities` le complète (nouvel appareil).
- **Toute écriture passe par `Workspace`** (ajout, renommage, masquage, déplacement, suppression
  d'étape). L'interface ne manipule jamais RxDB directement ; les hooks (`useActivities`,
  `useContent`, `useSyncState`) ne font qu'observer.
- **Ordre des étapes** : indexation fractionnaire (`orderBetween`) — déplacer ou insérer n'écrit
  qu'un seul document et ne renumérote rien, donc deux enseignants (ou deux appareils) qui
  réordonnent ne se marchent pas dessus.
- **Création d'une activité** : le serveur approvisionne la base et les droits (`POST /api/activities`),
  puis le client écrit le document d'activité localement ; la réplication le pousse. Création
  impossible hors ligne (le serveur doit approvisionner) ; tout le reste fonctionne hors ligne.
- **Synchronisation** : `replicateCouchDB` en direct par collection, via `/couch` (même origine que
  l'interface : proxy Vite en développement, Caddy en production, donc pas de CORS). `syncFetch`
  enveloppe `session.authorizedFetch` et transforme les lectures refusées (401/403) ou en panne
  (5xx) en exceptions, que la réplication réessaie (spike a).
- **Conflits** : écritures champ par champ (`incrementalPatch`), jamais le document entier.

## Limites connues

- Édition des champs texte à la sortie du champ (blur) : une modification distante reçue pendant
  la frappe n'écrase pas la saisie, mais elle apparaît à la prochaine sélection d'étape.
- Pas encore de résolution d'endpoint local/cloud (Phase 6) : une seule adresse, `/couch`.
- Les élèves n'ouvrent pas encore d'activité (instances en Phase 4).
