import { expect, test, type Locator } from "@playwright/test";

type SelectionMutation = {
  attribute: "aria-selected" | "class";
  currentValue: string | null;
  oldValue: string | null;
};

async function observeSelectionMutations(
  target: Locator,
): Promise<() => Promise<SelectionMutation[]>> {
  const handle = await target.elementHandle();
  if (!handle) {
    throw new Error("Expected selection target to be attached");
  }

  await handle.evaluate((element) => {
    type TrackedElement = Element & {
      __selectionTracker?: {
        changes: SelectionMutation[];
        observer: MutationObserver;
      };
    };
    const trackedElement = element as TrackedElement;
    const changes: SelectionMutation[] = [];
    const record = (mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        const attribute = mutation.attributeName;
        if (attribute !== "aria-selected" && attribute !== "class") {
          continue;
        }
        changes.push({
          attribute,
          currentValue: (mutation.target as Element).getAttribute(attribute),
          oldValue: mutation.oldValue,
        });
      }
    };
    const observer = new MutationObserver(record);
    observer.observe(element, {
      attributeFilter: ["aria-selected", "class"],
      attributeOldValue: true,
      attributes: true,
      subtree: true,
    });
    trackedElement.__selectionTracker = { changes, observer };
  });

  return () =>
    handle.evaluate((element) => {
      type TrackedElement = Element & {
        __selectionTracker?: {
          changes: SelectionMutation[];
          observer: MutationObserver;
        };
      };
      const tracker = (element as TrackedElement).__selectionTracker;
      if (!tracker) {
        throw new Error("Expected selection mutation tracker");
      }
      for (const mutation of tracker.observer.takeRecords()) {
        const attribute = mutation.attributeName;
        if (attribute !== "aria-selected" && attribute !== "class") {
          continue;
        }
        tracker.changes.push({
          attribute,
          currentValue: (mutation.target as Element).getAttribute(attribute),
          oldValue: mutation.oldValue,
        });
      }
      tracker.observer.disconnect();
      return tracker.changes;
    });
}

function expectNeverSelected(
  mutations: SelectionMutation[],
  activeClass: string,
): void {
  const values = mutations.flatMap(({ attribute, currentValue, oldValue }) =>
    [currentValue, oldValue].map((value) => ({ attribute, value })),
  );
  expect(
    values.some(
      ({ attribute, value }) =>
        (attribute === "aria-selected" && value === "true") ||
        (attribute === "class" && value?.split(/\s+/).includes(activeClass)),
    ),
  ).toBe(false);
}

test("renders the document editor shell in a real browser", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Untitled.md - Galley Pad");
  await expect(page.getByText("Draft")).toBeVisible();
  await expect(
    page.getByRole("tabpanel", { name: "Untitled.md" }),
  ).toBeVisible();
  await expect(page.locator(".document-footer-words")).toHaveText("0 words");
  await expect(
    page.locator('.ge-toolbar[aria-label="Editor toolbar"]'),
  ).not.toBeVisible();
});

test("loads the Galley Editor integration without a unit-test mock", async ({
  page,
}) => {
  await page.goto("/");

  const editor = page.getByRole("tabpanel", { name: "Untitled.md" });

  await expect(editor).toBeVisible();
  await expect(editor.locator(".cm-editor")).toBeVisible();
});

test("switches the real editor between wrapped and horizontal layouts", async ({
  page,
}) => {
  await page.goto("/");

  const editor = page.locator(".cm-editor");
  await expect(editor).toHaveClass(/ge-width-constrained/);

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("galley-pad-test-menu-command", {
        detail: "toggle-word-wrap",
      }),
    );
  });

  await expect(editor).toHaveClass(/ge-horizontal-scroll/);
});

test("opens Galley Editor search with the platform find shortcut", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".cm-content").click();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+F" : "Control+F",
  );

  await expect(page.locator(".cm-search")).toBeVisible();
  await expect(page.locator('input[name="search"]')).toBeFocused();
});

test("opens the real editor search panel through the development menu-command hook", async ({
  page,
}) => {
  await page.goto("/");

  const editor = page.getByRole("tabpanel", { name: "Untitled.md" });
  await expect(editor.locator(".cm-search")).not.toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("galley-pad-test-menu-command", { detail: "find" }),
    );
  });

  await expect(editor.locator(".cm-search")).toBeVisible();
});

test("marks the document unsaved after editor changes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Draft")).toBeVisible();

  await page.locator(".cm-content").click();
  await page.keyboard.type("\nAdditional text");

  await expect(page.getByText("Unsaved")).toBeVisible();
  await expect(page.locator(".document-footer-words")).toHaveText("2 words");
});

test("creates and switches document tabs with the new document shortcut", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("tab", { name: "Untitled.md" })).toHaveCount(1);

  await page.locator("body").click();
  await page.keyboard.press("Control+N");

  await expect(page.getByRole("tab", { name: "Untitled.md" })).toHaveCount(2);
  await expect(page.getByRole("tab", { name: "Untitled.md" }).nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("sizes the editor surface to the full document window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 720 });
  await page.goto("/");

  const editor = page.getByRole("tabpanel", { name: "Untitled.md" });
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

test("hides the Galley toolbar by default and shows it with the toolbar shortcut", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.locator(".ge-toolbar")).not.toBeVisible();

  await page.locator("body").click();
  await page.keyboard.press("Control+Shift+T");

  await expect(page.locator(".ge-toolbar")).toBeVisible();
  await expect(page.locator(".ge-toolbar svg").first()).toBeVisible();
});

