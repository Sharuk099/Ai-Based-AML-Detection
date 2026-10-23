// Vite configuration with TanStack Start, Nitro, and TailwindCSS
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
  vite: {
    plugins: [geminiApiPlugin],
  },
  nitro: {
    preset: process.env["NITRO_PRESET"] || process.env["LOVABLE_NITRO_PRESET"] || "node-server",
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
