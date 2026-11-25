import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { GalleyImageInfo } from "@inkyquill/galley-editor";
import * as assets from "../tauri/documentAssets";
import { useDocumentImages } from "./useDocumentImages";

it("retries missing images and refreshes the URL after a file change", async () => {
  const resolve = vi.spyOn(assets, "resolveDocumentReference").mockResolvedValueOnce(null).mockResolvedValue("asset://localhost/doc/chart.svg");
  let onFileChange: (() => void) | undefined;
  const stop = vi.fn();
  const watch = vi.spyOn(assets, "watchDocumentImages").mockImplementation(async (_documentPath, paths, changed) => {
    expect(paths).toEqual(["chart.svg"]);
    onFileChange = changed;
    return stop;
  });
  const { result, unmount } = renderHook(() => useDocumentImages("/doc/a.md", false));
  const image = { url: "chart.svg" } as GalleyImageInfo;
  await act(async () => { result.current(image); });
  expect(result.current(image)).toBeNull();
  expect(onFileChange).toBeDefined();
  await act(async () => { onFileChange?.(); });
  await waitFor(() => expect(result.current(image)).toContain("chart.svg"));
  const first = result.current(image);
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => {
    const next = result.current(image);
    expect(next).toContain("chart.svg");
    expect(next).not.toBe(first);
  });
  expect(resolve).toHaveBeenCalledTimes(3);
  unmount();
  expect(stop).toHaveBeenCalled();
  watch.mockRestore();
  resolve.mockRestore();
});

it("refreshes image URLs when returning to a retained tab", async () => {
  const resolve = vi.spyOn(assets, "resolveDocumentReference").mockResolvedValue("asset://localhost/doc/chart.svg");
  const { result, rerender } = renderHook(({active}) => useDocumentImages("/doc/a.md", false, active), {
    initialProps: {active: true},
  });
  const image = { url: "chart.svg" } as GalleyImageInfo;
  await act(async () => { result.current(image); });
  const first = result.current(image);
  expect(first).toContain("chart.svg");
  rerender({active: false});
  rerender({active: true});
  await act(async () => { result.current(image); });
  expect(result.current(image)).toContain("chart.svg");
  expect(result.current(image)).not.toBe(first);
  resolve.mockRestore();
});