test.describe("Linux Chromium footer menu", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  });

  test(
    "runs commands and restores trigger focus on Escape",
    async ({ page }, testInfo) => {
      expect(testInfo.project.name).toBe("chromium");
      await page.goto("/");

      const menuTrigger = page.getByRole("button", {
        name: "Galley Pad menu",
      });
      const tabs = page.getByRole("tab", { name: "Untitled.md" });

      await expect(menuTrigger).toBeVisible();
      await expect(tabs).toHaveCount(1);

      await menuTrigger.click();
      await page.getByRole("menuitem", { name: "New", exact: true }).click();
      await expect(tabs).toHaveCount(2);

      await menuTrigger.click();
      await page
        .getByRole("menuitem", { name: "Toggle Editor Toolbar" })
        .click();
      await expect(
        page.locator('.ge-toolbar[aria-label="Editor toolbar"]'),
      ).toBeVisible();

      await menuTrigger.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toBeHidden();
      await expect(menuTrigger).toBeFocused();
    },
  );
});

test("shows close controls by active and hover state and middle-clicks tabs closed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("button", { name: "New tab" }).click();

  const tabs = page.getByRole("tab", { name: "Untitled.md" });
  const inactiveTab = page.locator(".tab").nth(0);
  const otherInactiveTab = page.locator(".tab").nth(1);
  const activeTab = page.locator(".tab").nth(2);
  const inactiveClose = inactiveTab.locator(".tab-close");
  const otherInactiveClose = otherInactiveTab.locator(".tab-close");
  const activeClose = activeTab.locator(".tab-close");
  const activeTabId = await tabs.nth(2).getAttribute("id");

  expect(activeTabId).not.toBeNull();
  await expect(activeClose).toHaveCSS("visibility", "visible");
  await expect(inactiveClose).toHaveCSS("visibility", "hidden");
  await expect(otherInactiveClose).toHaveCSS("visibility", "hidden");

  await inactiveTab.hover();
  await expect(inactiveClose).toHaveCSS("visibility", "visible");
  await expect(otherInactiveClose).toHaveCSS("visibility", "hidden");
  await expect(activeClose).toHaveCSS("visibility", "visible");

  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(inactiveTab).not.toHaveClass(/\btab-active\b/);
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  const readTabMutations = await observeSelectionMutations(inactiveTab);
  await tabs.nth(0).click({ button: "middle" });
  expectNeverSelected(await readTabMutations(), "tab-active");
  await expect(tabs).toHaveCount(2);
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute(
    "id",
    activeTabId!,
  );

  await page.getByRole("button", { name: "New tab" }).click();
  const menuActiveTabId = await tabs.nth(2).getAttribute("id");
  expect(menuActiveTabId).not.toBeNull();

  await page.getByRole("button", { name: "Show tabs" }).click();
  const tabMenu = page.getByRole("menu", { name: "Open tabs" });
  const inactiveMenuRow = tabMenu.locator(".tab-menu-item").nth(0);
  await expect(inactiveMenuRow).toBeVisible();
  await expect(inactiveMenuRow).not.toHaveClass(/\btab-menu-item-active\b/);
  const readMenuMutations = await observeSelectionMutations(inactiveMenuRow);
  await inactiveMenuRow.click({ button: "middle" });

  expectNeverSelected(await readMenuMutations(), "tab-menu-item-active");
  await expect(tabMenu).toBeHidden();
  await expect(tabs).toHaveCount(2);
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute(
    "id",
    menuActiveTabId!,
  );
});

test("cancels middle-button editor events without cancelling tabstrip events", async ({
  page,
}) => {
  await page.goto("/");

  for (const type of ["mousedown", "auxclick"] as const) {
    const editorResult = await page.locator(".cm-content").evaluate(
      (target, eventType) => {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          button: 1,
          cancelable: true,
        });
        const dispatchResult = target.dispatchEvent(event);
        return { defaultPrevented: event.defaultPrevented, dispatchResult };
      },
      type,
    );

    expect(editorResult).toEqual({
      defaultPrevented: true,
      dispatchResult: false,
    });

    const tabstripResult = await page.locator(".tabstrip").evaluate(
      (target, eventType) => {
        const event = new MouseEvent(eventType, {
          bubbles: true,
          button: 1,
          cancelable: true,
        });
        const dispatchResult = target.dispatchEvent(event);
        return { defaultPrevented: event.defaultPrevented, dispatchResult };
      },
      type,
    );

    expect(tabstripResult).toEqual({
      defaultPrevented: false,
      dispatchResult: true,
    });
  }
});

test("scrolls long Markdown content inside the editor surface", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 540 });
  await page.goto("/");

  await page.locator(".cm-content").click();
  await page.keyboard.insertText(
    Array.from({ length: 120 }, (_, index) => `Line ${index + 1}`).join("\n"),
  );

  const scroller = page.locator(".cm-scroller");
  await expect
    .poll(async () => {
      const metrics = await scroller.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }));
      return metrics.scrollHeight > metrics.clientHeight;
    })
    .toBe(true);

  const scrollTop = await scroller.evaluate((element) => {
    element.scrollTop = 240;
    return element.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
});

test("shows external update banner and opens reconcile view", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("galley-pad-test-external-update", {
        detail: {
          displayName: "notes.md",
          current: "Current\n",
          incoming: "Incoming\n",
        },
      }),
    );
  });

  await expect(
    page.getByRole("status", { name: "External file update" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Incoming from disk" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Reconcile" }).click();
  await expect(
    page.getByRole("region", { name: "Current in Galley Pad" }),
  ).toContainText("Current");
  await expect(
    page.getByRole("region", { name: "Incoming from disk" }),
  ).toContainText("Incoming");
});
