#!/usr/bin/env bash
# Restaure une sauvegarde de backup.sh : REMPLACE les données actuelles.
#   ./restore.sh backups/toccata-AAAAMMJJ-HHMMSS.tar.gz [--yes]
set -euo pipefail
cd "$(dirname "$0")" || exit 1
ARCHIVE="${1:-}"; YES=0; [ "${2:-}" = "--yes" ] && YES=1
[ -r "$ARCHIVE" ] || { echo "Usage : ./restore.sh <archive> [--yes]" >&2; exit 2; }
if [ "$YES" != 1 ]; then
  read -r -p "Les données actuelles seront REMPLACÉES par cette sauvegarde. Taper « oui » pour continuer : " a
  [ "$a" = oui ] || { echo "Annulé."; exit 1; }
fi
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
tar xzf "$ARCHIVE" -C "$WORK"
[ -r "$WORK/data.tgz" ] && [ -r "$WORK/env" ] && [ -r "$WORK/secrets.ini" ] || { echo "Archive invalide." >&2; exit 1; }

docker compose down >/dev/null 2>&1 || true
# la configuration d'origine (secrets compris) est restaurée : les jetons et les mots de passe restent valables
( umask 077; cp "$WORK/env" .env; cp "$WORK/secrets.ini" couchdb/secrets.ini )
docker compose up --no-start couchdb >/dev/null
CID="$(docker compose ps -aq couchdb)"
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CID")"
docker run --rm --volumes-from "$CID" -v "$WORK:/backup:ro" --entrypoint sh "$IMAGE" -c 'rm -rf /opt/couchdb/data/* /opt/couchdb/data/.[!.]* 2>/dev/null; tar xzf /backup/data.tgz -C /opt/couchdb && chown -R couchdb:couchdb /opt/couchdb/data'
docker compose up -d
echo "Restauré depuis $ARCHIVE. Vérifiez avec ./doctor.sh."
