import { describe, expect, test } from "vitest";
import type { CommandSpec } from "@cmd-ide/contracts";
import { completionCandidates, hoverDetails } from "./bash-language";
import { createTranslator } from "./i18n";

const translator = createTranslator("en");

const commands: CommandSpec[] = [{
  id: "ls",
  executable: "ls",
  versionProbeArguments: ["--version"],
  displayName: "ls",
  summary: "List directory contents",
  category: "Files",
  platforms: ["linux"],
  distroFamilies: ["ubuntu"],
  arguments: [],
  riskTags: ["read-only"],
  shortOptionPolicy: "combine-boolean",
  availability: "installed",
  executablePath: "/usr/bin/ls",
  compatibility: { status: "supported", target: "ubuntu 24.04", note: "Supported." },
  options: [{
    id: "all",
    flags: ["-a", "--all"],
    description: "Include hidden entries.",
    takesValue: false,
    valueName: null,
    repeatable: false,
    combinable: true,
    conflictsWith: []
  }, {
    id: "color",
    flags: ["--color"],
    description: "Control color output.",
    takesValue: true,
    valueName: "WHEN",
    repeatable: false,
    combinable: false,
    conflictsWith: []
  }],
  examples: ["ls -a"],
  manual: { synopsis: "ls [OPTION]...", sections: [{ heading: "Description", body: "List files." }] }
}];

describe("offline Bash language helpers", () => {
  test("offers commands at command positions including after a pipeline", () => {
    expect(completionCandidates("l", commands, translator).map((item) => item.label)).toContain("ls");
    expect(completionCandidates("cat file | l", commands, translator).map((item) => item.label)).toContain("ls");
  });

  test("offers unused catalog options and snippets for value-taking options", () => {
    const options = completionCandidates("ls -a --c", commands, translator);

    expect(options.map((item) => item.label)).not.toContain("-a");
    expect(options.find((item) => item.label === "--color")?.insertText)
      .toBe("--color ${1:WHEN}");
  });

  test("returns compatibility and risk hover details", () => {
    expect(hoverDetails("ls", commands, translator)).toMatchObject({
      title: "ls",
      risk: "read-only",
      compatibility: "supported: Supported."
    });
    expect(hoverDetails("unknown", commands, translator)).toBeNull();
  });
});
