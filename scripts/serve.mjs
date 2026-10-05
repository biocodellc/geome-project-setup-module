import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(option("--port", "8000"));
const prefix = option("--base", "/").replace(/\/?$/, "/");
if (!prefix.startsWith("/") || prefix.includes(".."))
  throw new Error("Base must be an absolute URL path.");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      if (!pathname.startsWith(prefix)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const relative = pathname.slice(prefix.length) || "index.html";
      const file = path.resolve(root, relative);
      if (
        !file.startsWith(root) ||
        relative
          .split("/")
          .some((part) => part.startsWith(".") || part === "node_modules")
      ) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      const body = await fs.readFile(file);
      response.writeHead(200, {
        "Content-Type":
          (types[path.extname(file)] || "application/octet-stream") +
          "; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("Project setup: http://127.0.0.1:" + port + prefix),
  );
