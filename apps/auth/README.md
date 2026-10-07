# @toccata/auth

Service d'authentification et d'approvisionnement (Hono + TypeScript). Voir
[ADR 0003](../../docs/adr/0003-securite-et-acces.md) et [ADR 0009](../../docs/adr/0009-authentification.md).

```sh
cp ../../.env.example .env        # puis renseigner JWT_SECRET (openssl rand -base64 48)
docker compose -f ../../infra/docker-compose.yml up -d   # CouchDB (clé JWT de dev dans infra/couchdb/local.ini)
pnpm dev
```

L'inscription des enseignants est **fermée par défaut** : définir `SIGNUP_CODE` (code à distribuer) ou `OPEN_SIGNUP=true` (développement).

La clé `JWT_SECRET` doit être la même que celle de CouchDB (`[jwt_keys] hmac:<JWT_KID>`).

## Tests
```sh
pnpm test                 # unitaires, sans service externe
pnpm test:integration     # contre un vrai CouchDB (voir ci-dessus) ; utilise la clé de développement de infra/couchdb/local.ini
```

Toutes les routes sont servies sous `BASE_PATH` (défaut `/api`) : `POST /api/auth/login`, etc. Le proxy du front envoie `/api/*` à ce service.

## API (réponses d'erreur : `{ "error": "<code>" }`, jamais de phrase)

| Route | Accès | Rôle |
|---|---|---|
| `POST /auth/teachers` | ouverte (code d'inscription si `SIGNUP_CODE`) | crée un enseignant et ouvre une session |
| `POST /auth/login` | ouverte | `{accessToken, expiresIn, user}` + cookie de rafraîchissement |
| `POST /auth/refresh` | cookie + en-tête `X-Requested-With: toccata` | nouveau jeton, rotation du cookie |
| `POST /auth/logout` | idem | révoque la session |
| `GET /auth/me` | jeton | profil |
| `POST /classes`, `GET /classes`, `GET /classes/:id` | enseignant | classes |
| `POST /classes/:id/students` | enseignant | crée des élèves, renvoie **une seule fois** leurs phrases de passe |
| `POST /classes/:id/students/:sid/reset-password` | enseignant | nouvelle phrase de passe |
| `DELETE /classes/:id/students/:sid` | enseignant | supprime l'élève |
| `POST /activities`, `GET /activities` | enseignant | crée/liste (base `master_<id>`) |
| `POST /activities/:id/instances` | enseignant | crée une instance (base `inst_<id>`) |
| `PUT /instances/:id/members` | enseignant | inscrit des élèves ; effet à leur prochain rafraîchissement de jeton |

Limites de connexion (`LoginGuard`, voir ADR 0009) : par identifiant, par adresse (dont identifiants
distincts en échec), et globale avec mode « sous attaque ». Mots de passe d'enseignant : zxcvbn-ts
score 4 ; phrases d'élève : 6 mots.

Codes d'erreur : `invalid_input`, `invalid_credentials`, `rate_limited`, `locked`, `weak_password`,
`username_taken`, `unauthorized`, `forbidden`, `not_found`, `invalid_refresh`, `refresh_reused`,
`signup_closed`, `conflict`, `internal`.
