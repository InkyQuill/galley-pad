import { expect, test, type Page } from "@playwright/test";
import type { PersistedSwapState } from "../../src/tauri/appPersistence";

type DesktopTestBridge = {
  emit(event: string, payload: unknown): boolean;
  files: Record<string, string>;
  pending: Array<{ path: string; allowMissing: boolean }>;
  recent: string[];
  swap?: PersistedSwapState;
  calls: Array<{ command: string; args: Record<string, unknown> }>;
};

declare global {
  interface Window {
    desktopTestBridge: DesktopTestBridge;
  }
}

async function installDesktopTestBridge(
  page: Page,
  initial: Pick<DesktopTestBridge, "files" | "pending" | "swap"> = { files: {}, pending: [] },
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
          if (command === "take_pending_markdown_file_opens") return bridge.pending.splice(0);
          if (command === "claim_document_path") return args.path;
          if (command === "read_swap_state") return bridge.swap ?? null;
          if (command === "read_recent_files") return bridge.recent;
          if (command === "update_recent_file") {
            const path = String(args.path);
            bridge.recent = bridge.recent.filter((entry) => entry !== path);
            if (args.remember) bridge.recent.unshift(path);
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
    bridge.files["/drafts/dropped.md"] = "Before disk edit";
    bridge.emit("tauri://drag-drop", { paths: ["/drafts/ignore.png", "/drafts/dropped.md"], position: { x: 1, y: 1 } });
  });
  await expect(page.getByRole("tabpanel").locator(".cm-content")).toHaveText("Before disk edit");
  await expect.poll(() => page.evaluate(() => window.desktopTestBridge.calls.some(
    ({ command, args }) => command === "watch_active_document" && args.path === "/drafts/dropped.md",
  ))).toBe(true);

  await page.evaluate(() => {
    const bridge = window.desktopTestBridge;
    bridge.files["/drafts/dropped.md"] = "After disk edit";
    bridge.emit("active-document-changed", "/drafts/dropped.md");
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
