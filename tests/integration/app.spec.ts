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

test("sizes the editor surface to the full document window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 720 });
  await page.goto("/");

  const editor = page.getByRole("main", { name: "Markdown document editor" });
  const editorShell = editor.locator(".ge-editor-shell");

  await expect(editorShell).toBeVisible();
  await expect
    .poll(() => editor.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(650);
  await expect
    .poll(() =>
      editorShell.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThan(650);

  await page.setViewportSize({ width: 980, height: 540 });

  await expect
    .poll(() => editor.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(480);
  await expect
    .poll(() =>
      editorShell.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThan(480);
});
