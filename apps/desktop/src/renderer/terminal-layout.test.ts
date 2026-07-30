import { describe, expect, it } from "vitest";
import { terminalExpandedFromStorage, terminalStorageValue } from "./terminal-layout";

describe("terminal layout session state", () => {
  it("defaults to expanded and restores an explicit collapsed state", () => {
    expect(terminalExpandedFromStorage(null)).toBe(true);
    expect(terminalExpandedFromStorage("expanded")).toBe(true);
    expect(terminalExpandedFromStorage("unexpected")).toBe(true);
    expect(terminalExpandedFromStorage("collapsed")).toBe(false);
  });

  it("serializes only the two supported layout values", () => {
    expect(terminalStorageValue(true)).toBe("expanded");
    expect(terminalStorageValue(false)).toBe("collapsed");
  });
});
