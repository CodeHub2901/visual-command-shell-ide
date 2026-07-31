// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { ShellCommandNode, ShellProgram } from "@cmd-ide/contracts";
import { describe, expect, test } from "vitest";
import { buildShellGraph } from "./shell-graph";
import { TerminalOutputSanitizer } from "./terminal-output";
import { createTranslator } from "./i18n";

const LARGE_CANVAS_NODE_COUNT = 1_000;
const LARGE_CANVAS_P95_BUDGET_MS = 250;
const TERMINAL_INPUT_CHARACTERS = 20_000_000;
const TERMINAL_FILTER_BUDGET_MS = 5_000;
const translator = createTranslator("en");

describe("renderer performance budgets", () => {
  test("projects a 1,000-node ShellProgram for the visual canvas within budget", () => {
    const program: ShellProgram = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: Array.from(
        { length: LARGE_CANVAS_NODE_COUNT },
        (_, index): ShellCommandNode => ({
          type: "command",
          nodeId: `canvas-node-${index}`,
          commandId: index % 2 === 0 ? "echo" : "printf",
          options: [],
          arguments: [{
            argumentId: "value",
            value: `line-${index}`,
            valueKind: "literal"
          }]
        })
      )
    };

    buildShellGraph(program, [], translator);
    const samples = Array.from({ length: 20 }, () => {
      const startedAt = performance.now();
      const graph = buildShellGraph(program, [], translator);
      const elapsedMs = performance.now() - startedAt;
      expect(graph.nodes).toHaveLength(LARGE_CANVAS_NODE_COUNT);
      expect(graph.edges).toHaveLength(LARGE_CANVAS_NODE_COUNT - 1);
      return elapsedMs;
    }).sort((left, right) => left - right);

    const p95Ms = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
    expect(
      p95Ms,
      `1,000-node graph projection p95 exceeded ${LARGE_CANVAS_P95_BUDGET_MS} ms`
    ).toBeLessThan(LARGE_CANVAS_P95_BUDGET_MS);
    console.log(`Renderer large-canvas projection: p95 ${p95Ms.toFixed(1)} ms (1,000 nodes).`);
  });

  test("filters sustained terminal output within budget", () => {
    const pattern = "plain output \u001b[31mred\u001b[0m \u001b]0;blocked title\u0007 tail\r\n";
    const input = pattern
      .repeat(Math.ceil(TERMINAL_INPUT_CHARACTERS / pattern.length))
      .slice(0, TERMINAL_INPUT_CHARACTERS);
    const chunkSizes = [1, 7, 31, 257, 4_096];
    const sanitizer = new TerminalOutputSanitizer(translator.t("terminal.blockedControl"));
    let offset = 0;
    let chunkIndex = 0;
    let visibleCharacters = 0;

    const startedAt = performance.now();
    while (offset < input.length) {
      const chunkSize = chunkSizes[chunkIndex % chunkSizes.length] ?? 4_096;
      const end = Math.min(offset + chunkSize, input.length);
      visibleCharacters += sanitizer.push(input.slice(offset, end)).length;
      offset = end;
      chunkIndex += 1;
    }
    const elapsedMs = performance.now() - startedAt;

    expect(visibleCharacters).toBeGreaterThan(0);
    expect(visibleCharacters).toBeLessThan(TERMINAL_INPUT_CHARACTERS);
    expect(
      elapsedMs,
      `20-million-character terminal filter exceeded ${TERMINAL_FILTER_BUDGET_MS} ms`
    ).toBeLessThan(TERMINAL_FILTER_BUDGET_MS);
    console.log(
      `Renderer terminal filtering: ${elapsedMs.toFixed(1)} ms `
      + `(${TERMINAL_INPUT_CHARACTERS.toLocaleString("en-US")} input characters).`
    );
  }, 10_000);
});
