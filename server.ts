import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const outputServerPath = resolve(process.cwd(), ".output/server/index.mjs");

if (existsSync(outputServerPath)) {
  process.env.PORT = String(port);
  process.env.NITRO_PORT = String(port);
  process.env.NITRO_HOST = host;
  // Load the compiled Nitro production server
  await import(outputServerPath);
} else {
  // Fallback server if build artifacts are being initialized
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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

    if (url === "/health" || url === "/_health" || url === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain");
      res.end("OK");
      return;
    }

    res.statusCode = 404;
    res.end("Not Found");
  });

  server.listen(port, host, () => {
    console.log(`Fallback server listening on http://${host}:${port}`);
  });
}

export default {
  port,
  host,
};
