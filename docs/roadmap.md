# Feuille de route

| Phase | Objet |
|---|---|
| 0 | Cadrage, dépôt, spikes de risque, ADR — **terminée**, voir [`phase0-spikes.md`](phase0-spikes.md) |
| 1 | Fondations : monorepo, modèle de données (`packages/schema`), design system (`packages/ui`), coque PWA hors ligne et i18n fr/en (`apps/web`), tests e2e — **terminée** |
| 2 | Auth, rôles, droits CouchDB — **terminée** : service (`apps/auth`), connexion/inscription/classes dans `apps/web`, session hors ligne ; testée de bout en bout (navigateur → interface → service → CouchDB) |
| 3 | Scripting : étapes, ressources, apps (texte, chrono, kanban, questionnaire) |
| 4 | Distribution et exécution : instances, état participant, reprise, propagation ciblée |
| 5 | Orchestration : monitoring, miroir, télécommande, micro-orchestration, retours |
| 6 | Résilience réseau : serveur local, bascule d'endpoint |
| 7 | Réutilisation et réflexion : modèles, import/export, « prévu vs réalisé » |
| 8 | Qualité et mise en production |

Directions de conception de l'article (D1–D9) : appareil quelconque, mobilité, résilience
réseau, planification, distribution et modification en direct, continuité entre séances,
rôles, réutilisation, notes et réflexion.
