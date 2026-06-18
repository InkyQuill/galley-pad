import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { pickOpenFile, pickSaveFile } from "./tauri/dialogs";
import { readTextFile, writeTextFile } from "./tauri/files";

vi.mock("@inky/galley-editor", () => import("./test/galley-editor.mock"));
vi.mock("./tauri/dialogs", () => ({
  pickOpenFile: vi.fn(),
  pickSaveFile: vi.fn(),
}));
vi.mock("./tauri/files", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

const pickOpenFileMock = vi.mocked(pickOpenFile);
const pickSaveFileMock = vi.mocked(pickSaveFile);
const readTextFileMock = vi.mocked(readTextFile);
const writeTextFileMock = vi.mocked(writeTextFile);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    document.title = "";
  });

  it("renders the single-document editor shell with file commands", () => {
    const { container } = render(<App />);

    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save As" })).toBeInTheDocument();
    expect(screen.getByText("Untitled.md")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(
      screen.getByRole("main", { name: "Markdown document editor" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "4 words",
    );
    expect(document.title).toBe("Untitled.md - Galley Pad");

    const appShell = container.querySelector(".app-shell");
    expect(appShell?.children.item(2)).toHaveClass("command-error-slot");
    expect(appShell?.children.item(3)).toHaveClass("document-view");
    expect(
      screen.queryByRole("alert", { name: "File command error" }),
    ).not.toBeInTheDocument();
  });

  it("marks the session dirty when editor content changes and updates the title", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "One two three" },
    });

    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.getByLabelText("Document statistics")).toHaveTextContent(
      "3 words",
    );
    expect(document.title).toBe("* Untitled.md - Galley Pad");
  });

  it("creates a new document after confirming dirty replacement", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Discard unsaved changes to Untitled.md?",
    );
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "# Untitled\n\nStart writing Markdown.\n",
    );
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("keeps the dirty document when New replacement is cancelled", () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "Dirty draft" },
    });

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue(
      "Dirty draft",
    );
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
  });

  it("opens a selected file and updates the session", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      content: "# Opened\n",
      lineEnding: "lf",
      lastModifiedAt: 10,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(screen.getByText("opened.md")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Mock Galley Editor")).toHaveValue("# Opened\n");
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(document.title).toBe("opened.md - Galley Pad");
  });

  it("saves a dirty file-backed document", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      });
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/opened.md",
      lineEnding: "lf",
      lastModifiedAt: 11,
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("opened.md");
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Opened\n\nUpdated.\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/opened.md",
        "# Opened\n\nUpdated.\n",
      );
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("saves an untitled document through Save As", async () => {
    pickSaveFileMock.mockResolvedValue("/tmp/new.md");
    writeTextFileMock.mockResolvedValue({
      path: "/tmp/new.md",
      lineEnding: "lf",
      lastModifiedAt: 20,
    });
    render(<App />);
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# New content\n" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(writeTextFileMock).toHaveBeenCalledWith(
        "/tmp/new.md",
        "# New content\n",
      );
    });
    expect(screen.getByText("new.md")).toBeInTheDocument();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows an error when Save detects an external file change", async () => {
    pickOpenFileMock.mockResolvedValue("/tmp/opened.md");
    readTextFileMock
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# Opened\n",
        lineEnding: "lf",
        lastModifiedAt: 10,
      })
      .mockResolvedValueOnce({
        path: "/tmp/opened.md",
        content: "# External\n",
        lineEnding: "lf",
        lastModifiedAt: 99,
      });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByText("opened.md");
    fireEvent.change(screen.getByLabelText("Mock Galley Editor"), {
      target: { value: "# Local\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await expect(
      screen.findByRole("alert", { name: "File command error" }),
    ).resolves.toHaveTextContent("Use Save As to avoid overwriting");
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });
});
