/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8")) as {
  version: string;
};
const appVersion = process.env.APP_VERSION ?? pkg.version;

// Where `npm run dev` proxies API calls. 5100, not the ASP.NET default 5000,
// because another local service may already own 5000 on a developer machine.
// Override to follow `start.ps1 -ApiPort <n>`; the two are separate workflows
// (this proxy is only used at :5173, where start.ps1 serves the SPA from the
// API itself) but they should be able to agree.
const apiProxyTarget = process.env.VITE_API_TARGET ?? "http://localhost:5100";

export default defineConfig({
  // SPA is served at the site root on app.openscorm.com / test.openscorm.com.
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 5173,
    fs: {
      // The dispatch launcher lives in the .NET project, because that project
      // is what embeds it in the generated package. Its test imports it as
      // text from there rather than keeping a second copy here, and Vite
      // refuses to read outside its root without this. Scoped to the
      // one template folder rather than the repo.
      allow: [path.resolve(__dirname), path.resolve(__dirname, "../src/Slate.Dispatch/Templates")],
    },
    proxy: {
      "/api": apiProxyTarget,
      "/swagger": apiProxyTarget,
    },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Second entry: the dispatch content shim. The launch
      // page is server-rendered by Slate.Api and references this bundle at
      // the site root by a STABLE name - no content hash - because the page
      // that loads it is not built by Vite and cannot follow hashed names.
      // Cache staleness is bounded by normal HTTP caching of a root asset.
      input: {
        main: path.resolve(__dirname, "index.html"),
        "dispatch-shim": path.resolve(__dirname, "src/dispatch/shim.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "dispatch-shim" ? "dispatch-shim.js" : "assets/[name]-[hash].js",
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
