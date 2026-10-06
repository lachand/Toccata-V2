# Spikes de la Phase 0

Prouvent les points risqués de l'architecture contre de vrais CouchDB. **Non exécutés en CI**
(ils nécessitent Docker). Résultats : [`../docs/phase0-spikes.md`](../docs/phase0-spikes.md).

```sh
export COUCHDB_USER=admin COUCHDB_PASSWORD=spike-admin-pass   # valeurs jetables, lues par docker compose ET par les spikes
# si Docker Hub répond 429 : export COUCHDB_IMAGE=public.ecr.aws/docker/library/couchdb:3.4
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm --filter @toccata/spikes spike              # a, b, c, d
pnpm --filter @toccata/spikes iframe-check       # e (réseau sortant requis)
```

Les mots de passe et la clé JWT de ce dossier sont des **valeurs de développement jetables**.
