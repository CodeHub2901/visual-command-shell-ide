// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

/// <reference types="node" />

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function themeToken(theme: "dark" | "light", token: string): string {
  const block = new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`).exec(styles)?.[1];
  if (block === undefined) throw new Error(`Missing ${theme} theme block`);
  const value = new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1];
  if (value === undefined) throw new Error(`Missing ${theme} --${token} color token`);
  return value;
}

function relativeLuminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/gu)?.map((value) => Number.parseInt(value, 16) / 255);
  if (channels === undefined || channels.length !== 3) throw new Error(`Invalid color ${hex}`);
  const linear = channels.map((channel) => channel <= 0.03928
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

describe("accessible visual tokens", () => {
  it.each(["dark", "light"] as const)("keeps %s semantic text above WCAG AA contrast", (theme) => {
    const canvas = themeToken(theme, "app-canvas");
    for (const token of [
      "text-primary",
      "text-secondary",
      "text-tertiary",
      "accent-text",
      "success",
      "warning",
      "danger"
    ]) {
      expect(contrastRatio(themeToken(theme, token), canvas), `${theme} --${token}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps keyboard focus, reduced motion, and forced colors explicit", () => {
    expect(styles).toMatch(/:focus-visible\s*\{/u);
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
    expect(styles).toMatch(/@media\s*\(forced-colors:\s*active\)/u);
    expect(styles).toMatch(/outline:\s*2px\s+solid\s+Highlight/u);
  });
});
