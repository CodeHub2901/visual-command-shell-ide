// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { workspaceIconPaths } from "./workspace-icons";

describe("workspace navigation icons", () => {
  it("provides a distinct vector icon for every primary workspace", () => {
    expect(Object.keys(workspaceIconPaths)).toEqual([
      "home",
      "command",
      "ai-assistant",
      "bookmarks",
      "history",
      "settings"
    ]);

    const signatures = Object.values(workspaceIconPaths).map((paths) => paths.join("|"));
    expect(new Set(signatures).size).toBe(signatures.length);
    expect(signatures.every((signature) => signature.length > 10)).toBe(true);
  });
});
