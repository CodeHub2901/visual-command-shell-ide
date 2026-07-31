// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "vitest";
import appSource from "./App.tsx?raw";
import aiSource from "./AiAssistantView.tsx?raw";
import editorSource from "./MonacoBashEditor.tsx?raw";
import canvasSource from "./ShellProgramCanvas.tsx?raw";
import terminalSource from "./XtermTerminal.tsx?raw";
import bashLanguageSource from "./bash-language.ts?raw";
import shellGraphSource from "./shell-graph.ts?raw";
import shellMutationsSource from "./shell-mutations.ts?raw";
import terminalOutputSource from "./terminal-output.ts?raw";
import mainSource from "../main/index.ts?raw";
import { createTranslator, resolveSupportedLocale } from "./i18n";

describe("renderer localization", () => {
  test("resolves exact and language-only locale requests with English fallback", () => {
    expect(resolveSupportedLocale(["en-IN"])).toBe("en");
    expect(resolveSupportedLocale(["fr-FR", "en-US"])).toBe("en");
    expect(resolveSupportedLocale([])).toBe("en");
  });

  test("interpolates values, selects English plurals, and falls back per message", () => {
    const translator = createTranslator("en", {
      "common.loading": "Localized loading…"
    });

    expect(translator.t("common.loading")).toBe("Localized loading…");
    expect(translator.t("app.name")).toBe("Command IDE");
    expect(translator.t("terminal.exited", { status: 7 })).toBe("Exited with status 7");
    expect(translator.plural(
      { one: "catalog.count.one", other: "catalog.count.other" },
      1
    )).toBe("1 command");
    expect(translator.plural(
      { one: "catalog.count.one", other: "catalog.count.other" },
      2
    )).toBe("2 commands");
    expect(() => translator.t("terminal.exited")).toThrow(/Missing localization value "status"/);
  });

  test("provides locale-aware number and date formatters", () => {
    const translator = createTranslator("en");

    expect(translator.formatNumber(12_345)).toMatch(/12[,.]345/);
    expect(translator.formatDateTime("2026-07-30T12:30:00Z")).not.toHaveLength(0);
    expect(translator.formatTime("2026-07-30T12:30:00Z")).not.toHaveLength(0);
  });

  test("keeps presentation text and literal accessibility attributes out of TSX", () => {
    const findings = Object.entries({
      "App.tsx": appSource,
      "AiAssistantView.tsx": aiSource,
      "MonacoBashEditor.tsx": editorSource,
      "ShellProgramCanvas.tsx": canvasSource,
      "XtermTerminal.tsx": terminalSource
    }).flatMap(([fileName, source]) => literalPresentationText(fileName, source));

    expect(findings).toEqual([]);
  });

  test("keeps localized helper output and native dialog text catalog-backed", () => {
    const helperFindings = Object.entries({
      "bash-language.ts": bashLanguageSource,
      "shell-graph.ts": shellGraphSource,
      "shell-mutations.ts": shellMutationsSource,
      "terminal-output.ts": terminalOutputSource
    }).flatMap(([fileName, source]) => sentenceLikeLiterals(fileName, source));

    expect(helperFindings).toEqual([]);
    expect(mainSource).not.toMatch(/\btitle:\s*"[A-Za-z]/);
    expect(mainSource).not.toMatch(/\bfilters:\s*\[\{\s*name:\s*"[A-Za-z]/);
    expect(mainSource).not.toContain('"Java worker is unavailable"');
  });
});

function literalPresentationText(fileName: string, source: string): string[] {
  const findings: string[] = [];
  const literalAttribute = /\b(?:aria-label|placeholder|title)="[^"]*[A-Za-z][^"]*"/g;
  for (const match of source.matchAll(literalAttribute)) {
    findings.push(`${fileName}:${lineAt(source, match.index)} literal ${match[0]}`);
  }
  const jsxText = /<(?:a|article|aside|button|code|dd|details|div|dt|h1|h2|h3|header|label|li|nav|option|p|pre|section|small|span|strong|summary)(?:\s[^<>]*?)?>([^<>{}]*)</g;
  for (const match of source.matchAll(jsxText)) {
    const value = match[1]?.trim() ?? "";
    if (/[A-Za-z]/.test(value.replace(/&[A-Za-z]+;/g, ""))) {
      findings.push(`${fileName}:${lineAt(source, match.index)} JSX text "${value}"`);
    }
  }
  return findings;
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function sentenceLikeLiterals(fileName: string, source: string): string[] {
  const findings: string[] = [];
  const literal = /(["`])([A-Z][A-Za-z][^"`\r\n]* [^"`\r\n]*)\1/g;
  for (const match of source.matchAll(literal)) {
    findings.push(`${fileName}:${lineAt(source, match.index)} "${match[2]}"`);
  }
  return findings;
}
