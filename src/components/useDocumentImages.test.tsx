import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { GalleyImageInfo } from "@inkyquill/galley-editor";
import * as assets from "../tauri/documentAssets";
import { useDocumentImages } from "./useDocumentImages";

it("refreshes image URLs without restarting the same watch and stops the active watch on unmount", async () => {
  const resolve = vi.spyOn(assets, "resolveDocumentReference")
    .mockResolvedValue("asset://localhost/doc/chart.svg");
  const stopCallbacks: Array<ReturnType<typeof vi.fn>> = [];
  let onFileChange: (() => void) | undefined;
  const watch = vi.spyOn(assets, "watchDocumentImages").mockImplementation(async (_documentPath, paths, changed) => {
    expect(paths).toEqual(["chart.svg"]);
    onFileChange = changed;
    const stop = vi.fn();
    stopCallbacks.push(stop);
    return stop;
  });
  const image = { url: "chart.svg" } as GalleyImageInfo;
  const { result, unmount } = renderHook(() => useDocumentImages("/doc/a.md", false)(image));
  await waitFor(() => expect(result.current).toContain("chart.svg"));
  expect(watch).toHaveBeenCalledTimes(1);
  const first = result.current;
  await act(async () => { onFileChange?.(); });
  await waitFor(() => {
    expect(result.current).toContain("chart.svg");
    expect(result.current).not.toBe(first);
  });
  const second = result.current;
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => {
    expect(result.current).toContain("chart.svg");
    expect(result.current).not.toBe(second);
  });
  expect(watch).toHaveBeenCalledTimes(1);
  const [activeStop] = stopCallbacks;
  expect(activeStop).not.toHaveBeenCalled();
  unmount();
  expect(activeStop).toHaveBeenCalledOnce();
  watch.mockRestore();
  resolve.mockRestore();
});

it("rechecks a missing image after the native watch starts", async () => {
  const resolve = vi.spyOn(assets, "resolveDocumentReference")
    .mockResolvedValueOnce(null)
    .mockResolvedValue("asset://localhost/doc/chart.svg");
  let finishWatch: (() => void) | undefined;
  const stopFirst = vi.fn();
  const stopFinal = vi.fn();
  const watch = vi.spyOn(assets, "watchDocumentImages").mockImplementationOnce(
    () => new Promise((done) => { finishWatch = () => done(stopFirst); }),
  ).mockResolvedValueOnce(stopFinal);
  const { result, unmount } = renderHook(() => useDocumentImages("/doc/a.md", false));
  const image = { url: "chart.svg" } as GalleyImageInfo;
  await act(async () => { result.current(image); });
  await waitFor(() => expect(finishWatch).toBeDefined());
  expect(result.current(image)).toBeNull();
  await act(async () => finishWatch?.());
  await waitFor(() => expect(result.current(image)).toContain("chart.svg"));
  expect(watch).toHaveBeenCalledTimes(2);
  expect(stopFirst).toHaveBeenCalledOnce();
  expect(stopFinal).not.toHaveBeenCalled();
  unmount();
  expect(stopFinal).toHaveBeenCalledOnce();
  watch.mockRestore();
  resolve.mockRestore();
});

it("refreshes image URLs when returning to a retained tab", async () => {
  const resolve = vi.spyOn(assets, "resolveDocumentReference").mockResolvedValue("asset://localhost/doc/chart.svg");
  const watch = vi.spyOn(assets, "watchDocumentImages").mockResolvedValue(vi.fn());
  const image = { url: "chart.svg" } as GalleyImageInfo;
  const { result, rerender, unmount } = renderHook(
    ({ active }) => useDocumentImages("/doc/a.md", false, active)(image),
    { initialProps: { active: true } },
  );
  await waitFor(() => expect(result.current).toContain("chart.svg"));
  const first = result.current;
  rerender({ active: false });
  expect(result.current).toBeNull();
  rerender({ active: true });
  await waitFor(() => {
    expect(result.current).toContain("chart.svg");
    expect(result.current).not.toBe(first);
  });
  unmount();
  watch.mockRestore();
  resolve.mockRestore();
});
