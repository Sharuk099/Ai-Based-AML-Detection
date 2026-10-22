// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

const geminiApiPlugin: Plugin = {
  name: "gemini-api-plugin",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = req.url?.split("?")[0];
      if (url === "/api/gemini/investigate" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body);
            const { generateAmlInvestigation } = await import("./src/server/gemini");
            const report = await generateAmlInvestigation(payload);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, report }));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error";
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: false, error: msg }));
          }
        });
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  vite: {
    plugins: [geminiApiPlugin],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
