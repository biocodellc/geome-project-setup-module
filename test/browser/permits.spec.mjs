import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
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
async function moorea(page) {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("./");
  await page.getByRole("button", { name: "Try an example" }).click();
  await page.locator('[data-example="moorea"]').click();
}
async function download(page) {
  const promise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export JSON", exact: true })
    .first()
    .click();
  const file = await promise;
  const result = JSON.parse(await fs.readFile(await file.path(), "utf8"));
  expect(valid(result), JSON.stringify(valid.errors)).toBe(true);
  return result;
}

test("Moorea planner round trips permit objects while editable observations stay outside shared JSON", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await moorea(page);
  await page.locator('#steps [data-stage="3"]').click();
  await expect(page.locator("#permit-profile")).toHaveValue("gump-moorea-demo");
  await expect(page.locator("#permit-planner")).toContainText(
    "not Gump-approved",
  );
  await page.getByRole("button", { name: "Preview reporting needs" }).click();
  await expect(page.locator("[data-report-sample]")).toHaveCount(4);
  const scuba = page.locator(
    '[data-permit-control="observation"][data-target="dive-event"][data-field="usedScuba"]',
  );
  await scuba.selectOption("false");
  await expect(
    page.locator(
      '[data-report-sample="dna-a"] [data-report-field="usedScuba"]',
    ),
  ).toHaveText("No");
  await scuba.selectOption("");
  await expect(page.locator('[data-report-sample="tissue-a"]')).toContainText(
    "Missing SCUBA used",
  );
  await expect(
    page.locator(
      '[data-report-sample="urchin-tissue"] [data-report-field="usedScuba"]',
    ),
  ).toHaveText("No");
  await expect(
    page.locator('[data-report-sample="urchin-tissue"]'),
  ).toContainText("No linked permit for Fishing");
  await page
    .locator('[data-permit-control="report-filter"]')
    .selectOption("demo-fishing");
  await expect(page.locator("[data-report-sample]")).toHaveCount(3);
  const doc = await download(page);
  expect(doc.version).toBe(4);
  expect(doc.permitPlan.permits).toHaveLength(2);
  expect(doc.permitPlan.targets).toHaveLength(10);
  expect(
    doc.metadataRequirements.find((f) => f.field === "usedScuba"),
  ).toMatchObject({
    recordLevel: "event",
    dataType: "boolean",
    required: true,
  });
  expect(JSON.stringify(doc)).not.toContain("Fictional lagoon station");
  await page.locator("#import-file").setInputFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.locator("#q-projectName")).toHaveValue(
    doc.answers.projectName,
  );
  await page.locator('#steps [data-stage="5"]').click();
  await expect(scuba).toHaveValue("true");
  const roundtrip = await download(page);
  expect(roundtrip.permitPlan).toEqual(doc.permitPlan);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator('#steps [data-stage="3"]').click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("researchers select requirements, add one permit reference, and explicitly assign coverage", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#intent-new").check();
  await page.locator("#q-projectName").fill("New permit plan");
  await page.locator('#steps [data-stage="3"]').click();
  await page.locator("#permit-profile").selectOption("gump-moorea-demo");
  await page
    .locator('[data-permit-control="requirement"][data-id="gump-fishing"]')
    .check();
  await expect(page.locator("#permit-planner")).toContainText("usedScuba");
  await page
    .locator(
      '[data-permit-control="coverage"][data-kind="requirement"][data-target="project"]',
    )
    .check();
  await page.locator("#new-permit-type").selectOption("gump-fishing");
  await page.locator("#new-permit-identifier").fill("FICTIONAL-FISH-42");
  await page
    .getByRole("button", { name: "Add permit reference", exact: true })
    .click();
  await expect
    .poll(async () => (await saved(page)).permitPlan.permits.length)
    .toBe(1);
  expect((await saved(page)).permitPlan.permits[0].coverage).toEqual([]);
  await page
    .locator(
      '[data-permit-control="coverage"][data-kind="permit"][data-target="project"]',
    )
    .check();
  await page
    .getByText(
      "Scope references — expeditions, events, organisms and samples",
      { exact: true },
    )
    .click();
  await page
    .getByRole("button", { name: "Add fictional Moorea scope references" })
    .click();
  await page.getByRole("button", { name: "Preview reporting needs" }).click();
  await expect(page.locator("[data-report-sample]")).toHaveCount(4);
  await expect(
    page.locator('[data-report-sample="urchin-tissue"]'),
  ).toContainText("FICTIONAL-FISH-42");
  const doc = await download(page);
  expect(doc.permitPlan.permits).toHaveLength(1);
  expect(doc.permitPlan.permits[0].coverage).toEqual([
    { level: "project", targetId: "project" },
  ]);
});

test("permit date mismatches are review issues and invalid reference imports leave the current plan intact", async ({
  page,
}) => {
  await moorea(page);
  await page.locator('#steps [data-stage="3"]').click();
  const until = page.locator(
    '[data-permit-control="field"][data-id="demo-fishing"][data-field="validUntil"]',
  );
  await until.fill("2027-02-01");
  await until.press("Tab");
  await expect(page.locator("#permit-error")).toContainText(
    "end date precedes",
  );
  await expect(until).toHaveValue("2027-03-14");
  expect((await saved(page)).permitPlan.permits[1].validUntil).toBe(
    "2027-03-14",
  );
  await until.fill("2027-03-01");
  await until.press("Tab");
  await page.getByRole("button", { name: "Preview reporting needs" }).click();
  await expect(page.locator('[data-report-sample="tissue-a"]')).toContainText(
    "outside the recorded validity",
  );
  const doc = await download(page);
  const before = structuredClone(doc.permitPlan);
  doc.permitPlan.permits[0].coverage[0].targetId = "missing-scope";
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByRole("dialog")).toContainText(
    "Unknown or mismatched coverage",
  );
  expect((await saved(page)).permitPlan).toEqual(before);
});

test("removing an unlinked leaf scope also removes its temporary preview observations", async ({
  page,
}) => {
  await moorea(page);
  await page.locator('#steps [data-stage="3"]').click();
  await page
    .getByText(
      "Scope references — expeditions, events, organisms and samples",
      { exact: true },
    )
    .click();
  await page
    .locator('[data-permit-action="remove-target"][data-id="dna-a"]')
    .click();
  await page.getByRole("button", { name: "Preview reporting needs" }).click();
  await expect(page.locator("[data-report-sample]")).toHaveCount(3);
  await expect(page.locator("#permit-report .inline-error")).toHaveCount(0);
});
