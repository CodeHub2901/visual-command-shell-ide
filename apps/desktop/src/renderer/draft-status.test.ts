// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { draftSaveState } from "./draft-status";

describe("local draft save state", () => {
  it("distinguishes an absent draft from a new unsaved draft", () => {
    expect(draftSaveState(null, null)).toBe("none");
    expect(draftSaveState(null, { statements: [] })).toBe("unsaved");
  });

  it("detects saved and changed structured programs", () => {
    const saved = { schemaVersion: "1.4.0", statements: [{ type: "command", executable: "ls" }] };
    expect(draftSaveState(saved, { ...saved })).toBe("saved");
    expect(draftSaveState(saved, { ...saved, statements: [] })).toBe("changed");
  });
});
