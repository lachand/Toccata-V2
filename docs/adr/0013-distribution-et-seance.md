# ADR 0013 — Distribution et séance (Phase 4)

Statut : accepté.

## Distribution

- Un **groupe = une instance** de l'activité : une base `inst_<id>` approvisionnée par le serveur (`POST /activities/:id/instances`)
  et un document de **définition** (`kind: "instance"`, identifiant = celui de l'instance) écrit par l'enseignant : nom, membres,
  `linked`, surcharges. Trois répartitions : classe entière, groupes (affectation élève par élève), un par élève.
- **Le serveur reste l'autorité des droits** (rôles `inst:<id>:member`) ; la liste des membres du document est un affichage.
- **Seul le propriétaire écrit la définition** : règle CouchDB (`owner_only`) **et** lecture défensive (`Workspace.instance$` ne
  retient que le document dont l'auteur est le propriétaire de l'activité). Sans cela un élève, qui écrit dans sa base, pourrait
  se donner des surcharges ou délier son instance.
- Un état de participant porte l'identifiant de la personne (`participant_id`) : personne ne prend la place d'un autre.
- Découverte : l'enseignant reçoit ses groupes avec `GET /activities` (instances et membres) ; l'élève ses inscriptions avec
  `GET /me/memberships`. Le client relit ces listes à la connexion et toutes les minutes (nouveau groupe, inscription retirée).

## Séance de l'élève

- Contenu = `resolve(master, définition, élève)` : fonction pure, réactive (une modification de l'enseignant apparaît en direct).
- **Script linéaire, un élément ouvert à la fois** (principe de l'article) : l'étape en cours, ses consignes, puis un sélecteur
  d'éléments (ressources et applications de l'activité et de l'étape) dont un seul est ouvert.
- **Progression** (`run/progress.ts`, testée) : une étape verrouillée ferme le chemin ; une étape bloquée par un questionnaire reste
  accessible mais retient les suivantes jusqu'à l'envoi.
- **Reprise / roaming (D6)** : l'état du participant (étape, élément ouvert, appareil) est un document de l'instance, répliqué ; un
  autre appareil rouvre au même endroit. Les données arrivent dans le désordre : tant que la personne n'a rien touché, la position
  est recalculée à chaque arrivée de données ; après, seule sa propre navigation compte et c'est elle qui est enregistrée (sans quoi
  un appareil neuf écraserait la position par « étape 1 »).
- Les applications utilisent le même contrat qu'à l'aperçu (ADR 0012) avec `Workspace.instanceStore` : documents répliqués dans
  `inst_<id>`, auteur d'origine conservé quand un autre participant modifie un document partagé (kanban).

## Modification en direct ciblée (D5)

`useTargetedEdit` s'appuie sur `planEdit` : « tout le monde » écrit dans le master (vu par les groupes qui le suivent) ; « groupes
choisis » écrit dans leurs surcharges. Le retour dit combien de groupes **ne suivent plus** le script (non atteints) et combien
**gardent leur propre version**. Portée actuelle : titre, consignes, œil (masquer), verrou d'étape. Un groupe peut être **délié**
(instantané du script) puis relié.

## Limites connues

- Les élèves n'ajoutent pas encore de ressources ou d'applications dans leur instance (article §4) : la définition est réservée à
  l'enseignant ; il faudra des documents d'ajout signés par l'élève.
- Questionnaire : pas de réponse par fichier.
- Pas de suppression de groupe ni d'archivage (aucune route serveur).
- L'écran de suivi, le miroir et la télécommande sont la Phase 5.
