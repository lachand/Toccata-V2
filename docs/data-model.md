# Modèle de données

Source de vérité : [`packages/schema`](../packages/schema) (schémas Zod, types, logique pure).
Ce document explique les choix ; en cas de divergence, le code et ses tests font foi.

## Deux types de bases CouchDB (ADR 0003)

| Base | Contenu | Lecture | Écriture |
|---|---|---|---|
| `master_<id>` | Contenu d'une activité : `activity`, `step`, `resource`, `app` | enseignant et participants | enseignant |
| `inst_<id>` | Une instance : `instance`, `participant`, `note`, `submission`, `event`, états d'apps (`timerstate`, `kanbancard`, `yupdate`, `formanswer`) | membres de l'instance et enseignant | membres (leurs propres documents) et enseignant |

Une instance est un groupe d'élèves (ou un élève seul) qui travaille sur le master. Elle n'a
**pas** de copie du contenu : seulement des surcharges.

Un RxDB contient une collection par base CouchDB (`collectionNameFor`). Chaque collection
porte la même **enveloppe** (`id`, `kind`, `updatedAt`) ; la validité complète est vérifiée
par Zod à la lecture (`decodeMasterDocs`, `decodeInstanceDocs`), qui écarte et signale un
document invalide sans interrompre l'application.

## Identifiants

22 caractères base32 en **minuscules**, triables dans le temps (`newId`). Les noms de bases
CouchDB n'acceptent pas les majuscules. L'identifiant de document (`_id`) est cet `id`, sans
préfixe ; le genre est dans le champ `kind`. Documents à identifiant déterminé : `participant`
(l'identifiant de l'utilisateur, un seul état par personne : la reprise d'un autre appareil
écrase le précédent) et `timerstate` (l'identifiant de l'application).

## Instance = surcouche du master (ADR 0002)

```
contenu effectif  =  base  +  surcharges de l'instance

base = master                         si instance.linked
     = instance.snapshot              sinon (contenu figé à la déliaison)
```

`resolve(master, instance, viewer)` calcule ce contenu. Fonction pure, déterministe, sans
mutation. Les surcharges (`instance.overrides`) :

| Champ | Effet |
|---|---|
| `steps[stepId]` | `{hidden, locked, title, instructions, order}` : valeur de l'instance pour cette étape |
| `extraSteps` | étapes propres à l'instance |
| `resources.extra` / `resources.hidden` | ressources ajoutées / ressources héritées masquées |
| `apps.extra` / `apps.hidden` | applications ajoutées / héritées masquées |
| `apps.config[appId]` | fusion superficielle dans `config` ; ignorée (et signalée) si le résultat est invalide |

Règles : la surcharge l'emporte champ par champ ; l'enseignant voit les étapes masquées, pas
l'élève ; les étapes sont triées par clé d'ordre puis identifiant ; une référence orpheline ne
bloque rien et ressort dans `issues`.

### Modifier : « à qui ? » (D5 de l'article)

`planEdit(edit, target, instances)` transforme une modification et une cible en écritures :

- cible **toute la classe** : une écriture sur le master, vue par toutes les instances
  *liées*. Le plan indique `unreached` (instances déliées, qui ne la recevront pas) et
  `shadowed` (instances liées qui ont déjà leur propre valeur pour ce champ) ;
- cible **instances choisies** : une surcharge par instance, le master ne bouge pas.

`applyToMaster` et `applyToOverrides` appliquent une écriture ; `unlinkInstance` /
`relinkInstance` gèrent la déliaison (instantané du master) et la reliaison. Retirer un
élément hérité le **masque** dans l'instance ; le retirer du master le supprime.

## Propriétés vérifiées par les tests

Sur des centaines de scénarios aléatoires reproductibles (`test/resolve.test.ts`) :

1. `resolve` ne modifie pas ses entrées (entrées gelées) et est déterministe ;
2. un élève ne reçoit jamais d'étape masquée ; chaque étape apparaît une fois, triée ;
3. **modifier le master ou écrire la même modification en surcharge donne le même résultat
   visible** (les deux chemins du « run-time scripting » sont équivalents) ;
4. une instance liée suit le master, une instance déliée ne bouge plus, une instance reliée
   suit de nouveau ;
5. une surcharge d'une instance n'est jamais visible depuis une autre.

## Chronomètre

`timerRemainingMs(state, nowServerMs)` : le temps restant se calcule à partir de l'heure
**serveur** de démarrage, avec une heure locale corrigée par `estimateClockOffset` (échantillon
au plus court aller-retour, façon NTP). L'ancienne version comparait des horloges d'appareils
non synchronisées.

## Limites connues

- `instance.overrides` est un seul document : deux appareils d'enseignant qui le modifient en
  même temps se départagent au dernier écrit. Acceptable tant qu'un seul enseignant pilote une
  instance ; sinon, éclater les surcharges en un document par étape.
- Un document d'instance est limité à 8 Mo par CouchDB (`max_document_size`) ; le texte
  collaboratif est donc découpé en mises à jour (`yupdate`) et compacté (spike c).
- Les fichiers ne sont pas dans ces documents : ils sont référencés par `fileId` (ADR 0004).
