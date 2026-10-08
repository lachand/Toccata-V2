# Feuille de route

| Phase | Objet |
|---|---|
| 0 | Cadrage, dépôt, spikes de risque, ADR — **terminée**, voir [`phase0-spikes.md`](phase0-spikes.md) |
| 1 | Fondations : monorepo, modèle de données (`packages/schema`), design system (`packages/ui`), coque PWA hors ligne et i18n fr/en (`apps/web`), tests e2e — **terminée** |
| 2 | Auth, rôles, droits CouchDB — **terminée** : service (`apps/auth`), connexion/inscription/classes dans `apps/web`, session hors ligne ; testée de bout en bout (navigateur → interface → service → CouchDB) |
| 3 | Scripting — **terminée** : liste d'activités et éditeur d'étapes (glisser-déposer, texte riche), ressources (liens, fichiers), assistant d'ajout unique, applications (minuteur, kanban, texte partagé, questionnaire, application web), notes privées ; ADR 0010–0012 |
| 4 | Distribution et exécution — **terminée** : groupes (instances), séance de l'élève (une étape et un élément à la fois), questionnaire bloquant, reprise entre appareils, modification en direct ciblée ; ADR 0013 |
| 5 | Orchestration — **terminée** : suivi en direct et mode projecteur, miroir en lecture seule, pilotage (chrono, message, attention, verrou, retours), remise de l'élève, télécommande mobile ; ADR 0014 (Web Push reste à faire) |
| 6 | Résilience réseau — **terminée** : serveur de classe (réplication entre serveurs, authentification locale, comptes en lecture seule), indicateur d'état réel, paquet Docker/Caddy, guide ; ADR 0015 (point d'accès Wi-Fi et certificat réel non testés faute de matériel) |
| 7 | Réutilisation et réflexion — **terminée** : fichier `.toccata` (export, import, duplication), bibliothèque de modèles partagés entre enseignants, journal de séance, bilan « prévu vs réalisé » avec notes structurées, export de recherche (consentement), données personnelles (export et effacement) ; ADR 0016 (modèles sans fichiers, bibliothèque en ligne seulement) |
| 8 | Qualité et mise en production — **terminée** : paquet `deploy/` (installation, mise à jour avec retour arrière, sauvegarde/restauration, diagnostic), images multi-architecture et release, CI (lint, audit, budget de poids, fumée de production, charge), accessibilité de toutes les routes fr/en, guides enseignant et déploiement ; ADR 0017 (relecture linguistique native, Let's Encrypt réel et Raspberry Pi restent à faire) |

Directions de conception de l'article (D1–D9) : appareil quelconque, mobilité, résilience
réseau, planification, distribution et modification en direct, continuité entre séances,
rôles, réutilisation, notes et réflexion.
