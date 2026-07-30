import { describe, expect, it } from "vitest";
import { resolveAppShortcut, type ShortcutInput } from "./app-shortcuts";

const key = (value: string, overrides: Partial<ShortcutInput> = {}): ShortcutInput => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides
});

describe("application keyboard shortcuts", () => {
  it("maps Alt+1 through Alt+7 to the seven primary workspaces", () => {
    expect(resolveAppShortcut(key("1", { altKey: true }))).toEqual({ kind: "workspace", index: 0 });
    expect(resolveAppShortcut(key("7", { altKey: true }))).toEqual({ kind: "workspace", index: 6 });
    expect(resolveAppShortcut(key("8", { altKey: true }))).toBeNull();
  });

  it("supports keyboard mode changes and cross-platform search focus", () => {
    expect(resolveAppShortcut(key("g", { altKey: true }))).toEqual({ kind: "mode", mode: "Guided" });
    expect(resolveAppShortcut(key("C", { altKey: true }))).toEqual({ kind: "mode", mode: "Compact" });
    expect(resolveAppShortcut(key("t", { altKey: true }))).toEqual({ kind: "toggle-terminal" });
    expect(resolveAppShortcut(key("k", { ctrlKey: true }))).toEqual({ kind: "focus-search" });
    expect(resolveAppShortcut(key("k", { metaKey: true }))).toEqual({ kind: "focus-search" });
  });

  it("rejects ambiguous extra modifiers and unrelated keys", () => {
    expect(resolveAppShortcut(key("1", { altKey: true, shiftKey: true }))).toBeNull();
    expect(resolveAppShortcut(key("g", { altKey: true, ctrlKey: true }))).toBeNull();
    expect(resolveAppShortcut(key("x", { altKey: true }))).toBeNull();
  });
});
