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
  let sourceReads = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  const source = structuredClone(ld[0]);
  source.extra = '<img src="invalid" onerror="window.sourceExecuted=true">';
  await page.route("https://iplacesalliance.org/**", (route) => {
    sourceReads++;
    return route.fulfill({
      contentType: "text/html",
      body: `<script type="application/ld+json">${JSON.stringify(source)}</script>`,
    });
  });
  await page.goto("./");
  await expect(page.locator(".import-start .import-guide")).toBeVisible();
  await expect(page.locator(".import-start .import-guide")).toContainText(
    "Apply when ready",
  );
  expect(sourceReads).toBe(0);
  await page.locator("#intent-new").check();
  await page.locator("#q-projectName").fill("Existing draft");
  await page
    .getByRole("button", { name: "Import project description", exact: true })
    .click();
  await expect(page.locator("#dialog-body")).toContainText(
    "The Biocode example uses the iPlaces page",
  );
  await expect(page.locator("#dialog-body .import-guide")).toBeVisible();
  await expect(page.locator("#dialog-body")).toContainText(
    "linked ScholarlyArticle supplies the people and DOI",
  );
  expect(sourceReads).toBe(0);
  await page
    .getByRole("button", { name: "Use Biocode example", exact: true })
    .click();
  await expect(page.locator("#source-title")).toHaveValue(
    "Biocode 2.0 Project",
  );
  const provenance = page.getByRole("region", {
    name: "Import source",
    exact: true,
  });
  await expect(provenance).toContainText("schema.org (JSON-LD)");
  await expect(provenance).toContainText("ResearchProject");
  await expect(provenance).toContainText("ScholarlyArticle");
  await expect(page.locator("#dialog-body")).toContainText(
    "4 people, 1 funding record",
  );
  await expect(provenance.locator("time")).toHaveAttribute("datetime", /T/);
  await provenance.getByText("View original metadata", { exact: true }).click();
  expect(
    JSON.parse(await provenance.locator("pre").textContent())[0].extra,
  ).toBe(source.extra);
  await expect(provenance.locator("img")).toHaveCount(0);
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
  await page
    .getByRole("button", { name: "View imported sources", exact: true })
    .click();
  await page.getByText("View original metadata", { exact: true }).click();
  await expect(page.locator(".import-source pre")).toContainText("Neil Davies");
  await expect(page.locator(".import-source pre")).not.toContainText(
    "Reviewed person",
  );
  expect(sourceReads).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page
      .locator("#dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.getByRole("button", { name: "Close dialog" }).click();
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
  const provenance = page.getByRole("region", {
    name: "Import source",
    exact: true,
  });
  await expect(provenance).toContainText("DataCite · DOI metadata");
  await expect(provenance).toContainText("Metadata request");
  await expect(
    provenance.locator('a[href^="https://api.datacite.org/"]'),
  ).toHaveAttribute(
    "href",
    "https://api.datacite.org/dois/10.60950%2F7efde9b6-eddf-4011-83ac-885605d05bc9",
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
  await expect(
    page.getByRole("region", { name: "Import source", exact: true }),
  ).toContainText("The document was not downloaded or read");
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
