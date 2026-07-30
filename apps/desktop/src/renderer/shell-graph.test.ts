import { describe, expect, it } from "vitest";
import type { ShellCommandNode, ShellProgram } from "@cmd-ide/contracts";
import { buildShellGraph, replaceCommandNode } from "./shell-graph";
import { createTranslator } from "./i18n";

const translator = createTranslator("en");

describe("ShellProgram visual graph", () => {
  it("maps nested control flow and preserves saved positions", () => {
    const program: ShellProgram = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "if",
        nodeId: "if-1",
        branches: [{
          condition: command("test-1", "whoami"),
          body: [{
            type: "pipeline",
            nodeId: "pipeline-1",
            operator: "|",
            stages: [command("ls-1", "ls"), command("grep-1", "grep")]
          }]
        }],
        elseBody: [{ type: "comment", nodeId: "comment-1", text: "No match" }]
      }]
    };

    const graph = buildShellGraph(
      program,
      [{ nodeId: "if-1", x: 40, y: 60 }],
      translator
    );

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "if-1", "test-1", "pipeline-1", "ls-1", "grep-1", "comment-1"
    ]);
    expect(graph.nodes[0]?.position).toEqual({ x: 40, y: 60 });
    expect(graph.edges.some((edge) => edge.source === "pipeline-1" && edge.target === "grep-1")).toBe(true);
  });

  it("replaces one nested command without flattening the project", () => {
    const program: ShellProgram = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "function",
        nodeId: "function-1",
        name: "inventory",
        body: [command("ls-1", "ls"), { type: "comment", nodeId: "comment-1", text: "keep me" }]
      }]
    };
    const replacement: ShellCommandNode = {
      ...command("ls-1", "ls"),
      options: [{ optionId: "all", spelling: "-a", value: null, valueKind: null }]
    };

    const updated = replaceCommandNode(program, "ls-1", replacement, translator.t);

    expect(updated.statements[0]?.type).toBe("function");
    if (updated.statements[0]?.type !== "function") throw new Error("Expected function");
    expect(updated.statements[0].body).toHaveLength(2);
    expect(updated.statements[0].body[1]?.type).toBe("comment");
    expect(updated.statements[0].body[0]).toEqual(replacement);
  });
});

function command(nodeId: string, commandId: string): ShellCommandNode {
  return { type: "command", nodeId, commandId, options: [], arguments: [] };
}
