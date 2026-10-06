import { defineConfig } from "@lingui/cli";
import { formatter } from "@lingui/format-po";

// Langue source : l'anglais (les traducteurs partent presque toujours de l'anglais).
// Le français est une traduction complète, vérifiée par `pnpm i18n:check`.
export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "fr", "pseudo"],
  pseudoLocale: "pseudo",
  fallbackLocales: { pseudo: "en", default: "en" },
  catalogs: [
    {
      path: "<rootDir>/src/locales/{locale}/messages",
      include: ["<rootDir>/src"],
    },
  ],
  format: formatter({ lineNumbers: false }),
  compileNamespace: "es",
});
