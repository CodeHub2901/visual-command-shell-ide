// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export const PANE_LAYOUT_STORAGE_KEY = "command-ide:pane-layout";

export type PaneSizes = {
  sidebar: number;
  inspector: number;
  terminal: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

export type DesktopLayoutBand = "compact" | "medium" | "wide";

export function desktopLayoutBand(width: number): DesktopLayoutBand {
  if (width >= 1440) return "wide";
  if (width >= 1100) return "medium";
  return "compact";
}

export const DEFAULT_PANE_SIZES: PaneSizes = Object.freeze({
  sidebar: 272,
  inspector: 288,
  terminal: 300
});

export function paneSizeBounds(viewport: ViewportSize) {
  // Electron's renderer viewport is smaller than the outer window because of
  // native window chrome, and high zoom factors reduce its CSS-pixel size even
  // further. Clamp against the space that actually exists rather than the
  // advertised minimum outer-window dimensions.
  const width = Math.max(1, finite(viewport.width, 980));
  const height = Math.max(1, finite(viewport.height, 640));
  const shortViewport = height < 600;
  return {
    sidebar: {
      min: shortViewport ? 196 : 220,
      max: Math.max(shortViewport ? 196 : 220, Math.min(420, width - 420))
    },
    inspector: {
      min: shortViewport ? 220 : 248,
      max: Math.max(shortViewport ? 220 : 248, Math.min(440, width - 420))
    },
    terminal: {
      min: shortViewport ? 120 : 190,
      max: Math.max(shortViewport ? 120 : 190, Math.min(560, height - 320))
    }
  } as const;
}

export function clampPaneSizes(
  candidate: Partial<PaneSizes> | null | undefined,
  viewport: ViewportSize
): PaneSizes {
  const bounds = paneSizeBounds(viewport);
  return {
    sidebar: clamp(finite(candidate?.sidebar, DEFAULT_PANE_SIZES.sidebar), bounds.sidebar),
    inspector: clamp(finite(candidate?.inspector, DEFAULT_PANE_SIZES.inspector), bounds.inspector),
    terminal: clamp(finite(candidate?.terminal, DEFAULT_PANE_SIZES.terminal), bounds.terminal)
  };
}

export function parsePaneSizes(value: string | null, viewport: ViewportSize): PaneSizes {
  if (value === null) return clampPaneSizes(DEFAULT_PANE_SIZES, viewport);
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return clampPaneSizes(DEFAULT_PANE_SIZES, viewport);
    }
    return clampPaneSizes(parsed as Partial<PaneSizes>, viewport);
  } catch {
    return clampPaneSizes(DEFAULT_PANE_SIZES, viewport);
  }
}

export function serializePaneSizes(sizes: PaneSizes): string {
  return JSON.stringify(sizes);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, bounds: { min: number; max: number }): number {
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, value)));
}
