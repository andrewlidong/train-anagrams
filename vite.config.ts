/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
// Built for GitHub Pages project site at /train-anagrams/; served from root in dev.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/train-anagrams/" : "/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
