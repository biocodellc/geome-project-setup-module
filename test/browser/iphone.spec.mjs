import { test, expect } from "@playwright/test";

async function fitsScreen(page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize().width);
}

test("iPhone touch setup stays usable on narrow screens and keeps the current step visible", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#q-projectName")).toBeVisible();
  for (const width of [320, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await fitsScreen(page);
    for (const button of await page
      .locator(".header-actions button, .import-start .dialog-actions button")
      .all()) {
      const bounds = await button.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.setViewportSize({ width: 375, height: 667 });
  await page
    .locator("label.choice")
    .filter({ has: page.locator("#intent-new") })
    .tap();
  await expect(page.locator("#intent-new")).toBeChecked();
  await page.locator("#q-projectName").fill("iPhone field project");
  expect(
    await page
      .locator("#q-projectName")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  for (let stage = 1; stage <= 5; stage++) {
    await page.locator('#wizard-footer [data-action="next"]').tap();
    await expect(page.locator('#steps [aria-current="step"]')).toHaveAttribute(
      "data-stage",
      String(stage),
    );
    await fitsScreen(page);
    const bounds = await page
      .locator('#steps [aria-current="step"]')
      .boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
  }
  await page
    .getByRole("button", { name: "Save configuration", exact: true })
    .tap();
  await page.reload();
  await expect(page.locator("#q-projectName")).toHaveValue(
    "iPhone field project",
  );
  await page.screenshot({
    path: test.info().outputPath("iphone-setup.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await fitsScreen(page);
});

test("iPhone import dialog keeps inputs readable and the close control reachable while scrolling", async ({
  page,
}) => {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Import project description", exact: true })
    .tap();
  const dialog = page.locator("#dialog");
  const input = page.locator("#source-url");
  await input.tap();
  await input.fill("10.1234/example");
  expect(
    await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 350 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await dialog.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await fitsScreen(page);
    expect(
      await dialog.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    const close = page.getByRole("button", { name: "Close dialog" });
    await expect(close).toBeInViewport();
    const bounds = await close.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Close dialog" }).tap();
  await expect(dialog).not.toBeVisible();
});
