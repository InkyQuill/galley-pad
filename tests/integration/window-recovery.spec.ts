import { expect, test, type Page } from "@playwright/test";
import type { PersistedSwapState } from "../../src/tauri/appPersistence";

type DesktopTestBridge = {
  emit(event: string, payload: unknown): boolean;
  files: Record<string, string>;
  pending: Array<{ path: string; allowMissing: boolean }>;
  recent: string[];
  pendingMenu: string[];
  swap?: PersistedSwapState;
  finishWrite?: () => void;
  calls: Array<{ command: string; args: Record<string, unknown> }>;
};

declare global {
  interface Window {
    desktopTestBridge: DesktopTestBridge;
  }
}

async function installDesktopTestBridge(
  page: Page,
  initial: Pick<DesktopTestBridge, "files" | "pending" | "swap"> & { pendingMenu?: string[]; reservedFragment?: string } = { files: {}, pending: [] },
) {
  await page.addInitScript((startup) => {
    const callbacks = new Map<number, (event: unknown) => void>();
    const listeners = new Map<string, number>();
    const calls: DesktopTestBridge["calls"] = [];
    Object.assign(window, {
      desktopTestBridge: {
        calls,
        files: startup.files,
        pending: startup.pending,
        recent: [],
        pendingMenu: startup.pendingMenu ?? [],
        swap: startup.swap,
        emit(event: string, payload: unknown) {
          const handler = callbacks.get(listeners.get(event) ?? 0);
          if (!handler) return false;
          handler({ event, id: 1, payload });
          return true;
        },
      },
      __TAURI_INTERNALS__: {
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        transformCallback(handler: (event: unknown) => void) {
          const id = callbacks.size + 1;
          callbacks.set(id, handler);
          return id;
        },
        async invoke(command: string, args: Record<string, unknown> = {}) {
          calls.push({ command, args });
          if (command === "plugin:event|listen") {
            listeners.set(String(args.event), Number(args.handler));
            return args.handler;
          }
          const bridge = window.desktopTestBridge;
          if (command === "take_pending_menu_commands") return bridge.pendingMenu.splice(0);
          if (command === "take_pending_markdown_file_opens") return bridge.pending.splice(0);
          if (command === "resolve_document_reference") return "/drafts/" + args.relativePath;
          if (command === "claim_document_path") {
            return startup.reservedFragment ? {path: args.path, fragment: startup.reservedFragment} : args.path;
          }
          if (command === "read_swap_state") return bridge.swap ?? null;
          if (command === "read_recent_files") return bridge.recent;
          if (command === "update_recent_file") {
            const path = String(args.path);
            bridge.recent = bridge.recent.filter((entry) => entry !== path);
            if (args.remember) bridge.recent.unshift(path);
          }
          if (command === "write_text_file") {
            const path = String(args.path);
            const content = String(args.content);
            await new Promise<void>((resolve) => { bridge.finishWrite = resolve; });
            delete bridge.finishWrite;
            bridge.files[path] = content;
            return { path, content, lineEnding: "lf", lastModifiedAt: 2, exists: true };
          }
          if (command === "read_text_file") {
            const path = String(args.path);
            const exists = Object.hasOwn(bridge.files, path);
            return { path, content: bridge.files[path] || "", lineEnding: "lf", lastModifiedAt: exists ? 1 : null, exists };
          }
          return null;
        },
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
    });
  }, initial);

}

test("keeps the live draft and recovery state when coordinated quit is cancelled", async ({ page }) => {
  await installDesktopTestBridge(page);
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await editor.click();
  await page.keyboard.insertText("Draft from the first window");
  const history = () => page.evaluate(() => window.desktopTestBridge.calls);
  await expect.poll(history).toEqual(expect.arrayContaining([
    expect.objectContaining({ command: "write_swap_state" }),
  ]));
  const clearedBefore = (await history()).filter(({ command }) => command === "clear_swap_state").length;

  expect(await page.evaluate(() => window.desktopTestBridge.emit("app-quit-check", 1))).toBe(true);
  await page.getByRole("button", { name: "Discard" }).click();
  await expect.poll(history).toEqual(expect.arrayContaining([
    { command: "answer_app_quit_check", args: { requestId: 1, approved: true } },
  ]));
  expect((await history()).filter(({ command }) => command === "clear_swap_state")).toHaveLength(clearedBefore);

  await page.evaluate(() => window.desktopTestBridge.emit("app-quit-cancelled", 1));
  await expect(editor).toHaveText("Draft from the first window");
  await expect(editor).toBeEditable();
});


test("drains native open requests only after the webview can receive them", async ({ page }) => {
  await installDesktopTestBridge(page, {
    files: { "/drafts/early.md": "Queued before the webview" },
    pending: [{ path: "/drafts/early.md", allowMissing: false }],
  });
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await expect(editor).toHaveText("Queued before the webview");

  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.files["/drafts/queued.md"] = "Queued by another instance";
    bridge.pending.push({ path: "/drafts/queued.md", allowMissing: false });
    bridge.emit("markdown-file-opened", null);
  });
  await expect(editor).toHaveText("Queued by another instance");
});

