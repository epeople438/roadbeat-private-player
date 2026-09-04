import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { serviceWorkerVersion } from "./build/sw-version-plugin";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("./github-pages", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), serviceWorkerVersion()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist-pages", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
});
