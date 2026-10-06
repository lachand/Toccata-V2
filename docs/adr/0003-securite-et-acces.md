# ADR 0003 — Authentification et contrôle d'accès

**Statut** : accepté

- Service d'auth dédié : Argon2id côté serveur, JWT court + refresh token.
- CouchDB valide les JWT ; une base par espace d'activité ; `_security` par rôle ;
  `validate_doc_update` (un élève n'écrit que dans son instance).
- Comptes élèves créés par l'enseignant (liste de classe, code/QR). Aucun secret versionné.

**Raison** : l'ancienne version partageait un compte de base de données unique dans le
navigateur, contournait la vérification de mot de passe et stockait du MD5 non salé.
