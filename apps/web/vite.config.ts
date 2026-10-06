import { lingui } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
