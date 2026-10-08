import { defineConfig } from "@playwright/test";

// En local sans téléchargement de navigateur : CHROMIUM_PATH=/chemin/vers/chrome pnpm --filter @toccata/e2e e2e
// Exige un CouchDB (docker compose -f infra/docker-compose.yml up -d) ; la base de comptes est jetable.
const executablePath = process.env["CHROMIUM_PATH"];
// Base de comptes jetable, partagée avec les tests (le serveur de classe du scénario « local-server » doit répliquer la même).
process.env["E2E_ACCOUNTS_DB"] ??= `acc_e2e_${Date.now().toString(36)}`;
const couch = {
  COUCHDB_URL: process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984",
  COUCHDB_ADMIN_USER: process.env["COUCHDB_ADMIN_USER"] ?? process.env["COUCHDB_USER"] ?? "admin",
  COUCHDB_ADMIN_PASSWORD: process.env["COUCHDB_ADMIN_PASSWORD"] ?? process.env["COUCHDB_PASSWORD"] ?? "spike-admin-pass",
};

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    ...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
  },
  webServer: [
    {
      // Service d'authentification, avec la clé JWT de développement de infra/couchdb/local.ini
      command: "pnpm --filter @toccata/auth start",
      url: "http://127.0.0.1:8787/api/auth/me",
      // 401 attendu : le service répond, c'est tout ce qu'on veut savoir
      ignoreHTTPSErrors: true,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...couch,
        ACCOUNTS_DB: process.env["E2E_ACCOUNTS_DB"]!,
        JWT_SECRET: Buffer.from("dev-only-secret-change-me-32-bytes!!").toString("base64"),
        JWT_KID: "dev",
        COOKIE_SECURE: "false",
        OPEN_SIGNUP: "true",
        PORT: "8787",
      },
      gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    },
    {
      command: "pnpm --filter @toccata/web build && pnpm --filter @toccata/web exec vite preview --port 4173 --strictPort",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env["CI"],
      timeout: 180_000,
    },
    {
      // Interface servie par le « serveur de classe » du scénario local-server : autre origine (autre port), donc autre stockage
      // local, et un proxy vers le service d'authentification local (8788, lancé par le test) et vers le CouchDB local (5985).
      command: "pnpm --filter @toccata/web exec vite preview --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env["CI"],
      timeout: 60_000,
      env: { AUTH_URL: "http://127.0.0.1:8788", COUCHDB_URL: "http://127.0.0.1:5985" },
    },
  ],
});
