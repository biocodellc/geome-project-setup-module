import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const fixture = new URL(
  "../../examples/legacy/geome-project.v2.json",
  import.meta.url,
);
const schema = JSON.parse(
  await fs.readFile(
    new URL(
      "../../schemas/project-configuration.v5.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const ajv = new Ajv({ allErrors: true, strictRequired: false });
addFormats(ajv);
const validate = ajv.compile(schema);
const storageKey = "geome.proposed-project-configuration.v1";
async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    storageKey,
  );
}
async function exportResult(page) {
  await page.locator('#steps [data-stage="5"]').click();
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON", exact: true })
    .first()
    .click();
  const download = await pending;
  const result = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  return result;
}

test("loads the schema-driven form from a GitHub Pages subdirectory with no external requests", async ({
  page,
}) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("./");
  await expect(page.locator("#intent-new")).toBeVisible();
  await page.locator("#intent-new").check();
  await page.locator("#q-projectName").fill("Shared project test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator('select[data-field="country"] option')).toHaveCount(
    250,
  );
  await page.locator('select[data-field="country"]').selectOption("NZ");
  await page.locator("#q-startDate").fill("2027-03-01");
  await page.locator("#q-endDate").fill("2027-02-01");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.locator("#q-endDate").fill("2027-03-14");
  const result = await exportResult(page);
  expect(result.kind).toBe("project-configuration");
  expect(result.answers.projectName).toBe("Shared project test");
  expect(
    requests.every((url) =>
      url.startsWith("http://127.0.0.1:5186/geome-project-setup-module/"),
    ),
  ).toBe(true);
  expect(
    requests.some((url) =>
      url.endsWith("/schemas/project-configuration.v5.schema.json"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("each platform example imports and exports through the same contract", async ({
  page,
}) => {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("./");
  await expect(page.locator("#intent-new")).toBeVisible();
  for (const name of ["geome", "iplaces"]) {
    const path = new URL(
      "../../examples/" + name + "-project.json",
      import.meta.url,
    );
    const original = JSON.parse(await fs.readFile(path, "utf8"));
    await page.locator("#import-file").setInputFiles({
      name: name + ".json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
    await expect(page.locator("#q-projectName")).toHaveValue(
      original.answers.projectName,
    );
    const exported = await exportResult(page);
    expect(exported.answers).toEqual(original.answers);
    expect(exported.$schema).toBe(schema.$id);
  }
});

test("legacy import upgrades and rejected imports preserve the existing project", async ({
  page,
}) => {
  const original = JSON.parse(await fs.readFile(fixture, "utf8"));
  delete original.$schema;
  original.kind = "geome-project-configuration";
  original.version = 1;
  original.modelVersions.schema = "1.0.0";
  await page.goto("./");
  await expect(page.locator("#intent-new")).toBeVisible();
  await page.locator("#import-file").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(page.locator("#q-projectName")).toHaveValue(
    original.answers.projectName,
  );
  expect((await exportResult(page)).version).toBe(5);
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"kind":"unknown"}'),
  });
  await expect(page.getByRole("dialog")).toContainText("could not be imported");
  expect((await saved(page)).answers.projectName).toBe(
    original.answers.projectName,
  );
});

test("conditional reviews, persistence, JSON model viewer, and mobile layout work after modularization", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#intent-new")).toBeVisible();
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator('[data-example="marine"]').click();
  await page.locator('#steps [data-stage="5"]').click();
  const detail = page.locator('details[data-guardrail^="abs@"]');
  await detail.locator("summary").click();
  await detail.locator('input[data-field="owner"]').fill("Test reviewer");
  await detail.locator('select[data-field="status"]').selectOption("Reviewed");
  await expect(detail.locator("summary")).toContainText("Reviewed");
  await page.locator('#steps [data-stage="2"]').click();
  await page.locator("#genetic-no").check();
  await page.locator("#genetic-yes").check();
  await page.locator('#steps [data-stage="5"]').click();
  await expect(detail.locator("summary")).toContainText("Pending review");
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("#q-projectName")).toHaveValue(
    "Coastal biodiversity in Aotearoa",
  );
  await page.getByRole("button", { name: "View JSON model" }).click();
  await page.locator('[data-tech-tab="schema"]').click();
  await expect(page.locator("pre")).toContainText(schema.$id);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const stage of [0, 1, 4, 5]) {
    await page.locator('#steps [data-stage="' + stage + '"]').click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("schema loading errors are visible instead of leaving a blank form", async ({
  page,
}) => {
  await page.route("**/schemas/project-configuration.v5.schema.json", (route) =>
    route.fulfill({ status: 404, body: "Missing" }),
  );
  await page.goto("./");
  await expect(page.locator("#panel")).toContainText(
    "Project setup could not load",
  );
});

test("browser storage unavailable still permits valid JSON exports", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function () {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = function () {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  await page.goto("./");
  await page.locator("#intent-observations").check();
  await expect(page.locator("#save-state")).toContainText("Session only");
  const result = await exportResult(page);
  expect(result.answers.intent).toBe("observations");
});

test("revised research questions capture multiple scientific names and a Local Contexts project reference", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Getting Started: Import an existing project",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Project Title", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Research Focus", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".section-eyebrow")).toHaveText(
    "Tell us about your research...",
  );
  await page.locator("#intent-new").check();
  await page
    .getByLabel("Project Title", { exact: true })
    .fill("Species and community context");
  await page.locator('#steps [data-stage="1"]').click();
  await expect(page.locator("#q-researchCountry")).toHaveCount(0);
  await page.locator('#steps [data-stage="2"]').click();
  await expect(page.locator("#q-protectedScientificNames")).toHaveCount(0);
  await expect(page.locator("#q-localContextsProjectId")).toHaveCount(0);
  await expect(page.locator("#q-traditionalKnowledge")).toHaveCount(0);
  await expect(page.locator("#help-communityInterests")).toContainText(
    "In most cases, this should be Yes.",
  );
  await expect(page.locator("#communityInterests-yes")).not.toBeChecked();
  await page.locator("#protectedSpecies-yes").check();
  const names = page.getByLabel("Write scientific names we should track.", {
    exact: true,
  });
  await names.fill("Chelonia mydas\nEretmochelys imbricata");
  await page.locator("#communityInterests-yes").check();
  await page
    .getByLabel("Local Contexts Project Identifier", { exact: true })
    .fill("example-project-id");
  await expect(
    page.getByRole("link", { name: "Open the Hub" }),
  ).toHaveAttribute("href", "https://localcontextshub.org/");
  await expect(
    page.getByRole("link", { name: "Project ID instructions" }),
  ).toHaveAttribute("href", "https://localcontexts.org/support/api-guide/v2/");
  await expect
    .poll(async () => (await saved(page)).answers.localContextsProjectId)
    .toBe("example-project-id");
  await names.fill("Chelonia mydas\nChelonia mydas");
  await expect(page.getByRole("alert")).toContainText("contains duplicates");
  expect((await saved(page)).answers.protectedScientificNames).toEqual([
    "Chelonia mydas",
    "Eretmochelys imbricata",
  ]);
  await names.fill("Chelonia mydas\nEretmochelys imbricata");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const doc = await exportResult(page);
  expect(doc.answers.protectedScientificNames).toEqual([
    "Chelonia mydas",
    "Eretmochelys imbricata",
  ]);
  expect(doc.answers.localContextsProjectId).toBe("example-project-id");
  expect(doc.answers.communityInterests).toBe("yes");
  expect(doc.answers.researchCountry).toBeUndefined();
  await page.reload();
  await page.locator('#steps [data-stage="2"]').click();
  await expect(names).toHaveValue("Chelonia mydas\nEretmochelys imbricata");
  await expect(page.locator("#q-localContextsProjectId")).toHaveValue(
    "example-project-id",
  );
  await page.locator("#protectedSpecies-no").check();
  await page.locator("#communityInterests-no").check();
  await expect(names).toHaveCount(0);
  await expect(page.locator("#q-localContextsProjectId")).toHaveCount(0);
});
