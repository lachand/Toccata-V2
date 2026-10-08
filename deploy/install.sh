#!/usr/bin/env bash
# Installation clé en main de Toccata (cloud ou serveur de classe) avec Docker Compose.
#
#   ./install.sh                         # interactif
#   ./install.sh --yes --domain toccata.example.org --email admin@example.org      # cloud, sans question
#   ./install.sh --yes --mode classe --domain classe.local --tls internal \
#       --upstream https://toccata.example.org/couch --upstream-user admin --upstream-password '…' --teachers ID1,ID2
#
# Idempotent : si .env existe, rien n'est régénéré (les secrets ne changent jamais). --help pour les options.
set -euo pipefail
cd "$(dirname "$0")" || exit 1

MODE="${TOCCATA_MODE:-cloud}" DOMAIN="${TOCCATA_DOMAIN:-}" EMAIL="${TOCCATA_EMAIL:-}" NAME="${TOCCATA_NAME:-}"
TLS="${TOCCATA_TLS:-acme}" VERSION="${TOCCATA_VERSION:-latest}" YES=0 BUILD=0 START=1 TIMER=0
UPSTREAM="${TOCCATA_UPSTREAM:-}" UP_USER="${TOCCATA_UPSTREAM_USER:-}" UP_PASS="${TOCCATA_UPSTREAM_PASSWORD:-}" TEACHERS="${TOCCATA_TEACHERS:-}"
HTTP_PORT="${HTTP_PORT:-80}" HTTPS_PORT="${HTTPS_PORT:-443}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'Erreur : %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Options :
  --mode cloud|classe     cloud (défaut) ou serveur de classe (copie locale d'un cloud, fonctionne sans Internet)
  --domain NOM            nom de domaine du serveur (DNS déjà pointé vers cette machine pour Let's Encrypt)
  --email ADRESSE         contact pour Let's Encrypt (recommandé)
  --name TEXTE            nom affiché dans l'interface
  --tls acme|internal|fichiers   acme : Let's Encrypt (défaut) · internal : autorité locale de Caddy (classe, tests)
                                 · fichiers : certificat fourni dans certs/fullchain.pem et certs/privkey.pem
  --version ÉTIQUETTE     version des images (défaut : latest)
  --build                 construire les images depuis les sources du dépôt au lieu de les télécharger
  --upstream URL --upstream-user U --upstream-password P --teachers ID1,ID2    (mode classe)
  --backup-timer          installer la sauvegarde quotidienne (systemd, root)
  --no-start              écrire la configuration sans démarrer
  --yes                   ne rien demander (échoue si une information manque)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --tls) TLS="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --upstream) UPSTREAM="$2"; shift 2 ;;
    --upstream-user) UP_USER="$2"; shift 2 ;;
    --upstream-password) UP_PASS="$2"; shift 2 ;;
    --teachers) TEACHERS="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --backup-timer) TIMER=1; shift ;;
    --no-start) START=0; shift ;;
    --yes|-y) YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; die "option inconnue : $1" ;;
  esac
done

ask() { # ask VAR "question" [défaut]
  local var="$1" q="$2" def="${3:-}" cur="${!1:-}"
  [ -n "$cur" ] && return 0
  if [ "$YES" = 1 ]; then [ -n "$def" ] && { printf -v "$var" '%s' "$def"; return 0; }; die "information manquante : $q (utilisez les options, voir --help)"; fi
  local ans; read -r -p "$q${def:+ [$def]} : " ans; printf -v "$var" '%s' "${ans:-$def}"
}

command -v docker >/dev/null || die "Docker n'est pas installé (https://docs.docker.com/engine/install/)."
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 est requis (docker compose)."
command -v openssl >/dev/null || die "openssl est requis pour générer les secrets."
case "$MODE" in cloud|classe) ;; *) die "--mode doit valoir cloud ou classe" ;; esac
case "$TLS" in acme|internal|fichiers) ;; *) die "--tls doit valoir acme, internal ou fichiers" ;; esac

if [ -e .env ]; then
  say "Configuration existante (.env) : les secrets sont conservés."
