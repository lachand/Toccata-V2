# Toccata 2

Plateforme web d'**orchestration de classe** fondée sur l'*Activity Based Computing* :
un enseignant scripte une activité (étapes, ressources, applications), la distribue
(classe, groupes, individus), la pilote en direct, la reprend d'une séance à l'autre et en tire un bilan,
y compris **sans réseau** (PWA hors ligne, serveur de classe).

Réécriture moderne du projet de recherche [Toccata](https://github.com/lachand/Toccata), décrit dans :

> V. Lachand, C. Michel, A. Tabard. *Toccata: Supporting Classroom Orchestration with
> Activity Based Computing.* Proc. ACM IMWUT 3(2), 2019.
> [doi:10.1145/3328924](https://doi.org/10.1145/3328924) · [HAL](https://hal.science/hal-02136481)

## Installer (administrateur)

Sur un serveur Linux avec Docker et un nom de domaine :

```sh
curl -fsSLO https://github.com/lachand/Toccata-V2/releases/latest/download/toccata-deploy.tar.gz
tar xzf toccata-deploy.tar.gz && cd toccata-deploy
./install.sh --domain toccata.mon-ecole.fr --email admin@mon-ecole.fr
```

Le script génère les secrets, obtient le certificat HTTPS, démarre la pile et affiche l'adresse et le **code d'invitation** des enseignants.
Ensuite : `./doctor.sh` (diagnostic), `./backup.sh` / `./restore.sh`, `./update.sh` (avec retour arrière automatique).
→ [Guide de déploiement](docs/guide-deploiement.md) · [Deployment guide](docs/deployment-guide.en.md) · [Serveur de classe (Raspberry Pi, hors ligne)](docs/guide-serveur-local.md)

## Utiliser (enseignant)

[Guide de l'enseignant](docs/guide-enseignant.md) · [Teacher's guide](docs/teacher-guide.en.md) · [Données personnelles](docs/confidentialite-modele.md)

## Développer

```sh
pnpm install
docker compose -f infra/docker-compose.yml up -d     # deux CouchDB de développement (5984 « cloud », 5985 « classe »)
pnpm -r typecheck && pnpm -r test && pnpm build
COUCHDB_URL=http://127.0.0.1:5984 pnpm --filter @toccata/auth test:integration
pnpm --filter @toccata/e2e e2e                        # Playwright (CHROMIUM_PATH=… si le navigateur est déjà installé)
```

Pile : React 19 · Vite · TypeScript · RxDB + CouchDB · TipTap + Yjs · PWA · Lingui (fr/en) · Hono (service d'authentification).
Décisions : [`docs/adr/`](docs/adr) · modèle de données : [`docs/data-model.md`](docs/data-model.md) · feuille de route : [`docs/roadmap.md`](docs/roadmap.md) ·
contribuer : [`CONTRIBUTING.md`](CONTRIBUTING.md) · sécurité : [`SECURITY.md`](SECURITY.md).

## Structure

```
apps/web           PWA React
apps/auth          service d'authentification / approvisionnement (Hono)
packages/schema    types, schémas, résolution master/instance, lot d'échange .toccata
packages/apps-sdk  contrat des applications embarquées
packages/ui        design system
deploy/            installation de production (cloud ou serveur de classe) : compose, Caddy, scripts, hotspot
infra/             CouchDB de développement
e2e/               scénarios Playwright (études de cas de l'article, accessibilité, production)
tools/             test de charge, proxy coupable
```

## Licence

[MIT](LICENSE)
