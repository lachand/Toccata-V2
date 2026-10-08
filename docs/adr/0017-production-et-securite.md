# ADR 0017 — Mise en production et sécurité (Phase 8)

Statut : accepté.

## Décisions

- **Un seul paquet d'installation** (`deploy/`) pour le cloud et le serveur de classe : mêmes images (`toccata-web` = interface + Caddy, `toccata-auth`), mêmes scripts,
  seule la variable `SERVER_MODE` change. Remplace le paquet `apps/local-server`.
- **« Clé en main »** : `install.sh` (secrets générés, jamais saisis ni versionnés ; idempotent), `doctor.sh`, `backup.sh`/`restore.sh` (volume CouchDB + `.env` + clé JWT, rotation, minuterie systemd),
  `update.sh` (sauvegarde, nouvelle version, **retour arrière automatique** si le service n'est pas sain). Hébergement : un VPS + Docker Compose ; HTTPS Let's Encrypt automatique par Caddy.
- **Distribution** : images multi-architecture (amd64 + arm64 pour Raspberry Pi) publiées sur GHCR à chaque étiquette `v*`, avec SBOM et provenance ; archive d'installation et somme de contrôle jointes à la release.
- **Inscription enseignant** fermée par défaut ; en production, `SIGNUP_CODE` est généré à l'installation.
- **Santé** : `GET /api/health` (200/503, sans détail) pour Docker, `doctor.sh` et la supervision.
- **Durcissement relevé par le test de fumée de production** : l'interface d'administration CouchDB (`/couch/_utils`) était joignable via le proxy → désormais 404 avec `_node`, `_config`, `_membership`.
  Variables vides transmises par Compose (`VAR=`) traitées comme absentes par la configuration.

## Vérifié en CI et en local

Fumée sur la pile de production réellement installée (en-têtes HSTS/CSP, CouchDB protégé, inscription fermée sans code, parcours enseignant → élève), cycle sauvegarde → destruction du volume → restauration,
mise à jour avec échec simulé → retour arrière, axe sur toutes les routes (fr, en), 360 px, clavier, budget de poids (JS au démarrage 277 Ko gzip, pages enseignant chargées à la demande),
test de charge (40 élèves / 4 groupes, 0 perte), `pnpm audit`, `gitleaks`, ESLint (règles des hooks React).

## Limites et reste à faire (honnêtement)

- **Non testés ici** : Let's Encrypt réel (réseau/DNS), construction des images dans la CI de GitHub et multi-architecture, Raspberry Pi et point d'accès Wi-Fi, installation sur un VPS réel.
  Les images ont été éprouvées dans ce dépôt avec des binaires construits sur l'hôte (le bac à sable n'a pas accès au registre npm depuis un conteneur) ; le `Dockerfile` de production n'a donc pas été construit de bout en bout ici — la CI (`deploy-smoke`) le fera.
- **Relecture linguistique native** non faite : voir [`docs/i18n-review.md`](../i18n-review.md).
- Pas de Web Push, pas de supervision/alerting intégrée (la sonde `/api/health` est prête), pas de rotation automatisée de la clé JWT, sauvegarde hors site à la charge de l'administrateur.
- `pnpm audit` ne couvre que les vulnérabilités connues ; pas d'audit externe.
