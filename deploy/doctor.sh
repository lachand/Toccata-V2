#!/usr/bin/env bash
# Diagnostic : conteneurs, santé, HTTPS, disque, heure, sauvegardes. Code de sortie 1 si un contrôle échoue.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
FAIL=0
ok() { printf ' \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf ' \033[33m!\033[0m %s\n' "$*"; }
bad() { printf ' \033[31m✘\033[0m %s\n' "$*"; FAIL=1; }

[ -e .env ] || { bad "pas de .env : lancez ./install.sh"; exit 1; }
set -a; . ./.env; set +a
command -v docker >/dev/null && docker info >/dev/null 2>&1 && ok "Docker répond" || { bad "Docker ne répond pas"; exit 1; }

for svc in couchdb auth web; do
  state="$(docker compose ps --format '{{.State}}/{{.Health}}' "$svc" 2>/dev/null | head -1)"
  case "$state" in running/healthy|running/) ok "$svc : $state" ;; *) bad "$svc : ${state:-absent} (docker compose logs $svc)" ;; esac
done

code="$(curl -ks -o /dev/null -w '%{http_code}' --resolve "${SERVER_HOST}:${HTTPS_PORT}:127.0.0.1" "https://${SERVER_HOST}:${HTTPS_PORT}/api/health" 2>/dev/null)"
[ "$code" = 200 ] && ok "HTTPS + API : /api/health répond 200" || bad "https://${SERVER_HOST}:${HTTPS_PORT}/api/health répond ${code:-rien}"
code="$(curl -ks -o /dev/null -w '%{http_code}' --resolve "${SERVER_HOST}:${HTTPS_PORT}:127.0.0.1" "https://${SERVER_HOST}:${HTTPS_PORT}/" 2>/dev/null)"
[ "$code" = 200 ] && ok "interface servie" || bad "interface : code ${code:-rien}"
code="$(curl -ks -o /dev/null -w '%{http_code}' --resolve "${SERVER_HOST}:${HTTPS_PORT}:127.0.0.1" "https://${SERVER_HOST}:${HTTPS_PORT}/couch/_all_dbs" 2>/dev/null)"
[ "$code" = 401 ] && ok "CouchDB protégé (401 sans jeton)" || bad "CouchDB : /couch/_all_dbs répond ${code:-rien} (401 attendu)"

if [ "${TLS_DIRECTIVE:-}" != "tls internal" ] && [ "$SERVER_MODE" = cloud ] && command -v getent >/dev/null; then
  getent hosts "$SERVER_HOST" >/dev/null && ok "le DNS résout $SERVER_HOST" || warn "le DNS ne résout pas $SERVER_HOST (nécessaire pour Let's Encrypt)"
fi
used="$(df -P . | awk 'NR==2{gsub("%","",$5); print $5}')"
[ "$used" -lt 85 ] && ok "disque : ${used}% utilisé" || warn "disque : ${used}% utilisé"
if command -v timedatectl >/dev/null; then
  [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null)" = yes ] && ok "heure synchronisée" || warn "heure non synchronisée (les jetons et les chronomètres en dépendent : installez chrony)"
fi
last="$(ls -1t backups/toccata-*.tar.gz 2>/dev/null | head -1)"
if [ -z "$last" ]; then warn "aucune sauvegarde (./backup.sh)"; else
  age=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 86400 ))
  [ "$age" -le 2 ] && ok "dernière sauvegarde : il y a ${age} j" || warn "dernière sauvegarde : il y a ${age} j"
fi
if [ "$SERVER_MODE" = local ]; then
  info="$(curl -ks --resolve "${SERVER_HOST}:${HTTPS_PORT}:127.0.0.1" "https://${SERVER_HOST}:${HTTPS_PORT}/api/server-info" 2>/dev/null)"
  case "$info" in *'"upstream":"online"'*) ok "amont (cloud) joignable" ;; *) warn "amont non joignable : ${info:-pas de réponse} (normal hors ligne)" ;; esac
fi
exit "$FAIL"
