import { describe, expect, test } from "vitest";
import type { ShellProgram } from "@cmd-ide/contracts";
import { mergeBookmarkParameters } from "./bookmark-utils";

describe("mergeBookmarkParameters", () => {
  test("derives structured argument and redirect placeholders without flattening", () => {
    const program: ShellProgram = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "sequence",
        nodeId: "sequence-1",
        separator: "newline",
        items: [{
          type: "command",
          nodeId: "command-1",
          commandId: "ls",
          options: [],
          arguments: [{ argumentId: "files", value: "ROOT", valueKind: "variable" }]
        }, {
          type: "redirect",
          nodeId: "redirect-1",
          subject: {
            type: "command",
            nodeId: "command-2",
            commandId: "ls",
            options: [],
            arguments: []
          },
          redirections: [{ operator: ">", target: "OUTPUT", targetKind: "variable" }]
        }]
      }]
    };

    expect(mergeBookmarkParameters(program, []).map((parameter) => parameter.name))
      .toEqual(["OUTPUT", "ROOT"]);
  });

  test("preserves existing metadata and marks secret-named placeholders sensitive", () => {
    const program: ShellProgram = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "command",
        nodeId: "command-1",
        commandId: "ls",
        options: [],
        arguments: [
          { argumentId: "files", value: "ROOT", valueKind: "variable" },
          { argumentId: "files", value: "API_TOKEN", valueKind: "variable" }
        ]
      }]
    };

    const parameters = mergeBookmarkParameters(program, [{
      name: "ROOT",
      description: "Source directory",
      required: false,
      sensitive: false,
      defaultValue: "/tmp"
    }]);

    expect(parameters.find((parameter) => parameter.name === "ROOT")?.description)
      .toBe("Source directory");
    expect(parameters.find((parameter) => parameter.name === "API_TOKEN"))
      .toMatchObject({ sensitive: true, defaultValue: null });
  });
});
