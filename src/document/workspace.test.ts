import { describe, expect, it } from "vitest";
import { createSessionFromFile, updateSessionContent } from "./session";
import {
  addDocumentTab,
  closeDocumentTab,
  createDocumentWorkspace,
  getActiveDocumentTab,
  openDocumentTab,
  setActiveDocumentTab,
  updateActiveDocumentTab,
} from "./workspace";

describe("document workspace", () => {
  it("starts with one active untitled tab in tabbed open mode", () => {
    const workspace = createDocumentWorkspace();

    expect(workspace.openMode).toBe("tabs");
    expect(workspace.tabs).toHaveLength(1);
    expect(workspace.tabs[0].session.displayName).toBe("Untitled.md");
    expect(workspace.activeTabId).toBe(workspace.tabs[0].id);
    expect(getActiveDocumentTab(workspace)).toBe(workspace.tabs[0]);
  });

  it("adds a new untitled tab and makes it active", () => {
    const first = createDocumentWorkspace();
    const second = addDocumentTab(first);

    expect(second.tabs).toHaveLength(2);
    expect(second.activeTabId).toBe(second.tabs[1].id);
    expect(second.tabs[1].session.displayName).toBe("Untitled.md");
    expect(first.tabs).toHaveLength(1);
  });

  it("opens a file session as an active tab", () => {
    const workspace = createDocumentWorkspace();
    const session = createSessionFromFile({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });

    const next = openDocumentTab(workspace, session);

    expect(next.tabs).toHaveLength(2);
    expect(getActiveDocumentTab(next).session).toMatchObject({
      path: "/tmp/opened.md",
      displayName: "opened.md",
      content: "# Opened\n",
    });
  });

  it("switches to an existing file tab instead of opening a duplicate", () => {
    const session = createSessionFromFile({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    const workspace = addDocumentTab(openDocumentTab(createDocumentWorkspace(), session));

    const next = openDocumentTab(workspace, session);

    expect(next.tabs.filter((tab) => tab.session.path === "/tmp/opened.md")).toHaveLength(1);
    expect(getActiveDocumentTab(next).session.path).toBe("/tmp/opened.md");
  });

  it("updates only the active tab session", () => {
    const workspace = addDocumentTab(createDocumentWorkspace());

    const next = updateActiveDocumentTab(workspace, (session) =>
      updateSessionContent(session, "Changed"),
    );

    expect(getActiveDocumentTab(next).session.content).toBe("Changed");
    expect(next.tabs[0].session.content).not.toBe("Changed");
  });

  it("closes a clean active tab and selects a neighbor", () => {
    const workspace = addDocumentTab(createDocumentWorkspace());
    const closed = closeDocumentTab(workspace, workspace.activeTabId);

    expect(closed.closed).toBe(true);
    expect(closed.workspace.tabs).toHaveLength(1);
    expect(closed.workspace.activeTabId).toBe(closed.workspace.tabs[0].id);
  });

  it("keeps a dirty tab unless closing is confirmed", () => {
    const workspace = updateActiveDocumentTab(createDocumentWorkspace(), (session) =>
      updateSessionContent(session, "Dirty"),
    );

    expect(closeDocumentTab(workspace, workspace.activeTabId, false).closed).toBe(false);
    expect(closeDocumentTab(workspace, workspace.activeTabId, true).closed).toBe(true);
  });

  it("never closes the final tab and replaces it with a new untitled tab", () => {
    const workspace = createDocumentWorkspace();
    const closed = closeDocumentTab(workspace, workspace.activeTabId, true);

    expect(closed.closed).toBe(true);
    expect(closed.workspace.tabs).toHaveLength(1);
    expect(getActiveDocumentTab(closed.workspace).session.displayName).toBe("Untitled.md");
  });

  it("ignores unknown active tab ids", () => {
    const workspace = createDocumentWorkspace();

    expect(setActiveDocumentTab(workspace, "missing")).toBe(workspace);
  });
});
