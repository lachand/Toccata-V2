import { defineConfig } from "@playwright/test";

// En local sans téléchargement de navigateur : CHROMIUM_PATH=/chemin/vers/chrome pnpm --filter @toccata/e2e test
const executablePath = process.env["CHROMIUM_PATH"];

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    ...(executablePath ? { launchOptions: { executablePath, args: ["--no-sandbox"] } } : {}),
  },
  webServer: {
    command: "pnpm --filter @toccata/web build && pnpm --filter @toccata/web exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env["CI"],
    timeout: 180_000,
  },
});
