import { expect, test, type Page } from "@playwright/test";

const activeEditor = (page: Page) => page.getByRole("tabpanel").locator(".cm-content");

async function replaceContent(page: Page, content: string) {
  await activeEditor(page).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(content);
}

test("navigates the live document outline and updates entries after editing", async ({ page }) => {
  await page.goto("/");
  const paragraphs = Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1}.`).join("\n\n");
  await replaceContent(page, `# First\n\n\`\`\`md\n## Fenced\n\`\`\`\n\n${paragraphs}\n\n## **Details**\n\n${paragraphs}`);
  await page.keyboard.press("ControlOrMeta+Home");
  await page.keyboard.press("ControlOrMeta+Shift+o");

  const outline = page.getByRole("navigation", { name: "Table of contents" });
  await expect(outline.getByRole("button", { name: "Fenced" })).toHaveCount(0);
  const first = outline.getByRole("button", { name: "First" });
  const details = outline.getByRole("button", { name: "Details" });
  await expect(first).toHaveAttribute("aria-current", "location");
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(details).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(activeEditor(page)).toBeFocused();
  await expect(details).toHaveAttribute("aria-current", "location");

  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText("\n\n### New section");
  await expect(outline.getByRole("button", { name: "New section" })).toBeVisible();
});

test("keeps an independent undo history when returning to a tab", async ({ page }) => {
  await page.goto("/");
  await expect(activeEditor(page)).toBeFocused();
  await page.keyboard.insertText("draft one");
  await page.getByRole("button", { name: "New tab", exact: true }).click();
  await expect(activeEditor(page)).toBeFocused();
  await page.keyboard.insertText("draft two");

  await page.getByRole("tab").first().click();
  await expect(activeEditor(page)).toHaveText("draft one");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(activeEditor(page)).toHaveText("");
  await page.getByRole("tab").last().click();
  await expect(activeEditor(page)).toHaveText("draft two");
});

test("offers reading modes with the formatting toolbar hidden", async ({ page }) => {
  await page.goto("/");
  await replaceContent(page, "**Read this**");
  const mode = page.getByRole("combobox", { name: "Editor mode" });
  await mode.selectOption("markdown");
  await expect(activeEditor(page)).toHaveText("**Read this**");
  await mode.selectOption("preview");
  await expect(activeEditor(page)).toHaveText("Read this");
});

test("overlays the outline at a narrow width and dismisses it after navigation", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 620 });
  await page.goto("/");
  await replaceContent(page, "# First\n\n## Second");
  await page.getByRole("button", { name: "Table of contents", exact: true }).click();
  const outline = page.getByRole("navigation", { name: "Table of contents" });
  await expect(outline).toHaveCSS("position", "absolute");
  await outline.getByRole("button", { name: "Second" }).click();
  await expect(outline).toHaveCount(0);
  await expect(activeEditor(page)).toBeFocused();
});

test("reorders tabs and supports tab shortcuts and context actions", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("tab");
  const first = await tabs.first().getAttribute("id");
  await page.getByRole("button", { name: "New tab" }).click();
  const second = await tabs.last().getAttribute("id");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Control+Tab");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.last()).toBeFocused();
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");

  await tabs.last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Move tab left" }).click();
  await expect(tabs.first()).toHaveAttribute("id", second!);
  await expect(tabs.last()).toHaveAttribute("id", first!);

  await tabs.first().dragTo(tabs.last());
  await expect(tabs.first()).toHaveAttribute("id", first!);
  await expect(tabs.last()).toHaveAttribute("id", second!);

  await tabs.last().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Close other tabs" }).click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute("id", second!);
});

test("applies reading preferences and only fetches remote images after opt-in", async ({ page }) => {
  const imageUrl = "https://images.example/diagram.png";
  let imageRequests = 0;
  await page.route(imageUrl, async (route) => {
    imageRequests += 1;
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZHsAAAAASUVORK5CYII=", "base64"),
    });
  });
  await page.goto("/");
  await replaceContent(page, `![Diagram](${imageUrl})\n\nText below`);
  await page.getByRole("combobox", { name: "Editor mode" }).selectOption("preview");
  await expect(activeEditor(page).locator(`img[src="${imageUrl}"]`)).toHaveCount(0);
  expect(imageRequests).toBe(0);

  await page.keyboard.press("ControlOrMeta+,");
  const settings = page.getByRole("dialog", { name: "Settings" });
  await settings.getByLabel("Reading width").selectOption("72");
  await settings.getByLabel("Spellcheck").check();
  await settings.getByLabel("Load remote HTTPS images").check();
  await settings.getByRole("button", { name: "Close settings" }).click();

  await expect(page.getByRole("tabpanel").locator(".document-editor")).toHaveAttribute("data-line-width", "72");
  await expect(activeEditor(page)).toHaveAttribute("spellcheck", "true");
  await expect.poll(() => imageRequests).toBeGreaterThan(0);
});

test("font search supports arrow navigation and Escape inside Settings", async ({ page }) => {
  await page.goto("/");
  await expect(activeEditor(page)).toBeFocused();
  await page.keyboard.press("ControlOrMeta+,");
  const settings = page.getByRole("dialog", { name: "Settings" });
  const trigger = settings.getByRole("button", { name: /System default/ });
  await trigger.click();
  const search = settings.getByRole("combobox", { name: "Search fonts" });
  await expect(search).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const system = settings.getByRole("option", { name: "System default" });
  await expect(search).toHaveAttribute("aria-activedescendant", (await system.getAttribute("id"))!);
  await page.keyboard.press("Escape");
  await expect(settings).toBeVisible();
  await expect(trigger).toBeFocused();
});
