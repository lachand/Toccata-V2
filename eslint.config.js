import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Garde-fous modestes mais utiles : erreurs probables (typescript-eslint « recommended »), hooks React (fuites, dépendances).
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/locales/**", "spikes/**", "e2e/test-results/**", "infra/**", "**/*.d.ts", "tools/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "@typescript-eslint/no-empty-object-type": "off",
      "no-console": "off",
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
    },
  },
  { files: ["**/*.test.{ts,tsx}", "**/test-utils.tsx", "**/test/**", "e2e/**"], rules: { "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-non-null-assertion": "off" } },
);
