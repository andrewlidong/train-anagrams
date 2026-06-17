/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
// Built for GitHub Pages project site at /train-anagrams/; served from root in dev.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/train-anagrams/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "og.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Subway Spell",
        short_name: "Subway Spell",
        description: "Spell words by riding NYC subway lines.",
        theme_color: "#11151c",
        background_color: "#11151c",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell precached; data + tiles cached at runtime so it works offline.
        // Take control immediately and drop old precaches so updates aren't stale.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/data\.ny\.gov\//,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "mta-data",
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/([a-d]\.basemaps\.cartocdn\.com|tile\.openstreetmap\.org)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
