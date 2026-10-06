# ADR 0003 — Authentification et contrôle d'accès

**Statut** : accepté (révisé après le spike a, voir `docs/phase0-spikes.md`)

## Décision
- **Service d'auth dédié** : Argon2id côté serveur, JWT court (≈ 15 min) + refresh token.
- **CouchDB valide les JWT** (`jwt_authentication_handler`). Les rôles sont dans la claim
  **imbriquée** `{"_couchdb": {"roles": [...]}}` (`roles_claim_path = _couchdb.roles`) ; une
  claim plate `"_couchdb.roles"` n'est pas lue.
- **Deux types de bases** (et non « une base par espace d'activité ») :
  - `master_<id>` — contenu de l'activité. Lecture : participants (`master:<id>:read`) ;
    écriture : enseignant (`master:<id>:write`), imposée par `validate_doc_update`.
  - `inst_<id>` — données d'une instance (états d'apps, soumissions, texte, état participant).
    Accès : `inst:<id>:member` (élèves du groupe) et `inst:<id>:teacher`.
- `validate_doc_update` : un élève ne peut pas usurper `authorId`, ni modifier un document
  `teacherOnly`. Générés par `apps/auth/src/vdu.ts` (les fichiers de `infra/couchdb/design/`
  datent des spikes).
- Comptes élèves créés par l'enseignant (liste de classe, code/QR). Aucun secret versionné.

## Rôles (révisé en Phase 2, voir ADR 0009)
Un enseignant porte **un seul rôle `owner:<userId>`** ; les `_security.members.roles` de chaque
base listent `owner:<id>` et, pour les élèves, `inst:<id>:member` / `master:<id>:read`. Les
`validate_doc_update` sont générés avec la liste des propriétaires. Raison : un rôle par
instance donnait ≈ 30 Ko de jeton à un enseignant de 50 activités.

## Pourquoi une base par instance
CouchDB n'a **pas de droit de lecture par document** : dans une même base, tout membre lit
tout. Pour isoler les groupes entre eux, il faut une base par instance. Conséquence : la vue
enseignant ouvre une réplication par instance suivie (voir risques ci-dessous).

## Contraintes constatées
- Noms de base : **minuscules uniquement** (`a-z0-9_$()+-/`, première lettre alphabétique) →
  les identifiants d'activité/instance sont des chaînes minuscules (ex. ULID en minuscules).
- Jeton expiré ou signature invalide : CouchDB répond **400** ou **401** ; le client doit
  renouveler le jeton dans les deux cas.

## Risques à lever plus tard
- Beaucoup de réplications live côté enseignant : limite de 6 connexions par origine en
  HTTP/1.1 dans un navigateur → servir en **HTTP/2** (Caddy) et ne répliquer en direct que les
  instances affichées ; les autres via un document de synthèse. À mesurer avec Playwright
  (Phase 6) : le spike tourne sous Node, qui n'a pas cette limite.
- Un jeton valide reste accepté jusqu'à son `exp` même si le compte est révoqué : garder
  `exp` court.

## Raison d'origine
L'ancienne version partageait un compte de base de données unique dans le navigateur,
contournait la vérification de mot de passe et stockait du MD5 non salé.
