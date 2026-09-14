// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { buildCommandView, catalogSelectionView, interfaceModeView } from "./command-view";

describe("command workspace navigation", () => {
  it("opens the manual before option forms after a catalog selection", () => {
    expect(catalogSelectionView()).toBe("manual");
  });

  it("enters Guided options only after an explicit build action", () => {
    expect(buildCommandView()).toBe("guided");
  });

  it("keeps project reopen and mode shortcuts on the matching editor", () => {
    expect(interfaceModeView("Guided")).toBe("guided");
    expect(interfaceModeView("Compact")).toBe("editor");
  });
});
