# Glossaire fr / en

Termes du domaine, tirés de l'article (Lachand, Michel, Tabard, 2019). À respecter dans
toute l'interface, la documentation et les messages d'erreur.

| Français | English | Remarque |
|---|---|---|
| activité | activity | Unité pédagogique composée d'étapes |
| étape | step | Élément de la séquence (« sub-activity » dans l'article) |
| script | script | Structure d'une activité, avant la séance |
| scénarisation | scripting | « primo-scripting » avant, « run-time scripting » pendant |
| orchestration | orchestration | |
| ressource | resource | Document : image, vidéo, PDF, page web, fichier |
| application | app | Outil intégré : texte, chronomètre, kanban, questionnaire |
| chronomètre | timer | Compte à rebours partagé |
| kanban | kanban | Tableau de cartes (« post-it ») |
| questionnaire | questionnaire | Application de formulaire |
| consigne | instructions | Texte donné aux élèves pour une étape |
| activité maître | master activity | Version de référence de l'enseignant |
| instance | instance | Copie liée à l'activité maître, par groupe ou par élève |
| distribuer | hand out | Donner l'activité aux élèves |
| groupe | group | |
| modèle | template | Activité partageable sans participants |
| enseignant / enseignante | teacher | Rôle |
| élève | student | Rôle |
| reprise | resume | Retrouver l'activité là où elle a été laissée |
| masquer / afficher (une étape) | hide / show | Icône œil |
| figer les écrans | freeze screens | Micro-orchestration |
| télécommande | remote | Vue téléphone de l'enseignant |
| serveur de classe | classroom server | Serveur local |
| hors ligne | offline | |
| synchronisé | synced | |
| notes | notes | Annotations de l'enseignant |

## Registre en français

| Public | Forme | Exemples |
|---|---|---|
| **Élèves** | **tutoiement** | « Ton enseignant voit ton avancement », « Tes changements sont gardés », « J'ai besoin d'aide » |
| Enseignants | vouvoiement (par défaut, à confirmer) | « Vous pouvez masquer une étape », « Votre activité est synchronisée » |
| Documentation et erreurs techniques | vouvoiement | |

Quand un message s'adresse à un groupe d'élèves (une consigne rédigée par l'enseignant),
c'est l'enseignant qui choisit ; l'interface elle-même parle à un élève : « tu ».

Un même texte ne doit pas servir aux deux publics : les messages affichés aux élèves et aux
enseignants sont des entrées distinctes du catalogue, même quand l'anglais est identique.

## Genre

Éviter « enseignant(e) » et le point médian dans les phrases. Quand le genre de la personne
est connu, utiliser un `select` ICU :
`{gender, select, female {Ton enseignante} male {Ton enseignant} other {Ton enseignant·e}} voit ton avancement`.
Sans information, préférer nommer la personne (« Mme Durand voit ton avancement »).

## Règle générale

Un seul registre par public et par langue, appliqué partout : libellés, messages d'erreur,
infobulles, e-mails.