else
  say "Toccata — installation ($MODE)"
  ask DOMAIN "Nom de domaine du serveur" ""
  [ -n "$DOMAIN" ] || die "un nom de domaine est requis"
  printf '%s' "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+$' || die "nom de domaine invalide"
  if [ "$TLS" = acme ] && [ "$MODE" = cloud ]; then ask EMAIL "E-mail de contact pour Let's Encrypt (facultatif)" "none"; [ "$EMAIL" = none ] && EMAIL=""; fi
  ask NAME "Nom affiché dans l'interface" "$([ "$MODE" = classe ] && echo 'Serveur de classe' || echo 'Toccata')"
  if [ "$MODE" = classe ]; then
    [ "$TLS" = acme ] && TLS=internal   # pas d'accès Internet garanti : autorité locale par défaut
    ask UPSTREAM "Adresse du CouchDB du cloud (ex. https://toccata.example.org/couch)" ""
    ask UP_USER "Compte d'administration du cloud" ""
    ask UP_PASS "Mot de passe d'administration du cloud" ""
    ask TEACHERS "Identifiants des enseignants servis (séparés par des virgules)" ""
  fi
  case "$TLS" in
    acme) TLS_DIRECTIVE="${EMAIL:+tls $EMAIL}" ;;
    internal) TLS_DIRECTIVE="tls internal" ;;
    fichiers) [ -r certs/fullchain.pem ] && [ -r certs/privkey.pem ] || die "placez certs/fullchain.pem et certs/privkey.pem"; TLS_DIRECTIVE="tls /certs/fullchain.pem /certs/privkey.pem" ;;
  esac
  for v in "$DOMAIN" "$EMAIL" "$NAME" "$UPSTREAM" "$UP_USER" "$UP_PASS" "$TEACHERS"; do case "$v" in *"'"*|*$'\n'*) die "les apostrophes et retours à la ligne ne sont pas acceptés dans les valeurs" ;; esac; done
  PASS="$(openssl rand -base64 24 | tr -d '/+=\n')"
  KEY="$(openssl rand -base64 32 | tr -d '\n')"
  CODE="$(openssl rand -hex 6 | tr -d '\n')"   # 12 caractères
  umask 077
  printf '[jwt_keys]\nhmac:prod = %s\n' "$KEY" > couchdb/secrets.ini
  {
    echo "# Généré par install.sh — ne pas versionner. Valeurs entre apostrophes : lisibles par docker compose et par le shell."
    echo "SERVER_MODE='$([ "$MODE" = classe ] && echo local || echo cloud)'"
    echo "SERVER_HOST='$DOMAIN'"
    echo "SERVER_NAME='$NAME'"
    echo "TLS_DIRECTIVE='$TLS_DIRECTIVE'"
    echo "HTTP_PORT='$HTTP_PORT'"
    echo "HTTPS_PORT='$HTTPS_PORT'"
    echo "TOCCATA_VERSION='$VERSION'"
    echo "COUCHDB_ADMIN_USER='admin'"
    echo "COUCHDB_ADMIN_PASSWORD='$PASS'"
    echo "JWT_SECRET='$KEY'"
    echo "JWT_KID='prod'"
    echo "SIGNUP_CODE='$CODE'"
    echo "UPSTREAM_COUCHDB_URL='$UPSTREAM'"
    echo "UPSTREAM_ADMIN_USER='$UP_USER'"
    echo "UPSTREAM_ADMIN_PASSWORD='$UP_PASS'"
    echo "TEACHER_IDS='$TEACHERS'"
  } > .env
  say "Configuration écrite (.env et couchdb/secrets.ini, droits 600)."
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
[ "$START" = 1 ] || { say "Configuration prête. Démarrez avec : docker compose up -d"; exit 0; }

if [ "$BUILD" = 1 ]; then docker compose up -d --build; else docker compose pull --quiet && docker compose up -d; fi

say "Attente du démarrage…"
for _ in $(seq 1 90); do
  [ "$(docker compose ps --format '{{.Health}}' auth 2>/dev/null | head -1)" = healthy ] && break
  sleep 2
done
docker compose ps --format '{{.Health}}' auth | grep -q healthy || { docker compose logs --tail 30 auth >&2; die "le service ne devient pas sain (voir les journaux ci-dessus, puis ./doctor.sh)"; }

if [ "$TIMER" = 1 ]; then ./backup.sh --install-timer || say "Minuterie de sauvegarde non installée (droits root et systemd requis)."; fi

PORT_SUFFIX=""; [ "$HTTPS_PORT" != 443 ] && PORT_SUFFIX=":$HTTPS_PORT"
say "Toccata est en ligne : https://${SERVER_HOST}${PORT_SUFFIX}"
if [ "$SERVER_MODE" = cloud ]; then
  echo "Code d'invitation pour créer un compte enseignant : $SIGNUP_CODE"
  echo "(à distribuer aux enseignants ; stocké dans .env — SIGNUP_CODE)"
else
  echo "Serveur de classe : les comptes se préparent sur le cloud ; ce serveur les recopie dès qu'il le joint."
  [ "$TLS_DIRECTIVE" = "tls internal" ] && echo "Certificat : installez l'autorité de Caddy sur les appareils (docs/guide-deploiement.md)."
fi
echo "Étapes suivantes : ./doctor.sh (diagnostic) · ./backup.sh (sauvegarde) · ./update.sh (mise à jour)"
