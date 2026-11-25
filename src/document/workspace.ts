import {
  createUntitledSession,
  type DocumentSession,
} from "./session";

export type OpenMode = "tabs" | "windows";

export type DocumentTab = {
  id: string;
  session: DocumentSession;
};

export type DocumentWorkspace = {
  tabs: DocumentTab[];
  activeTabId: string;
  openMode: OpenMode;
};

export function createDocumentWorkspace(
  openMode: OpenMode = "tabs",
): DocumentWorkspace {
  const tab = createDocumentTab(createUntitledSession());

  return {
    tabs: [tab],
    activeTabId: tab.id,
    openMode,
  };
}

export function getActiveDocumentTab(
  workspace: DocumentWorkspace,
): DocumentTab {
  return (
    workspace.tabs.find((tab) => tab.id === workspace.activeTabId) ??
    workspace.tabs[0]
  );
}

export function addDocumentTab(
  workspace: DocumentWorkspace,
  session: DocumentSession = createUntitledSession(),
  id?: string,
): DocumentWorkspace {
  const tab = createDocumentTab(session, id);

  return {
    ...workspace,
    tabs: [...workspace.tabs, tab],
    activeTabId: tab.id,
  };
}

export function openDocumentTab(
  workspace: DocumentWorkspace,
  session: DocumentSession,
  id?: string,
): DocumentWorkspace {
  const existing = session.path
    ? workspace.tabs.find((tab) => tab.session.path === session.path)
    : null;

  if (existing) {
    return setActiveDocumentTab(workspace, existing.id);
  }

  const activeTab = getActiveDocumentTab(workspace);
  if (isReplaceableUntitledTab(activeTab)) {
    const tab = createDocumentTab(session, id);

    return {
      ...workspace,
      tabs: workspace.tabs.map((candidate) =>
        candidate.id === activeTab.id ? tab : candidate,
      ),
      activeTabId: tab.id,
    };
  }

  return addDocumentTab(workspace, session, id);
}

export function setActiveDocumentTab(
  workspace: DocumentWorkspace,
  tabId: string,
): DocumentWorkspace {
  if (!workspace.tabs.some((tab) => tab.id === tabId)) {
    return workspace;
  }

  return {
    ...workspace,
    activeTabId: tabId,
  };
}

export function updateActiveDocumentTab(
  workspace: DocumentWorkspace,
  update: (session: DocumentSession) => DocumentSession,
): DocumentWorkspace {
  return updateDocumentTab(workspace, workspace.activeTabId, update);
}

export function updateDocumentTab(
  workspace: DocumentWorkspace,
  tabId: string,
  update: (session: DocumentSession) => DocumentSession,
): DocumentWorkspace {
  return {
    ...workspace,
    tabs: workspace.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, session: update(tab.session) } : tab,
    ),
  };
}

export function setOpenMode(
  workspace: DocumentWorkspace,
  openMode: OpenMode,
): DocumentWorkspace {
  return {
    ...workspace,
    openMode,
  };
}

export function closeDocumentTab(
  workspace: DocumentWorkspace,
  tabId: string,
  confirmed = false,
): { workspace: DocumentWorkspace; closed: boolean } {
  const tab = workspace.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) {
    return { workspace, closed: false };
  }

  if (tab.session.dirty && !confirmed) {
    return { workspace, closed: false };
  }

  if (workspace.tabs.length === 1) {
    return { workspace: createDocumentWorkspace(workspace.openMode), closed: true };
  }

  const tabIndex = workspace.tabs.findIndex((candidate) => candidate.id === tabId);
  const tabs = workspace.tabs.filter((candidate) => candidate.id !== tabId);
  const activeTabId =
    workspace.activeTabId === tabId
      ? tabs[Math.max(0, tabIndex - 1)].id
      : workspace.activeTabId;

  return {
    workspace: {
      ...workspace,
      tabs,
      activeTabId,
    },
    closed: true,
  };
}

function createDocumentTab(session: DocumentSession, id = `${session.id}:${crypto.randomUUID()}`): DocumentTab {
  return {
    id,
    session,
  };
}

function isReplaceableUntitledTab(tab: DocumentTab): boolean {
  return (
    tab.session.id === "untitled" &&
    tab.session.path === null &&
    !tab.session.dirty &&
    tab.session.content === tab.session.savedContent
  );
}

export function moveDocumentTab(
  workspace: DocumentWorkspace,
  tabId: string,
  targetId: string,
): DocumentWorkspace {
  const from = workspace.tabs.findIndex((tab) => tab.id === tabId);
  const to = workspace.tabs.findIndex((tab) => tab.id === targetId);
  if (from === -1 || to === -1 || from === to) return workspace;

  const tabs = [...workspace.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(to, 0, tab);
  return { ...workspace, tabs };
}
