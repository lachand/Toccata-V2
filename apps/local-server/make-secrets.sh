#!/bin/sh
# Génère les secrets du serveur de classe : mot de passe d'administration CouchDB et clé JWT PROPRE à ce serveur.
# Un serveur de classe volé ne peut ainsi pas forger de jetons valables sur le cloud. Rien de ceci n'est versionné.
set -eu
cd "$(dirname "$0")"
[ -e .env ] && { echo ".env existe déjà : rien n'est écrasé." >&2; exit 1; }
PASS="$(openssl rand -base64 24 | tr -d '/+=')"
KEY="$(openssl rand -base64 32)"
umask 077
cat > couchdb/secrets.ini <<INI
[jwt_keys]
hmac:local = $KEY
INI
cat > .env <<ENV
COUCHDB_ADMIN_PASSWORD=$PASS
JWT_SECRET=$KEY
# À renseigner : le cloud auquel ce serveur se rattache, et les enseignants servis (identifiants, séparés par des virgules)
SERVER_HOST=classe.example.org
SERVER_NAME=Serveur de classe
TLS_DIRECTIVE=tls internal
UPSTREAM_COUCHDB_URL=https://cloud.example.org/couch
UPSTREAM_ADMIN_USER=
UPSTREAM_ADMIN_PASSWORD=
TEACHER_IDS=
ENV
echo "Secrets écrits dans .env et couchdb/secrets.ini (droits 600). Complétez .env, puis : docker compose up -d --build"