test("opens a dropped Markdown file and warns after an active-file watcher notification", async ({ page }) => {
  await installDesktopTestBridge(page);
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command, args }) => command === "plugin:event|listen" && args.event === "tauri://drag-drop",
  ))).toBe(true);

  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.files["/drafts/dropped.txt"] = "Before disk edit";
    bridge.emit("tauri://drag-drop", { paths: ["/drafts/ignore.png", "/drafts/dropped.txt"], position: { x: 1, y: 1 } });
  });
  await expect(page.getByRole("tabpanel").locator(".cm-content")).toHaveText("Before disk edit");
  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command, args }) => command === "watch_active_document" && args.path === "/drafts/dropped.txt",
  ))).toBe(true);

  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.files["/drafts/dropped.txt"] = "After disk edit";
    bridge.emit("active-document-changed", "/drafts/dropped.txt");
  });
  await expect(page.getByRole("status", { name: "External file update" })).toBeVisible();
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page.getByRole("tabpanel").locator(".cm-content")).toHaveText("After disk edit");
});

test("reopens a file through Open Recent", async ({ page }) => {
  await installDesktopTestBridge(page);
  await page.goto("/");
  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.files["/drafts/recent.md"] = "Recent content";
    bridge.recent = ["/drafts/recent.md"];
  });

  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command, args }) => command === "plugin:event|listen" && args.event === "app-menu-command",
  ))).toBe(true);
  await page.evaluate(() => window.desktopTestBridge.emit("app-menu-command", "open-recent"));
  const recent = page.getByRole("dialog", { name: "Open Recent" });
  await expect(recent).toBeVisible();
  await recent.getByRole("button", { name: /^recent\.md/ }).click();
  await expect(page.getByRole("tabpanel").locator(".cm-content")).toHaveText("Recent content");
});


test("announces recovered unsaved changes and reopens saved tabs from disk", async ({ page }) => {
  await installDesktopTestBridge(page, {
    pending: [],
    files: { "/drafts/saved.md": "Latest saved text" },
    swap: {
      version: 1, savedAt: 1, activeTabId: "draft", openMode: "tabs",
      tabs: [
        { id: "draft", session: {
          id: "untitled", path: null, displayName: "Draft", dirty: true, lineEnding: "lf",
          lastKnownModifiedAt: null, content: "Recovered draft", savedContent: "",
        } },
        { id: "saved", session: {
          id: "file:/drafts/saved.md", path: "/drafts/saved.md", displayName: "saved.md",
          dirty: false, lineEnding: "lf", lastKnownModifiedAt: 1,
        } },
      ],
    },
  });
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await expect(editor).toHaveText("Recovered draft");
  await expect(page.getByRole("status", { name: "Editor recovery" })).toHaveText(/Recovered unsaved changes/);
  await page.getByRole("tab", { name: "saved.md" }).click();
  await expect(editor).toHaveText("Latest saved text");
});

test("can reach the last recent file at the minimum window size", async ({ page }) => {
  await installDesktopTestBridge(page);
  await page.setViewportSize({ width: 640, height: 420 });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command, args }) => command === "plugin:event|listen" && args.event === "app-menu-command",
  ))).toBe(true);
  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.recent = Array.from({ length: 12 }, (_, index) => `/drafts/note-${index + 1}.md`);
    bridge.files["/drafts/note-12.md"] = "Last file";
    bridge.emit("app-menu-command", "open-recent");
  });
  const dialog = page.getByRole("dialog", { name: "Open Recent" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 100, box!.y + 100);
  await page.mouse.wheel(0, 1000);
  const last = dialog.getByRole("button", { name: /^note-12\.md/ });
  await expect(last).toBeInViewport({ ratio: 1 });
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
  await last.click();
  await expect(page.getByRole("tabpanel").locator(".cm-content")).toHaveText("Last file");
});

test("a relative link opens its target document at the requested heading", async ({ page }) => {
  await installDesktopTestBridge(page, {
    files: { "/drafts/index.md": "[Read notes](notes.md#part-two)", "/drafts/notes.md": "# Start\n\n## Part two\n\nEnd" },
    pending: [{ path: "/drafts/index.md", allowMissing: false }],
  });
  await page.addInitScript(() => { Object.assign(window, { isTauri: true }); });
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await expect(editor).toContainText("Read notes");
  await page.getByRole("combobox", {name: "Editor mode"}).selectOption("preview");
  await editor.getByText("Read notes").click({modifiers: ["ControlOrMeta"]});
  await expect(editor).toContainText("Part two");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent)).toContain("Part two");
});


