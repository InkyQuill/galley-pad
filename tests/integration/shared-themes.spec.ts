import { expect, test } from "@playwright/test";

const THEME_SETTINGS_STORAGE_KEY = "galley-pad.themeSettings";
const EDITOR_FONT_FAMILY_STORAGE_KEY = "galley-pad.editorFontFamily";
const EDITOR_FONT_SIZE_STORAGE_KEY = "galley-pad.editorFontSize";
const MONO_EDITOR_FONT_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace';
const GALLEY_DARK_EDITOR_BG = "#111820";
const GALLEY_LIGHT_EDITOR_BG = "#fbfaf7";

async function editorBackground(page: import("@playwright/test").Page): Promise<string> {
  return page
    .locator(".cm-editor")
    .first()
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--ge-color-bg").trim(),
    );
}

test("theme still styles the real editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cm-editor").first()).toBeVisible();
  const bg = await editorBackground(page);
  expect(bg).not.toBe("");
});

test("switching between light and dark themes restyles the real editor", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator(".cm-editor").first()).toBeVisible();
  expect(await editorBackground(page)).toBe(GALLEY_LIGHT_EDITOR_BG);

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator(".cm-editor").first()).toBeVisible();
  expect(await editorBackground(page)).toBe(GALLEY_DARK_EDITOR_BG);
});

test("persisted editor font settings still reach the real editor", async ({
  page,
}) => {
  await page.addInitScript(
    ([familyKey, sizeKey]) => {
      window.localStorage.setItem(familyKey, "mono");
      window.localStorage.setItem(sizeKey, "large");
    },
    [EDITOR_FONT_FAMILY_STORAGE_KEY, EDITOR_FONT_SIZE_STORAGE_KEY],
  );
  await page.goto("/");
  await expect(page.locator(".cm-editor").first()).toBeVisible();

  const surface = page.locator(".galley-pad-editor-surface").first();
  await expect(surface).toBeVisible();
  const style = await surface.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      fontFamily: computed.getPropertyValue("--ge-font-body").trim(),
      fontSize: computed.getPropertyValue("--ge-font-size").trim(),
    };
  });
  expect(style.fontFamily).toBe(MONO_EDITOR_FONT_STACK);
  expect(style.fontSize).toBe("1.125rem");
});
