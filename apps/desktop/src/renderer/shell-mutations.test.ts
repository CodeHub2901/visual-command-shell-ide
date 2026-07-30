import { describe, expect, it } from "vitest";
import type { ShellCommandNode, ShellProgram } from "@cmd-ide/contracts";
import {
  appendComment,
  appendProgram,
  connectTopLevelNodes,
  deleteShellNode
} from "./shell-mutations";
import { createTranslator } from "./i18n";

const translator = createTranslator("en");

describe("semantic ShellProgram graph mutations", () => {
  it("adds a parsed catalog program with fresh recursive node ids", () => {
    const base = program(command("existing", "ls"));
    const addition = program({
      type: "block",
      nodeId: "block",
      mode: "subshell",
      statements: [command("nested", "pwd")]
    });
    let id = 0;

    const updated = appendProgram(base, addition, () => `fresh-${++id}`, translator.t);

    expect(updated.statements).toHaveLength(2);
    expect(updated.statements[1]?.nodeId).toBe("fresh-1");
    if (updated.statements[1]?.type !== "block") throw new Error("Expected block");
    expect(updated.statements[1].statements[0]?.nodeId).toBe("fresh-2");
    expect(addition.statements[0]?.nodeId).toBe("block");
  });

  it("connects top-level nodes into validated semantic operators", () => {
    const base = program(command("left", "ls"), command("right", "grep"));

    const pipeline = connectTopLevelNodes(base, "left", "right", "pipeline", "pipe", translator.t);
    const boolean = connectTopLevelNodes(base, "right", "left", "and", "and", translator.t);

    expect(pipeline.statements[0]).toMatchObject({
      type: "pipeline",
      nodeId: "pipe",
      stages: [{ nodeId: "left" }, { nodeId: "right" }]
    });
    expect(boolean.statements[0]).toMatchObject({
      type: "boolean-chain",
      operator: "&&",
      left: { nodeId: "right" },
      right: { nodeId: "left" }
    });
  });

  it("rejects invalid pipeline participants without changing the program", () => {
    const base = program(
      command("left", "ls"),
      { type: "comment", nodeId: "comment", text: "not a process" }
    );

    expect(() => connectTopLevelNodes(base, "left", "comment", "pipeline", "pipe", translator.t))
      .toThrow("Pipelines accept");
    expect(base.statements).toHaveLength(2);
  });

  it("deletes recursively and collapses a one-stage pipeline without flattening siblings", () => {
    const base = program({
      type: "function",
      nodeId: "function",
      name: "inspect",
      body: [{
        type: "pipeline",
        nodeId: "pipe",
        operator: "|",
        stages: [command("ls", "ls"), command("grep", "grep")]
      }, { type: "comment", nodeId: "keep", text: "keep me" }]
    });

    const updated = deleteShellNode(base, "grep", translator.t);

    if (updated.statements[0]?.type !== "function") throw new Error("Expected function");
    expect(updated.statements[0].body.map((node) => node.nodeId)).toEqual(["ls", "keep"]);
  });

  it("keeps a non-empty root and supports comment insertion", () => {
    const base = appendComment(
      program(command("only", "ls")),
      "comment",
      "Review output",
      translator.t
    );

    expect(deleteShellNode(base, "comment", translator.t).statements).toHaveLength(1);
    expect(() => deleteShellNode(program(command("only", "ls")), "only", translator.t))
      .toThrow("must keep at least one statement");
  });
});

function program(...statements: ShellProgram["statements"]): ShellProgram {
  return { schemaVersion: "1.4.0", dialect: "bash", statements };
}

function command(nodeId: string, commandId: string): ShellCommandNode {
  return { type: "command", nodeId, commandId, options: [], arguments: [] };
}
