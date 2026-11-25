import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { TbChevronLeft, TbChevronRight, TbList, TbPlus, TbX } from "react-icons/tb";
import { computeTabPathHints } from "../document/tabLabels";
import type { DocumentTab } from "../document/workspace";
import { TabActionsMenu } from "./TabActionsMenu";

type TabStripProps = {
  tabs: readonly DocumentTab[];
  activeTabId: string;
  hidden: boolean;
  hasClosedTabs: boolean;
  onNewTab: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs: (id: string) => void;
  onReopenClosed: () => void;
  onMoveTab: (id: string, targetId: string) => void;
};

export function TabStrip({
  tabs, activeTabId, hidden, hasClosedTabs, onNewTab, onSelectTab, onCloseTab,
  onCloseOtherTabs, onReopenClosed, onMoveTab,
}: TabStripProps) {
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [tabActions, setTabActions] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [tabScrollState, setTabScrollState] = useState({ canScrollLeft: false, canScrollRight: false });
  const tabMenuRef = useRef<HTMLDivElement>(null);
  const tabScrollerRef = useRef<HTMLDivElement>(null);
  const reorder = useRef<{ tabId: string; pointerId: number; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(0);
  const activeTabIndex = tabs.findIndex(({ id }) => id === activeTabId);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(tabButtonId(activeTabId))
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTabId, activeTabIndex]);

  useEffect(() => {
    if (!tabMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        tabMenuRef.current &&
        !tabMenuRef.current.contains(target)
      ) {
        setTabMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTabMenuOpen(false);
      }
    }

    globalThis.document.addEventListener("pointerdown", handlePointerDown);
    globalThis.document.addEventListener("keydown", handleKeyDown);

    return () => {
      globalThis.document.removeEventListener("pointerdown", handlePointerDown);
      globalThis.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [tabMenuOpen]);

  useEffect(() => {
    const tabScroller = tabScrollerRef.current;
    if (!tabScroller) {
      return;
    }
    const scroller: HTMLDivElement = tabScroller;

    function updateTabScrollState() {
      const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth;
      setTabScrollState({
        canScrollLeft: scroller.scrollLeft > 0,
        canScrollRight: scroller.scrollLeft < maxScrollLeft - 1,
      });
    }

    updateTabScrollState();
    scroller.addEventListener("scroll", updateTabScrollState, { passive: true });
    globalThis.addEventListener("resize", updateTabScrollState);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateTabScrollState);
    observer?.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", updateTabScrollState);
      globalThis.removeEventListener("resize", updateTabScrollState);
      observer?.disconnect();
    };
  }, [tabs.length]);

  function selectTab(id: string) {
    setTabMenuOpen(false);
    onSelectTab(id);
  }

  function selectClickedTab(id: string) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      if (event.detail > 0 && performance.now() < suppressClick.current) return;
      selectTab(id);
    };
  }

  function moveTabBy(id: string, delta: number) {
    const target = tabs[tabs.findIndex((tab) => tab.id === id) + delta];
    if (target) onMoveTab(id, target.id);
  }

  function startReorder(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || tabs.length < 2) return;
    const target = event.target as HTMLElement;
    const tab = target.closest<HTMLButtonElement>('button[role="tab"]');
    const id = tab?.closest<HTMLElement>("[data-tab-id]")?.dataset.tabId;
    if (!tab || !id) return;

    suppressClick.current = 0;
    reorder.current = { tabId: id, pointerId: event.pointerId, startX: event.clientX, moved: false };
    tab.setPointerCapture?.(event.pointerId);
  }

  function pointerTab(event: ReactPointerEvent<HTMLDivElement>): string | undefined {
    const tab = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-tab-id]");
    return tab && event.currentTarget.contains(tab) ? tab.dataset.tabId : undefined;
  }

  function updateReorder(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = reorder.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!gesture.moved && Math.abs(event.clientX - gesture.startX) < 6) return;
    gesture.moved = true;
    const target = pointerTab(event);
    setDropTarget(target && target !== gesture.tabId ? target : null);
  }

  function finishReorder(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = reorder.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    reorder.current = null;
    setDropTarget(null);
    if (!gesture.moved) return;
    suppressClick.current = performance.now() + 150;
    const target = pointerTab(event);
    if (target && target !== gesture.tabId) onMoveTab(gesture.tabId, target);
  }

  function cancelReorder(event: ReactPointerEvent<HTMLDivElement>) {
    if (reorder.current?.pointerId !== event.pointerId) return;
    reorder.current = null;
    setDropTarget(null);
  }

  function handleTabMouseDown(
    event: MouseEvent<HTMLElement>,
    tabId: string,
    closeMenu = false,
  ) {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (closeMenu) {
      setTabMenuOpen(false);
    }
    void onCloseTab(tabId);
  }

  function handleTabKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    const tab = (event.target as HTMLElement).closest<HTMLButtonElement>('button[role="tab"]');
    if (!tab || event.metaKey || event.ctrlKey || event.altKey) return;
    const index = tabs.findIndex(({ id }) => tab.id === tabButtonId(id));
    let next: number;
    switch (event.key) {
      case "ArrowLeft": next = (index - 1 + tabs.length) % tabs.length; break;
      case "ArrowRight": next = (index + 1) % tabs.length; break;
      case "Home": next = 0; break;
      case "End": next = tabs.length - 1; break;
      case "ContextMenu":
      case "F10": {
        if (event.key === "F10" && !event.shiftKey) return;
        const rect = tab.getBoundingClientRect();
        event.preventDefault();
        setTabActions({ tabId: tabs[index].id, x: rect.left, y: rect.bottom });
        return;
      }
      default: return;
    }

    event.preventDefault();
    const target = tabs[next];
    selectTab(target.id);
    window.requestAnimationFrame(() => globalThis.document.getElementById(tabButtonId(target.id))?.focus());
  }

  const dismissTabActions = useCallback((restoreFocus: boolean) => {
    if (restoreFocus && tabActions) {
      globalThis.document.getElementById(tabButtonId(tabActions.tabId))?.focus();
    }
    setTabActions(null);
  }, [tabActions]);

  function scrollTabs(direction: "left" | "right") {
    const scroller = tabScrollerRef.current;
    if (!scroller) {
      return;
    }

    scroller.scrollBy({
      left: (direction === "left" ? -1 : 1) * Math.max(160, scroller.clientWidth * 0.75),
      behavior: "smooth",
    });
  }

  const tabPathHints = computeTabPathHints(
    tabs.map((tab) => ({
      id: tab.id,
      displayName: tab.session.displayName,
      path: tab.session.path,
    })),
  );
  const untitledTabs = tabs.filter(({ session }) => !session.path);
  if (untitledTabs.length > 1) {
    untitledTabs.forEach(({ id }, index) => {
      tabPathHints.set(id, `Draft ${index + 1}`);
    });
  }
  const tabAccessibleName = (tabId: string, displayName: string) => {
    const tab = tabs.find(({ id }) => tabId === id);
    return [displayName, tabPathHints.get(tabId), tab?.session.dirty ? "Unsaved changes" : null]
      .filter(Boolean).join(" — ");
  };

  return (
    <>
    <nav className="tabstrip" aria-label="Open documents" hidden={hidden}>
      <div className="tabstrip-menu" ref={tabMenuRef}>
        <button
          type="button"
          className="tabstrip-action"
          aria-label="Show tabs"
          aria-haspopup="menu"
          aria-expanded={tabMenuOpen}
          onClick={() => setTabMenuOpen((open) => !open)}
        >
          <TbList size={15} strokeWidth={2} aria-hidden="true" />
        </button>
        {tabMenuOpen ? (
          <div className="tab-menu" role="menu" aria-label="Open tabs">
            <ul>
              {tabs.map((tab) => (
                <li
                  className={
                    tab.id === activeTabId
                      ? "tab-menu-item tab-menu-item-active"
                      : "tab-menu-item"
                  }
                  key={tab.id}
                  onMouseDown={(event) =>
                    handleTabMouseDown(event, tab.id, true)
                  }
                >
                  <button
                    type="button"
                    className="tab-menu-select"
                    role="menuitem"
                    aria-label={tabAccessibleName(
                      tab.id,
                      tab.session.displayName,
                    )}
                    onClick={() => selectTab(tab.id)}
                  >
                    <span>{tab.session.displayName}</span>
                    {tabPathHints.get(tab.id) ? (
                      <span className="tab-path-hint" aria-hidden="true">
                        {tabPathHints.get(tab.id)}
                      </span>
                    ) : null}
                    {tab.session.dirty ? <span aria-hidden="true"> *</span> : null}
                  </button>
                  <button
                    type="button"
                    className="tab-menu-close"
                    aria-label={`Close ${tab.session.displayName}`}
                    onClick={() => void onCloseTab(tab.id)}
                  >
                    <TbX size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div
        className="tabstrip-tabs"
        role="tablist"
        aria-label="Open documents"
        ref={tabScrollerRef}
        onKeyDown={handleTabKeys}
        onPointerDown={startReorder}
        onPointerMove={updateReorder}
        onPointerUp={finishReorder}
        onPointerCancel={cancelReorder}
        onLostPointerCapture={cancelReorder}
      >
        {tabs.map((tab) => (
          <div
            className={
              tab.id === activeTabId ? "tab tab-active" : "tab"
            }
            key={tab.id}
            data-tab-id={tab.id}
            data-drop-target={dropTarget === tab.id || undefined}
            onContextMenu={(event) => {
              event.preventDefault();
              setTabActions({ tabId: tab.id, x: event.clientX, y: event.clientY });
            }}
            onMouseDown={(event) => handleTabMouseDown(event, tab.id)}
          >
            <button
              type="button"
              role="tab"
              id={tabButtonId(tab.id)}
              aria-controls={tabPanelId(tab.id)}
              aria-label={tabAccessibleName(tab.id, tab.session.displayName)}
              aria-selected={tab.id === activeTabId}
              tabIndex={tab.id === activeTabId ? 0 : -1}
              onClick={selectClickedTab(tab.id)}
            >
              <span aria-hidden="true">{tab.session.displayName}</span>
              {tabPathHints.get(tab.id) ? (
                <span className="tab-path-hint" aria-hidden="true">
                  {tabPathHints.get(tab.id)}
                </span>
              ) : null}
              {tab.session.dirty ? <span aria-hidden="true"> *</span> : null}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${tab.session.displayName}`}
              onClick={() => void onCloseTab(tab.id)}
            >
              <TbX size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="tabstrip-action"
        aria-label="Scroll tabs left"
        disabled={!tabScrollState.canScrollLeft}
        onClick={() => scrollTabs("left")}
      >
        <TbChevronLeft size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tabstrip-action"
        aria-label="Scroll tabs right"
        disabled={!tabScrollState.canScrollRight}
        onClick={() => scrollTabs("right")}
      >
        <TbChevronRight size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tabstrip-action"
        aria-label="New tab"
        onClick={onNewTab}
      >
        <TbPlus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
    </nav>

    {tabActions ? (
      <TabActionsMenu
        x={tabActions.x}
        y={tabActions.y}
        onDismiss={dismissTabActions}
        actions={[
          { label: "Close tab", run: () => void onCloseTab(tabActions.tabId) },
          { label: "Close other tabs", run: () => void onCloseOtherTabs(tabActions.tabId), disabled: tabs.length < 2 },
          { label: "Reopen closed tab", run: onReopenClosed, disabled: !hasClosedTabs },
          { label: "Move tab left", run: () => moveTabBy(tabActions.tabId, -1), disabled: tabs[0]?.id === tabActions.tabId },
          { label: "Move tab right", run: () => moveTabBy(tabActions.tabId, 1), disabled: tabs[tabs.length - 1]?.id === tabActions.tabId },
        ]}
      />
    ) : null}

    </>
  );
}

export function tabButtonId(tabId: string): string {
  return `document-tab-${tabId}`;
}

export function tabPanelId(tabId: string): string {
  return `document-panel-${tabId}`;
}
