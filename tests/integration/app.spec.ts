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

test("marks the document unsaved after editor changes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Draft")).toBeVisible();

  await page.locator(".cm-content").click();
  await page.keyboard.type("\nAdditional text");

  await expect(page.getByText("Unsaved")).toBeVisible();
  await expect(page.getByLabel("Document statistics")).toHaveText("6 words");
});

test("sizes the editor surface to the full document window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 720 });
  await page.goto("/");

  const editor = page.getByRole("main", { name: "Markdown document editor" });
  const editorShell = editor.locator(".ge-editor-shell");
  const codeMirror = editor.locator(".cm-editor");
  const scroller = editor.locator(".cm-scroller");
  const footer = editor.locator(".ge-footer");
  const footerGap = async () =>
    footer.evaluate((element) => {
      const editorBounds = element
        .closest(".document-view")
        ?.getBoundingClientRect();
      if (!editorBounds) {
        throw new Error("Expected Galley Editor footer to be inside .document-view");
      }

      const footerBounds = element.getBoundingClientRect();
      return editorBounds.bottom - footerBounds.bottom;
    });
  const codeMirrorFooterGap = async () =>
    codeMirror.evaluate((element) => {
      const footerBounds = element
        .closest(".ge-editor-shell")
        ?.querySelector(".ge-footer")
        ?.getBoundingClientRect();
      if (!footerBounds) {
        throw new Error("Expected Galley Editor shell to contain .ge-footer");
      }

      const codeMirrorBounds = element.getBoundingClientRect();
      return footerBounds.top - codeMirrorBounds.bottom;
    });
  const heights = async () => ({
    editor: await editor.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
    editorShell: await editorShell.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
    codeMirror: await codeMirror.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
    scroller: await scroller.evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  });

  await expect(editorShell).toBeVisible();
  await expect(codeMirror).toBeVisible();
  await expect(footer).toBeVisible();
  const largeViewportHeights = await heights();
  expect(largeViewportHeights.editor).toBeGreaterThan(0);
  expect(largeViewportHeights.editorShell).toBeGreaterThan(0);
  expect(largeViewportHeights.codeMirror).toBeGreaterThan(0);
  expect(largeViewportHeights.scroller).toBeGreaterThan(0);
  await expect.poll(codeMirrorFooterGap).toBeLessThan(2);
  await expect.poll(footerGap).toBeLessThan(2);

  await page.setViewportSize({ width: 980, height: 540 });

  await expect
    .poll(async () => (await heights()).editor)
    .toBeLessThan(largeViewportHeights.editor);
  await expect
    .poll(async () => (await heights()).editorShell)
    .toBeLessThan(largeViewportHeights.editorShell);
  await expect
    .poll(async () => (await heights()).codeMirror)
    .toBeLessThan(largeViewportHeights.codeMirror);
  await expect
    .poll(async () => (await heights()).scroller)
    .toBeLessThan(largeViewportHeights.scroller);
  await expect.poll(codeMirrorFooterGap).toBeLessThan(2);
  await expect.poll(footerGap).toBeLessThan(2);
});
