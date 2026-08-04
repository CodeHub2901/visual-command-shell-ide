// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  clampPaneSizes,
  DEFAULT_PANE_SIZES,
  desktopLayoutBand,
  paneSizeBounds,
  parsePaneSizes,
  serializePaneSizes
} from "./pane-layout";

describe("responsive pane layout", () => {
  it("uses the specified compact, medium, and wide breakpoints", () => {
    expect(desktopLayoutBand(980)).toBe("compact");
    expect(desktopLayoutBand(1099)).toBe("compact");
    expect(desktopLayoutBand(1100)).toBe("medium");
    expect(desktopLayoutBand(1439)).toBe("medium");
    expect(desktopLayoutBand(1440)).toBe("wide");
    expect(desktopLayoutBand(2560)).toBe("wide");
  });

  it("restores valid local sizes", () => {
    const viewport = { width: 1920, height: 1080 };
    const sizes = { sidebar: 320, inspector: 360, terminal: 420 };
    expect(parsePaneSizes(serializePaneSizes(sizes), viewport)).toEqual(sizes);
  });

  it("clamps a large-screen layout when restored at the minimum viewport", () => {
    const viewport = { width: 980, height: 640 };
    const bounds = paneSizeBounds(viewport);
    expect(clampPaneSizes({ sidebar: 900, inspector: 900, terminal: 900 }, viewport)).toEqual({
      sidebar: bounds.sidebar.max,
      inspector: bounds.inspector.max,
      terminal: bounds.terminal.max
    });
  });

  it("uses the real renderer height at high display or text scaling", () => {
    const viewport = { width: 490, height: 320 };
    const bounds = paneSizeBounds(viewport);
    expect(bounds.terminal).toEqual({ min: 120, max: 120 });
    expect(clampPaneSizes({ terminal: 500 }, viewport).terminal).toBe(120);
  });

  it("rejects corrupt, non-finite, and undersized stored values", () => {
    const viewport = { width: 1366, height: 768 };
    expect(parsePaneSizes("not-json", viewport)).toEqual(DEFAULT_PANE_SIZES);
    expect(parsePaneSizes(JSON.stringify({ sidebar: -5, inspector: null, terminal: 0 }), viewport))
      .toEqual({ sidebar: 220, inspector: DEFAULT_PANE_SIZES.inspector, terminal: 190 });
  });
});
