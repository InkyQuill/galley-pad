import { expect, it } from "vitest";
import { focusForeground } from "./focusForeground";

it("uses the higher contrast foreground on light and dark theme accent colors", () => {
  expect(focusForeground("#5d7cda")).toBe("#000");
  expect(focusForeground("#076678")).toBe("#fff");
  expect(focusForeground("#89b4fa")).toBe("#000");
});
