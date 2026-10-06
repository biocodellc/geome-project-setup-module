// Build GEOME's frontend first. API writes are mocked; no live projects are created.
// node scripts/check-geome-integration.mjs /path/to/geomev2
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createProjectEngine } from "../lib/project-engine.js";
import { loadContract } from "../lib/contract.js";
const root = path.resolve(process.argv[2] || "../geomev2", "frontend/dist");
const fixture = JSON.parse(
  await fs.readFile(
    new URL("../test/fixtures/imports/biocode-datacite.json", import.meta.url),
    "utf8",
  ),
);
const engine = createProjectEngine(
  await loadContract({
    fetchJSON: async (url) => JSON.parse(await fs.readFile(url, "utf8")),
  }),
);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const candidate = path.resolve(root, "." + pathname);
    if (candidate !== root && !candidate.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const file = path.extname(pathname)
      ? candidate
      : path.join(root, "index.html");
    const body = await fs.readFile(file);
    res.setHeader(
      "content-type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  });
  const page = await browser.newPage();
  let posted = null;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/me")
      return route.fulfill({
        json: {
          user: {
            id: 1,
            username: "test",
            email: "test@example.org",
            fullName: "Test",
            preferences: { language: "en" },
          },
        },
      });
    if (pathname === "/api/projects" && route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: { id: 123, code: posted.code, title: posted.title },
      });
    }
    if (pathname === "/api/projects") return route.fulfill({ json: [] });
    if (pathname === "/api/projects/123")
      return route.fulfill({
        json: {
          id: 123,
          code: posted?.code,
          title: posted?.title,
          description: posted?.description,
          isPublic: false,
          isDiscoverable: false,
          isAdmin: true,
          access: "member",
          role: "owner",
          expeditions: [],
          discoverableOnly: false,
        },
      });
    return route.fulfill({ json: [] });
  });
  await page.route("https://api.datacite.org/**", (route) =>
    route.fulfill({ json: fixture }),
  );
  const base = "http://127.0.0.1:" + server.address().port;
  await page.goto(base + "/workbench/projects/new");
  await page
    .getByLabel("DOI or HTTPS link", { exact: true })
    .fill("10.60950/7efde9b6-eddf-4011-83ac-885605d05bc9");
  await page
    .getByRole("button", { name: "Look up details", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Review imported details" })
    .waitFor();
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Setup draft attached" })
    .waitFor();
  const nativeForm = page.locator("form");
  await nativeForm
    .locator("input.input")
    .first()
    .fill("Reviewed native project");
  await nativeForm.locator("textarea").fill("Final description");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile layout must fit",
  );
  await nativeForm.locator("button[type=submit]").click();
  await page.waitForURL("**/workbench/projects/123?created=1");
  assert.ok(posted);
  engine.assertValid(posted.configuration);
  assert.equal(
    posted.configuration.answers.projectName,
    "Reviewed native project",
  );
  assert.equal(posted.configuration.answers.purpose, "Final description");
  assert.equal(posted.configuration.projectDescription.people.length, 4);
  assert.equal(
    posted.configuration.projectDescription.imports[0].format,
    "datacite",
  );
  assert.deepEqual(errors, []);
  await page.goto(base + "/workbench/projects/new");
  await page.locator("form input.input").first().fill("Permit first");
  await page.getByLabel("Import", { exact: true }).selectOption("permit");
  await page
    .getByLabel("DOI or HTTPS link", { exact: true })
    .fill("https://example.org/permit.pdf");
  await page
    .getByRole("button", { name: "Look up details", exact: true })
    .click();
  await page.getByLabel("Permit identifier", { exact: true }).fill("P-42");
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  assert.equal(
    await page.locator("form input.input").first().inputValue(),
    "Permit first",
  );
  console.log(
    "Native GEOME import, review, submit payload, permit-first preservation and mobile checks passed. API writes were mocked.",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
