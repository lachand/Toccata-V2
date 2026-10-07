# ADR 0012 — Applications intégrées et contrat `apps-sdk`

Statut : accepté (Phase 3C–3D).

## Contrat (`packages/apps-sdk`)

Une application est un `AppModule<T>` : `type`, `useLabels()` (textes, côté application), `Icon`, `defaultConfig()`,
`Editor` (facultatif) et `Runtime`. Le même `Runtime` sert à l'aperçu de l'éditeur et à la séance (principe de l'article :
même interface pour préparer et pour jouer). Le registre est typé (`createRegistry`) ; l'assistant d'ajout liste ce qui
est enregistré. `packages/apps-sdk` ne contient aucun texte.

## Données d'exécution

Une application lit et écrit via un `InstanceStore` (`watch`, `put`, `remove`, `serverNow`) fourni par l'hôte :
- **aperçu de l'enseignant** : instance **locale, non répliquée** (`Workspace.previewStore`, collection `preview_<id>`) ;
- **séance** (Phase 4) : la base `inst_<id>`, mêmes documents (`timerstate`, `kanbancard`, `yupdate`, `formanswer`).

## Applications

| Type | Données | Points d'attention |
|---|---|---|
| `timer` | `timerstate` (un document, état partagé) | calculé avec l'heure **serveur** estimée (`Workspace.calibrateClock`, en-tête `Date` de CouchDB, échantillon au plus court aller-retour) ; états `idle/running/paused`, jamais d'horloge d'appareil |
| `kanban` | 1 `kanbancard` par carte, ordre fractionnaire | déplacer = 1 écriture, donc pas de conflit sur le tableau entier ; glisser (dnd-kit) **et** sélecteur « déplacer vers » au clavier ; carte dont la colonne a disparu → première colonne |
| `text` | `yupdate` en ajout seul (Yjs) | commutatif et idempotent ; historique = celui de Yjs ; chargé à la demande ; compactage par instantané : non fait (à prévoir si les documents grossissent) |
| `form` | `formanswer` (un par participant) | brouillon enregistré au fil de la saisie, envoi validé (obligatoires), champs verrouillés après envoi ; l'étape peut être **bloquée** (`blockedByAppId`, appliqué en Phase 4) ; type « fichier » : Phase 4 |
| `external` | — | voir ADR 0011 |

## Fichiers (ADR 0004 mis en œuvre)

SHA-256 côté client, copie locale (Cache API) puis file d'envoi (`uploads`, vol unique), envoi `PUT file_<hash>` +
pièce jointe native `blob`. Un autre appareil reçoit le document de ressource par la réplication et le contenu à la
demande (puis en cache). Taille maximale : 25 Mo. Pas de SVG affiché en ligne.

## Notes privées de l'enseignant

Base `teacher_<id>` (propriétaire seul, lecture comprise, jamais les élèves : CouchDB n'a pas d'ACL par document, donc
les notes ne peuvent pas vivre dans une base que les élèves lisent). Créée à l'inscription, vérifiée à chaque connexion.
Une note par cible (activité ou étape) avec un drapeau (A bien fonctionné / À améliorer / Marque-page). Les notes
d'une séance (D9, « prévu vs réalisé ») viendront avec les instances.
