#!/usr/bin/env bash
# Met à jour Toccata : sauvegarde, téléchargement des nouvelles images, redémarrage, et RETOUR ARRIÈRE automatique si le service ne devient pas sain.
#   ./update.sh [--version v1.2.3] [--build]
set -euo pipefail
cd "$(dirname "$0")" || exit 1
NEW="" BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in --version) NEW="$2"; shift 2 ;; --build) BUILD=1; shift ;; *) echo "option inconnue : $1" >&2; exit 2 ;; esac
done
[ -e .env ] || { echo "Pas de .env : lancez d'abord ./install.sh" >&2; exit 1; }
OLD="$(sed -n "s/^TOCCATA_VERSION='\(.*\)'$/\1/p" .env)"; OLD="${OLD:-latest}"
NEW="${NEW:-$OLD}"
set_version() { sed -i "s/^TOCCATA_VERSION=.*/TOCCATA_VERSION='$1'/" .env; }
healthy() { for _ in $(seq 1 90); do [ "$(docker compose ps --format '{{.Health}}' auth | head -1)" = healthy ] && return 0; sleep 2; done; return 1; }

./backup.sh
echo "$OLD" > .last-version
set_version "$NEW"
deploy() { if [ "$BUILD" = 1 ]; then docker compose up -d --build; else docker compose pull --quiet && docker compose up -d; fi; }
if deploy && healthy; then echo "Mise à jour réussie ($OLD → $NEW)."; docker image prune -f >/dev/null; exit 0; fi

echo "La mise à jour a échoué (images introuvables ou service malade) : retour à $OLD." >&2
docker compose logs --tail 30 auth >&2 || true
set_version "$OLD"
docker compose up -d
healthy && echo "Retour arrière effectué ($OLD)." >&2 || echo "ATTENTION : toujours pas sain ; restaurez avec ./restore.sh backups/<dernière>." >&2
exit 1
