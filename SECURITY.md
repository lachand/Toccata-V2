# Politique de sécurité

## Signaler une vulnérabilité

N'ouvrez **pas** de ticket public. Écrivez à l'administrateur du dépôt via
[« Report a vulnerability »](https://github.com/lachand/Toccata-V2/security/advisories/new) (GitHub Security Advisories).
Accusé de réception sous 5 jours ouvrés ; correctif ou plan sous 30 jours pour une faille confirmée.

## Périmètre et garanties

- Comptes : Argon2id, phrases de passe d'élèves de 6 mots, limitation de débit et verrouillage, sessions à rotation avec détection de réutilisation.
- Données : une base CouchDB par activité et par groupe, droits par rôle appliqués **par CouchDB** (`validate_doc_update`), jetons courts (15 min).
- Réseau : HTTPS + HSTS, CSP stricte, CouchDB jamais exposé directement, interface d'administration CouchDB inaccessible depuis Internet.
- Chaîne : `gitleaks` et `pnpm audit` en CI, images construites depuis les sources et publiées avec SBOM.

Limites connues : [ADR 0003](docs/adr/0003-securite-et-acces.md), [ADR 0009](docs/adr/0009-authentification.md), [ADR 0017](docs/adr/0017-production-et-securite.md).
