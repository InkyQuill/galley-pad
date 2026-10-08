import { expect, test } from "@playwright/test";

test("explains a failed application import instead of leaving an empty window", async ({ page }) => {
  await page.route("**/src/renderApp.tsx", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Galley Pad could not start");
});

test("replaces startup status with the real initialized editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-editor .cm-content")).toBeVisible();
  await expect(page.locator("#startup-status")).toHaveCount(0);
});
