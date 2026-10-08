#!/usr/bin/env bash
# Sauvegarde complète (données CouchDB + configuration et secrets) dans backups/toccata-AAAAMMJJ-HHMMSS.tar.gz.
# CouchDB est arrêté quelques secondes pour obtenir une copie cohérente. Rotation : les 14 dernières sont gardées.
#   ./backup.sh [--keep N] [--dir DOSSIER]      ./backup.sh --install-timer   (sauvegarde quotidienne systemd, root)
set -euo pipefail
cd "$(dirname "$0")" || exit 1
KEEP=14 DIR="$PWD/backups" TIMER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP="$2"; shift 2 ;;
    --dir) DIR="$(mkdir -p "$2" && cd "$2" && pwd)"; shift 2 ;;
    --install-timer) TIMER=1; shift ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

if [ "$TIMER" = 1 ]; then
  [ "$(id -u)" = 0 ] && command -v systemctl >/dev/null || { echo "root et systemd sont requis" >&2; exit 1; }
  for f in toccata-backup.service toccata-backup.timer; do sed "s|@DIR@|$PWD|g" "systemd/$f" > "/etc/systemd/system/$f"; done
  systemctl daemon-reload && systemctl enable --now toccata-backup.timer
  echo "Sauvegarde quotidienne installée (systemctl list-timers toccata-backup.timer)."
  exit 0
fi

[ -e .env ] || { echo "Pas de .env : rien à sauvegarder (lancez d'abord ./install.sh)." >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DIR"
WORK="$(mktemp -d "$DIR/.work.XXXXXX")"
trap 'rm -rf "$WORK"; docker compose start couchdb >/dev/null 2>&1 || true' EXIT

CID="$(docker compose ps -aq couchdb)"
[ -n "$CID" ] || { echo "Le conteneur couchdb n'existe pas." >&2; exit 1; }
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CID")"
docker compose stop couchdb >/dev/null
docker run --rm --volumes-from "$CID" -v "$WORK:/backup" --entrypoint tar "$IMAGE" czf /backup/data.tgz -C /opt/couchdb data
docker compose start couchdb >/dev/null
cp .env "$WORK/env"; cp couchdb/secrets.ini "$WORK/secrets.ini"
grep -E '^TOCCATA_VERSION=' .env > "$WORK/VERSION" || true

OUT="$DIR/toccata-$STAMP.tar.gz"
( umask 077; tar czf "$OUT" -C "$WORK" . )
echo "Sauvegarde : $OUT ($(du -h "$OUT" | cut -f1)) — contient les secrets : stockez-la hors du serveur."

# rotation
# shellcheck disable=SC2012
ls -1t "$DIR"/toccata-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f --
