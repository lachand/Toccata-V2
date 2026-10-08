# Contribuer

1. `pnpm install`, puis `docker compose -f infra/docker-compose.yml up -d` (CouchDB de développement).
2. Avant toute proposition : `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm build` ; pour le service d'authentification,
   `COUCHDB_URL=http://127.0.0.1:5984 pnpm --filter @toccata/auth test:integration` ; pour l'interface, `pnpm --filter @toccata/e2e e2e`.
3. **Aucune chaîne visible en dur** : les textes passent par Lingui (sources en anglais, traduction française dans `apps/web/src/locales/fr`) ;
   `pnpm --filter @toccata/web i18n:check` doit être vert. Tutoiement pour les élèves, vouvoiement pour les enseignants et la documentation.
4. Une décision d'architecture = un ADR dans `docs/adr/`. Pas de secret dans le dépôt (gitleaks).
5. Messages de commit à l'impératif, une idée par commit.

Licence des contributions : MIT.
