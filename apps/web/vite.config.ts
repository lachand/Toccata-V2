import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// L'API (service apps/auth) est servie sous /api : le proxy évite toute requête inter-origines (donc tout CORS) et
// laisse le cookie de rafraîchissement sur la même origine que l'interface.
const api = {
  "/api": { target: process.env["AUTH_URL"] ?? "http://127.0.0.1:8787", changeOrigin: false },
  // CouchDB (réplication RxDB) : même origine que l'interface, donc pas de CORS ; le préfixe /couch est retiré.
  "/couch": { target: process.env["COUCHDB_URL"] ?? "http://127.0.0.1:5984", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/couch/, "") },
};

export default defineConfig({
  server: { proxy: api },
  preview: { proxy: api },
  plugins: [
    react(),
    babel({ plugins: ["@lingui/babel-plugin-lingui-macro"] }),
    lingui(),
    VitePWA({
      // Mise à jour contrôlée : l'utilisateur décide (voir UpdatePrompt).
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.svg"],
      manifest: {
        name: "Toccata",
        short_name: "Toccata",
        description: "Classroom orchestration · Orchestration de classe",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f0f5f4",
        theme_color: "#08796a",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Coque, polices et catalogues de langues (chunks `messages-*.js`) : tout est précaché, donc disponible hors ligne.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/couch\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    globals: false,
    alias: { "virtual:pwa-register/react": new URL("./src/test-pwa-stub.ts", import.meta.url).pathname },
  },
});
