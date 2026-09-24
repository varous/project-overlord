import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// Dev and `vite preview` both sit on a different port from the API. Production
// Docker shares an origin. The proxy is how local/CI match that shape.
const apiProxy = {
  "/api": "http://localhost:8080",
  "/healthz": "http://localhost:8080",
  "/readyz": "http://localhost:8080",
};

export default defineConfig({
  appType: "spa",
  plugins: [
    react(),
    svgr({ include: "**/*.svg?react" }),
    {
      // sirv runs before Vite's HTML fallback. Paths whose first segment starts
      // with `_` (ADR-008 `/_reference`) can 404 in preview without this rewrite.
      name: "preview-spa-underscore",
      configurePreviewServer(server) {
        server.middlewares.use((req, _res, next) => {
          const pathOnly = (req.url ?? "").split("?")[0];
          if (pathOnly === "/_reference") req.url = "/index.html";
          next();
        });
      },
    },
  ],
  build: { outDir: "dist", sourcemap: true, target: "es2022" },
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, strictPort: true, proxy: apiProxy },
});
