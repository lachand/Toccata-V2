# ADR 0014 — Orchestration : suivi, miroir, pilotage, retours (Phase 5)

Statut : accepté.

## Suivi (`/activities/:id/monitor`)

- **Résumé pur** (`monitor/summary.ts`) : pour chaque groupe, étape du membre le plus avancé, chronomètres (heure SERVEUR estimée),
  cartes par colonne, questionnaires envoyés, demandes d'aide, étapes terminées. Seuls comptent les documents des membres du groupe
  (et ceux de l'enseignant pour les retours) : un document venu d'ailleurs, ou un faux retour signé d'un élève, ne fausse rien.
- Écart avec le plan : le résumé est **central** et testé, plutôt qu'une `MonitorTile` par module d'application ; ajouter une application
  au suivi se fait dans `summary.ts`. À reprendre si des applications tierces arrivent.
- Tri par urgence : demandes d'aide, puis chrono le plus proche de la fin, puis nom. Une demande d'aide **se lève** quand l'enseignant
  a répondu après elle (retour plus récent) ou que l'élève change de statut.
- **Présence** : un élève qui ouvre la séance sans rien toucher apparaît au suivi ; au bout de 2 s sans position reçue, son point de
  départ est enregistré (si le serveur avait déjà un état, il l'emporte au rattachement : le conflit de réplication donne raison au serveur).
- **Mode projecteur** (`?projecteur`) : mêmes tuiles, grandes, sans contrôle ni navigation, plein écran à la demande.

## Miroir (`/activities/:id/monitor/:instanceId`)

Écran d'un participant tel qu'il le voit (même `resolve`, mêmes `Runtime`), en direct, en **lecture seule garantie deux fois** : le
conteneur est `inert` (ni clic, ni focus, ni frappe) et le magasin refuse toute écriture.

## Pilotage (micro-orchestration)

Chaque geste est un document ou une surcharge de l'INSTANCE visée, donc visible des élèves par la réplication :
- **chrono** (+1, +5 min, réinitialiser) : met à jour l'état partagé ; un chrono qui tourne continue de tourner ; un chrono fini ou arrêté
  est remis en pause avec le temps rendu ;
- **message** (bandeau fermable) et **attention** (recouvrement `alertdialog`, contenu `inert`, Échap sans effet, levée par l'enseignant) :
  `broadcast`, un document par mode ;
- **verrou de l'étape suivante** pour un groupe : surcharge (`setStepLocked`), le script commun ne bouge pas ;
- **retour** sur l'étape : commentaire et validation, `feedback`, un document par étape.
Les actions de la barre s'appliquent à tous les groupes ou à ceux qui sont cochés.

## Remise et retours

L'élève marque l'étape « terminée » ou « besoin d'aide » et donne un ressenti de 1 à 4 (`submission`). Le **retour de l'enseignant est un
document distinct** (`feedback`) : dans l'ébauche initiale il aurait été un tableau `comments` de la remise, que l'élève, propriétaire
du document, aurait pu réécrire (retour, « validé »). `broadcast` et `feedback` sont **réservés aux propriétaires** (règle CouchDB
`owner_only`, test d'intégration) et le client n'accepte que ceux dont l'auteur est le propriétaire de l'activité.

## Télécommande (`/remote/:id`)

Même données et mêmes gestes que le suivi, sans navigation latérale, cibles ≥ 44 px, vérifiée à 360 px sans débordement.

## Notifications

- Dans l'application : bandeau et compteur des demandes d'aide ; **notification du navigateur** (API `Notification`, permission demandée sur
  un geste) quand une demande arrive, tant que l'application reste ouverte, même en arrière-plan.
- **Web Push (hors application) : non fait.** Il faut un écouteur serveur du flux `_changes` des bases d'instance, un stockage
  d'abonnements VAPID et des règles de désabonnement ; à traiter avec la mise en production (Phase 8).

## Limites connues

- Pas de journal de recherche des gestes (Phase 7).
- Les noms d'élèves viennent des classes de l'enseignant (relues une fois par connexion) ; hors ligne sans cache, le suivi affiche « Un élève ».
- Accessibilité vérifiée avec axe sur les pages réelles en français ; l'anglais passe par les mêmes composants.
