import { defineConfig } from "@playwright/test";

// Test de fumée d'une pile de PRODUCTION déjà installée (deploy/install.sh) : PROD_URL=https://… [SIGNUP_CODE=…]
// Sans SIGNUP_CODE, il est lu dans deploy/.env. Le certificat de l'autorité locale de Caddy est accepté.
const executablePath = process.env["CHROMIUM_PATH"];
export default defineConfig({
  testDir: "./tests-prod",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env["PROD_URL"] ?? "https://localhost:8443",
    ignoreHTTPSErrors: true,
    ...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
  },
});
