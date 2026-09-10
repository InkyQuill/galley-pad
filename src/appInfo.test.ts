import { describe, expect, it } from "vitest";
import { isLinuxDesktop } from "./appInfo";

describe("isLinuxDesktop", () => {
  it.each([
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Mozilla/5.0 (Wayland; Linux x86_64) AppleWebKit/605.1.15",
  ])("recognizes Linux desktop user agents", (userAgent) => {
    expect(isLinuxDesktop(userAgent)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  ])("rejects non-Linux desktop user agents", (userAgent) => {
    expect(isLinuxDesktop(userAgent)).toBe(false);
  });
});
