import { expect, test } from "@playwright/test";

test("renders the document editor shell in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Untitled.md")).toBeVisible();
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(
    page.getByRole("main", { name: "Markdown document editor" }),
  ).toBeVisible();
  await expect(page.getByLabel("Document statistics")).toHaveText("4 words");
});

test("loads the Galley Editor integration without a unit-test mock", async ({
  page,
}) => {
  await page.goto("/");

  const editor = page.getByRole("main", { name: "Markdown document editor" });

  await expect(editor).toBeVisible();
  await expect(editor).toContainText("Untitled");
});