test("delivers Settings queued before the desktop window is ready", async ({ page }) => {
  await installDesktopTestBridge(page, { files: {}, pending: [], pendingMenu: ["settings"] });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
});

test("applies a queued preview command to the newly created tab", async ({ page }) => {
  await installDesktopTestBridge(page, { files: {}, pending: [], pendingMenu: ["new", "mode-preview"] });
  await page.goto("/");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tabpanel").getByRole("combobox", { name: "Editor mode" })).toHaveValue("preview");
});

test("cancels an expired quit prompt without clearing the dirty workspace", async ({ page }) => {
  await installDesktopTestBridge(page);
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await editor.click();
  await page.keyboard.insertText("Unsaved while waiting");
  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command }) => command === "register_app_quit_window",
  ))).toBe(true);
  await page.evaluate(() => window.desktopTestBridge.emit("app-quit-check", 10));
  await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();
  await page.evaluate(() => window.desktopTestBridge.emit("app-quit-cancelled", 10));
  await expect(page.getByRole("button", { name: "Discard" })).toHaveCount(0);
  await expect(editor).toHaveText("Unsaved while waiting");
  await expect(editor).toBeEditable();
});


test("finishes the current save before closing a tab and preserves mixed line endings", async ({ page }) => {
  const path = "/drafts/mixed.md";
  await installDesktopTestBridge(page, {
    files: { [path]: "First\r\nSecond\nThird\r\n" },
    pending: [{ path, allowMissing: false }],
  });
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await expect(editor).toContainText("Second");
  await page.getByRole("button", { name: "New tab" }).click();
  await page.getByRole("tab", { name: "mixed.md" }).click();
  await editor.press("Control+Home");
  await editor.press("ArrowDown");
  await editor.press("Home");
  await page.keyboard.insertText("Edited ");
  await expect(editor).toContainText("Edited Second");

  expect(await page.evaluate(() => window.desktopTestBridge.emit("app-menu-command", "save"))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(window.desktopTestBridge.finishWrite))).toBe(true);
  await page.getByRole("button", { name: "Close mixed.md" }).click();
  await expect(page.getByRole("tab", { name: /mixed.md/ })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Save changes?" })).toHaveCount(0);

  await page.evaluate(() => window.desktopTestBridge.finishWrite?.());
  await expect(page.getByRole("tab", { name: /mixed.md/ })).toHaveCount(0);
  expect(await page.evaluate((file) => window.desktopTestBridge.files[file], path))
    .toBe("First\r\nEdited Second\nThird\r\n");
});

test("answers coordinated quit only after the running save finishes", async ({ page }) => {
  const path = "/drafts/saving.md";
  await installDesktopTestBridge(page, {
    files: { [path]: "Original" },
    pending: [{ path, allowMissing: false }],
  });
  await page.goto("/");
  const editor = page.getByRole("tabpanel").locator(".cm-content");
  await expect(editor).toHaveText("Original");
  await editor.press("End");
  await page.keyboard.insertText(" saved");

  expect(await page.evaluate(() => window.desktopTestBridge.emit("app-menu-command", "save"))).toBe(true);
  await expect.poll(() => page.evaluate(() => Boolean(window.desktopTestBridge.finishWrite))).toBe(true);
  expect(await page.evaluate(() => window.desktopTestBridge.emit("app-quit-check", 11))).toBe(true);
  await expect(page.getByRole("dialog", { name: "Save changes?" })).toHaveCount(0);
  const answers = () => page.evaluate(() =>
    window.desktopTestBridge.calls.filter(({ command }) => command === "answer_app_quit_check"),
  );
  expect(await answers()).toEqual([]);

  await page.evaluate(() => window.desktopTestBridge.finishWrite?.());
  await expect.poll(answers).toEqual([
    { command: "answer_app_quit_check", args: { requestId: 11, approved: true } },
  ]);
  expect(await page.evaluate((file) => window.desktopTestBridge.files[file], path)).toBe("Original saved");
});


test("a starting window reveals a heading requested during its document reservation", async ({ page }) => {
  const path = "/drafts/reserved.md";
  await installDesktopTestBridge(page, {
    files: { [path]: "# First\n\n## Queued heading" },
    pending: [{ path, allowMissing: false }],
    reservedFragment: "queued-heading",
  });
  await page.goto("/");
  await expect(page.getByRole("tab", {name: "reserved.md"})).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent)).toContain("Queued heading");
});
