// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { LanguageDiagnostic } from "@cmd-ide/contracts";
import { deduplicateLanguageDiagnostics } from "./language-diagnostics";

describe("language diagnostic merging", () => {
  it("deduplicates equivalent server and explicit ShellCheck diagnostics", () => {
    const base: LanguageDiagnostic = {
      range: {
        start: { line: 0, character: 5 },
        end: { line: 0, character: 11 }
      },
      severity: "warning",
      code: "SC2086",
      message: "Double quote to prevent globbing.",
      source: "bash-language-server"
    };

    const result = deduplicateLanguageDiagnostics([
      base,
      { ...base, source: "ShellCheck" }
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("ShellCheck");
  });

  it("retains distinct messages at the same source range", () => {
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 4 }
    };
    expect(deduplicateLanguageDiagnostics([{
      range,
      severity: "warning",
      code: "SC1000",
      message: "First",
      source: "ShellCheck"
    }, {
      range,
      severity: "information",
      code: "SC1001",
      message: "Second",
      source: "ShellCheck"
    }])).toHaveLength(2);
  });
});
