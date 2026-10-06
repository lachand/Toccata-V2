import { defineConfig } from "vitest/config";

// Tests d'intégration : exigent un CouchDB (docker compose -f infra/docker-compose.yml up -d).
export default defineConfig({ test: { include: ["test/integration/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false } });
