# @toccata/web

PWA React 19 + Vite : coque hors ligne, écran « Mes activités » (données d'exemple), galerie de composants (`/gallery`), internationalisation fr/en.

```sh
pnpm --filter @toccata/web dev          # serveur de développement
pnpm --filter @toccata/web test         # tests (fr, en, pseudo-locale)
pnpm --filter @toccata/web i18n:check   # extraction + vérification de complétude
pnpm --filter @toccata/web build
pnpm --filter @toccata/e2e e2e          # Playwright : hors ligne, langues (CHROMIUM_PATH=… sans téléchargement)
```

## Ajouter ou modifier un texte

1. Écrire le texte en **anglais** avec les macros Lingui (`t`, `plural`, `<Trans>`). Jamais de
   chaîne en dur, jamais de phrase assemblée par concaténation : utiliser `plural`/`select`.
2. `pnpm i18n:extract`, puis traduire le français dans `src/locales/fr/messages.po`.
3. `pnpm i18n:check` doit passer (il tourne aussi dans `pnpm build` et en CI).

Mise en forme des dates et nombres : `i18n.date(...)` / `i18n.number(...)` (basés sur `Intl`).
CSS : propriétés logiques (`margin-inline`, `padding-block`). Voir `docs/adr/0007-internationalisation.md`.

## Ajouter une langue
Ajouter le code dans `lingui.config.ts` (`locales`) et dans `LOCALES` de `src/i18n.ts`,
lancer `pnpm i18n:extract`, traduire le nouveau `.po`.
