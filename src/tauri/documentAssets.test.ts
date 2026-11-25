import { describe, expect, it } from "vitest";
import { relativeDocumentReference } from "./documentAssets";

describe("relativeDocumentReference", () => {
  it("decodes document-relative file paths and strips fragments", () => {
    expect(relativeDocumentReference("images/a%20b.png#details")).toBe("images/a b.png");
    expect(relativeDocumentReference("notes/a%23b.md")).toBe("notes/a#b.md");
  });

  it("rejects URLs, absolute paths, UNC paths and malformed escapes", () => {
    for (const reference of [
      "https://example.com/a.png",
      "//example.com/a.png",
      "%2Fetc/secret.png",
      "C:/files/a.png",
      "%5C%5Cserver/a.png",
      "image%ZZ.png",
      "image%00.png",
    ]) {
      expect(relativeDocumentReference(reference)).toBeNull();
    }
  });
});
