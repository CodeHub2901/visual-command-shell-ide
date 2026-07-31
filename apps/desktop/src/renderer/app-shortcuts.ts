// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type AppShortcut =
  | { kind: "workspace"; index: number }
  | { kind: "mode"; mode: "Guided" | "Compact" }
  | { kind: "focus-search" }
  | { kind: "toggle-terminal" };

export type ShortcutInput = Readonly<{
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}>;

export function resolveAppShortcut(input: ShortcutInput): AppShortcut | null {
  const key = input.key.toLowerCase();
  if ((input.ctrlKey || input.metaKey)
      && !input.altKey
      && !input.shiftKey
      && key === "k") {
    return { kind: "focus-search" };
  }
  if (!input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return null;
  if (/^[1-7]$/.test(key)) return { kind: "workspace", index: Number(key) - 1 };
  if (key === "g") return { kind: "mode", mode: "Guided" };
  if (key === "c") return { kind: "mode", mode: "Compact" };
  if (key === "t") return { kind: "toggle-terminal" };
  return null;
}
