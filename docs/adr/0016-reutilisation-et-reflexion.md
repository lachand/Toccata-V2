# ADR 0016 — Réutilisation, bilan et données personnelles (Phase 7)

Statut : accepté. Réponse à D8 (réutilisation) et D9 (notes et réflexion) de l'article.

## Échange d'activités

- **Fichier `.toccata`** : ZIP (`activity.json` + `files/file_<sha256>`). Limites à la lecture : archive 200 Mo, JSON 5 Mo, 100 fichiers,
  25 Mo par fichier ; seules les entrées attendues sont décompressées (pas de traversée de chemin) ; l'empreinte d'un fichier doit égaler son nom.
- **Import = copie neuve** : tous les identifiants sont régénérés (`instantiateBundle`), les références réécrites, les ressources ou
  applications orphelines écartées, le blocage d'étape neutralisé s'il pointe hors du lot, les consignes assainies (DOMPurify). Rien d'un
  élève n'est exporté : ni groupe, ni réponse, ni note.
- **Duplication** = export + import en mémoire. **Lignée** : `forkedFrom` conservé sur l'activité copiée depuis un modèle.

## Bibliothèque de modèles

- Base CouchDB `library`, rôle `teacher` (ajouté aux jetons des enseignants, qui gardent un rôle `owner:` unique) : tout enseignant lit,
  seul l'auteur modifie ou retire, taille bornée (< 1 Mo) par la règle d'écriture.
- Un modèle est un lot **sans fichiers** (les liens web sont conservés) : il évite de dupliquer des pièces jointes d'un enseignant à l'autre
  sans contrôle d'accès par fichier. L'interface indique combien de fichiers sont laissés de côté.
- Provisionnée par le service en mode `cloud` seulement ; **la bibliothèque est donc en ligne seulement** (pas répliquée sur le serveur de classe).

## Journal de séance et bilan

- Chaque geste utile écrit un document `event` dans la base de l'instance, **en ajout seul** (règle CouchDB, testée) : code d'action neutre,
  objet = identifiant, méta scalaires. Écriture best-effort : un journal indisponible n'empêche jamais de travailler.
- **« Prévu vs réalisé »** (`buildReview`, fonction pure testée) : prévu = somme des minuteurs de l'étape ; réalisé = temps entre deux
  entrées successives dans l'étape, médiane des membres puis des groupes (la dernière étape n'a pas de fin connue : aucune durée inventée) ;
  aides, remises (dernière valeur par élève), modifications en direct, groupes à variante. Les traces d'auteurs hors du groupe sont ignorées.
- **Bilan structuré** : trois questions, stockées dans la note privée de l'enseignant (base `teacher_<id>`).

## Export de recherche et données personnelles

- Export CSV / JSON : participants pseudonymisés (`P01`… propres à l'export, `T` pour l'enseignant), groupes `G1`…, aucun nom, aucun contenu
  d'élève ; cellules CSV neutralisées contre l'injection de formule. **Bouton inerte tant que l'enseignant n'a pas confirmé le consentement.**
- **Accès / portabilité** : `GET /api/auth/me/export` (soi-même) et `GET /api/classes/:id/students/:sid/export` (enseignant de la classe).
- **Effacement** : supprimer un élève efface aussi tout ce qu'il a écrit (`authorId`) dans les bases de ses séances.
- Page « Données personnelles » dans l'interface (fr/en, tutoiement côté élève).

## Limites

- L'effacement supprime les documents de l'élève : les cartes de kanban ou mises à jour de texte partagé qu'il a créées disparaissent aussi du groupe.
- Une séance reprise ne journalise pas de nouvelle entrée d'étape (pour ne pas compter l'absence comme du temps passé) : le temps observé
  d'un élève qui a repris est une estimation prudente.
- Le consentement est déclaratif (case à cocher), pas un registre. Pas de Web Push. Modèles : pas de fichiers.
