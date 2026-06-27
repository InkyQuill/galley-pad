import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
    alias: [
      {
        find: "@inky/galley-editor/style.css",
        replacement: resolve(__dirname, "galley-editor/dist/style.css"),
      },
      {
        find: "@inky/galley-editor",
        replacement: resolve(__dirname, "galley-editor/dist/index.js"),
      },
    ],
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    port: 1420,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
