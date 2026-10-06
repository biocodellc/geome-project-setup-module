import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const ld = JSON.parse(
  await fs.readFile(
    new URL("../fixtures/imports/biocode-schemaorg.json", import.meta.url),
    "utf8",
  ),
);
const dc = JSON.parse(
  await fs.readFile(
    new URL("../fixtures/imports/biocode-datacite.json", import.meta.url),
    "utf8",
  ),
);
const schema = JSON.parse(
  await fs.readFile(
    new URL(
      "../../schemas/project-configuration.v4.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const ajv = new Ajv({ allErrors: true, strictRequired: false });
addFormats(ajv);
const valid = ajv.compile(schema);
const saved = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("geome.proposed-project-configuration.v1")),
  );
async function lookup(page, url) {
  await page
    .getByRole("button", { name: "Import project description", exact: true })
    .click();
  await page.locator("#source-url").fill(url);
  await page
    .getByRole("button", { name: "Look up details", exact: true })
    .click();
}
test("iPlaces preview, explicit adoption, edits, export and reload retain source metadata", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("https://iplacesalliance.org/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<script type="application/ld+json">${JSON.stringify(ld[0])}</script>`,
    }),
  );
  await page.goto("./");
  await page.locator("#intent-new").check();
  await page.locator("#q-projectName").fill("Existing draft");
  await lookup(
    page,
    "https://iplacesalliance.org/gumpstation/articles/7/index.html",
  );
  await expect(page.locator("#source-title")).toHaveValue(
    "Biocode 2.0 Project",
  );
  await expect
    .poll(async () => (await saved(page))?.answers.projectName)
    .toBe("Existing draft");
  await page.locator("#source-title").fill("Reviewed Biocode");
  await page.locator("#source-country").selectOption("PF");
  await page
    .getByRole("button", { name: "Use these details", exact: true })
    .click();
  await expect(page.locator("#q-projectName")).toHaveValue("Reviewed Biocode");
  expect((await saved(page)).projectDescription.people).toHaveLength(4);
  await page
    .getByRole("button", { name: "Edit people & funding", exact: true })
    .click();
  await page.locator("#person-name-0").fill("Reviewed person");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page.reload();
  await expect(page.locator("#q-projectName")).toHaveValue("Reviewed Biocode");
  expect((await saved(page)).projectDescription.people[0].name).toBe(
    "Reviewed person",
  );
  await page.locator('#steps [data-stage="5"]').click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON", exact: true })
    .first()
    .click();
  const file = await download;
  const doc = JSON.parse(await fs.readFile(await file.path(), "utf8"));
  expect(valid(doc), JSON.stringify(valid.errors)).toBe(true);
  expect(doc.projectDescription.imports[0].format).toBe("schema.org");
  expect(doc.answers.startDate).toBeUndefined();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#steps [data-stage="0"]').click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("DOI lookup, cancelled preview and failed lookup leave the draft unchanged", async ({
  page,
}) => {
  await page.route("https://api.datacite.org/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(dc),
    }),
  );
  await page.goto("./");
  await page.locator("#q-projectName").fill("Keep me");
  await lookup(page, "10.60950/7efde9b6-eddf-4011-83ac-885605d05bc9");
  await expect(page.locator("#source-title")).toHaveValue(
    "Biocode 2.0 Project",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("#q-projectName")).toHaveValue("Keep me");
  await page.route("https://api.datacite.org/**", (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  await lookup(page, "10.1234/missing");
  await expect(page.locator("#source-error")).toContainText("No public record");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator("#q-projectName")).toHaveValue("Keep me");
});
test("a permit can be the first imported information and remains unclassified through profile adoption", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Add existing permit", exact: true })
    .click();
  await page.locator("#source-url").fill("https://example.org/permit.pdf");
  await page
    .getByRole("button", { name: "Look up details", exact: true })
    .click();
  await page.locator("#source-permit-identifier").fill("PERMIT-42");
  await page
    .getByRole("button", { name: "Add this permit reference", exact: true })
    .click();
  const initial = (await saved(page)).permitPlan.permits[0];
  expect(initial.typeId).toBe("");
  expect(initial.coverage).toEqual([]);
  await page.locator('#steps [data-stage="3"]').click();
  await expect(page.locator("#permit-planner")).toContainText("PERMIT-42");
  await page.locator("#permit-profile").selectOption("gump-moorea-demo");
  expect((await saved(page)).permitPlan.permits[0].id).toBe(initial.id);
  await page
    .locator('[data-permit-control="field"][data-field="typeId"]')
    .selectOption("gump-fishing");
  await expect
    .poll(async () => (await saved(page)).permitPlan.permits[0].typeId)
    .toBe("gump-fishing");
  expect((await saved(page)).permitPlan.permits[0].coverage).toEqual([]);
});
