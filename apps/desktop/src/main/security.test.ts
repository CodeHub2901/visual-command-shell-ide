// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { secureWebPreferences } from "./security";

describe("renderer security preferences", () => {
  it("keeps privileged renderer capabilities disabled", () => {
    const preferences = secureWebPreferences("C:\\app\\preload.js", true);

    expect(preferences.contextIsolation).toBe(true);
    expect(preferences.nodeIntegration).toBe(false);
    expect(preferences.sandbox).toBe(true);
    expect(preferences.webSecurity).toBe(true);
    expect(preferences.webviewTag).toBe(false);
    expect(preferences.devTools).toBe(false);
  });

  it("changes only developer tools for an unpackaged build", () => {
    expect(secureWebPreferences("/app/preload.js", false)).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: true
    });
  });

  it("keeps executable content and editor workers local under CSP", () => {
    const html = readFileSync("src/renderer/index.html", "utf8");
    const policy = /content="([^"]*default-src[^"]*)"/.exec(html)?.[1] ?? "";

    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-(?:inline|eval)/);
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("connect-src 'none'");
    expect(policy).toContain("object-src 'none'");
  });
});
