// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  HEALTH_CHECK_METHOD,
  HealthCheckResultSchema,
  CancelRequestParamsSchema,
  CatalogSearchParamsSchema,
  CatalogSearchResultSchema,
  CatalogDiscoverParamsSchema,
  CatalogDiscoveryResultSchema,
  CatalogProbeVersionResultSchema,
  CommandOptionSchema,
  SystemProfileSchema,
  ToolingProfileSchema,
  LanguageOpenResultSchema,
  LanguageCompletionResultSchema,
  LanguageDiagnosticsEventSchema,
  LanguageSymbolsResultSchema,
  LanguageReferencesResultSchema,
  ShellCheckResultSchema,
  ShfmtResultSchema,
  AiRequestSchema,
  AiModelsResultSchema,
  AiConnectionResultSchema,
  AiProposalResultSchema,
  CredentialStoreParamsSchema,
  CredentialStatusSchema,
  JsonRpcRequestSchema,
  ManualGetResultSchema,
  ShellGenerateParamsSchema,
  ShellArgumentValueSchema,
  ShellProgramSchema,
  ShellParseResultSchema,
  RiskAssessmentSchema,
  ScriptProjectSchema,
  ExportArtifactSchema,
  ExportCreateParamsSchema,
  FileExportResultSchema,
  ClipboardCopyParamsSchema,
  ClipboardCopyResultSchema,
  ProjectImportParamsSchema,
  ProjectFileImportResultSchema,
  ExecutionStartParamsSchema,
  ExecutionStartUiParamsSchema,
  ExecutionEventSchema,
  ExecutionHistoryEntrySchema,
  StructuredBookmarkSchema,
  BookmarkSaveParamsSchema
} from "./protocol";

describe("protocol contracts", () => {
  it("bounds the renderer-to-main clipboard capability to plain command text", () => {
    const program = {
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "command",
        nodeId: "copy-command",
        commandId: "ls",
        options: [],
        arguments: []
      }]
    };
    expect(ClipboardCopyParamsSchema.parse({ program })).toEqual({ program });
    expect(ClipboardCopyResultSchema.parse({ copied: true, characters: 8 })).toEqual({
      copied: true,
      characters: 8
    });
    expect(() => ClipboardCopyParamsSchema.parse({ text: "ls -al ." })).toThrow();
    expect(() => ClipboardCopyParamsSchema.parse({ program, format: "html" })).toThrow();
  });

  it("normalizes the language-server boundary without exposing raw LSP payloads", () => {
    const sessionId = "c657cbe4-d80d-44f5-8d18-2f17119e9e6e";
    expect(LanguageOpenResultSchema.parse({
      status: "opened",
      sessionId,
      reason: null
    }).status).toBe("opened");
    expect(LanguageCompletionResultSchema.parse({
      items: [{
        label: "echo",
        insertText: "echo ${1:text}",
        detail: "Bash builtin",
        documentation: "Print arguments.",
        kind: 3,
        snippet: true
      }],
      incomplete: false
    }).items[0]?.label).toBe("echo");
    expect(LanguageDiagnosticsEventSchema.parse({
      sessionId,
      version: 2,
      diagnostics: [{
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 4 }
        },
        severity: "warning",
        code: "SC1000",
        message: "Example warning",
        source: "shellcheck"
      }]
    }).diagnostics[0]?.severity).toBe("warning");
    const range = {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 3 }
    };
    expect(LanguageSymbolsResultSchema.parse({
      symbols: [{
        name: "run",
        detail: "function",
        containerName: null,
        kind: 12,
        range,
        selectionRange: range
      }]
    }).symbols[0]?.name).toBe("run");
    expect(LanguageReferencesResultSchema.parse({
      references: [{ range }]
    }).references).toHaveLength(1);
    expect(ShellCheckResultSchema.parse({
      status: "completed",
      diagnostics: [{
        range,
        severity: "warning",
        code: "SC2086",
        message: "Double quote to prevent globbing.",
        source: "ShellCheck"
      }],
      reason: null
    }).diagnostics[0]?.code).toBe("SC2086");
    expect(ShfmtResultSchema.parse({
      status: "formatted",
      source: "echo ok\n",
      changed: true,
      reason: null
    }).changed).toBe(true);
    expect(() => ShfmtResultSchema.parse({
      status: "failed",
      source: "partial",
      changed: true,
      reason: null
    })).toThrow();
    expect(() => LanguageCompletionResultSchema.parse({
      items: [{
        label: "echo",
        insertText: "echo",
        detail: null,
        documentation: null,
        kind: 3,
        snippet: false,
        rawTextEdit: {}
      }],
      incomplete: false
    })).toThrow();
  });

  it("validates passive local tooling profiles without invented paths", () => {
    const profile = ToolingProfileSchema.parse({
      tools: [{
        id: "bash-language-server",
        displayName: "Bash Language Server",
        status: "missing",
        source: "missing",
        executablePath: null,
        installGuidance: "Install from a trusted package source."
      }, {
        id: "shellcheck",
        displayName: "ShellCheck",
        status: "installed",
        source: "system",
        executablePath: "/usr/bin/shellcheck",
        installGuidance: "Install from the distribution package."
      }, {
        id: "shfmt",
        displayName: "shfmt",
        status: "missing",
        source: "missing",
        executablePath: null,
        installGuidance: "Install from the distribution package."
      }]
    });

    expect(profile.tools[1]?.executablePath).toBe("/usr/bin/shellcheck");
    expect(() => ToolingProfileSchema.parse({
      tools: profile.tools.map((tool) => ({ ...tool, executablePath: "/invented/path" }))
    })).toThrow();
  });

  it("preserves structured bookmark variables and parameter placeholders", () => {
    const bookmark = StructuredBookmarkSchema.parse({
      schemaVersion: "1.0.0",
      bookmarkId: "bdc62cba-64d3-4384-955d-8617c7ab8768",
      name: "Inspect directory",
      program: {
        schemaVersion: "1.4.0",
        dialect: "bash",
        statements: [{
          type: "command",
          nodeId: "node-1",
          commandId: "ls",
          options: [],
          arguments: [{ argumentId: "files", value: "ROOT", valueKind: "variable" }]
        }]
      },
      parameters: [{
        name: "ROOT",
        description: "Directory to inspect",
        required: true,
        sensitive: false,
        defaultValue: "/tmp"
      }],
      createdAt: "2026-07-29T12:00:00Z",
      updatedAt: "2026-07-29T12:00:00Z"
    });

    expect(bookmark.program.statements[0]?.type).toBe("command");
    expect(BookmarkSaveParamsSchema.parse({
      bookmarkId: bookmark.bookmarkId,
      name: bookmark.name,
      program: bookmark.program,
      parameters: bookmark.parameters
    }).parameters[0]?.name).toBe("ROOT");
  });

  it("accepts a valid health request", () => {
    expect(
      JsonRpcRequestSchema.parse({
        jsonrpc: "2.0",
        id: "request-1",
        method: HEALTH_CHECK_METHOD,
        params: {}
      })
    ).toMatchObject({ method: HEALTH_CHECK_METHOD });
  });

  it("rejects unknown request fields", () => {
    expect(() =>
      JsonRpcRequestSchema.parse({
        jsonrpc: "2.0",
        id: "request-1",
        method: HEALTH_CHECK_METHOD,
        params: {},
        injected: true
      })
    ).toThrow();
  });

  it("requires the negotiated protocol version", () => {
    expect(() =>
      HealthCheckResultSchema.parse({
        protocolVersion: "2.0",
        workerVersion: "0.1.0",
        javaVersion: "21",
        pid: 42
      })
    ).toThrow();
  });

  it("validates cancellation request identifiers", () => {
    expect(CancelRequestParamsSchema.parse({ requestId: "request-1" })).toEqual({
      requestId: "request-1"
    });
    expect(() => CancelRequestParamsSchema.parse({ requestId: true })).toThrow();
  });

  it("validates a supported Linux system profile", () => {
    expect(
      SystemProfileSchema.parse({
        operatingSystem: "linux",
        architecture: "x86_64",
        shell: { executable: "/bin/bash", dialect: "bash" },
        distro: {
          id: "ubuntu",
          versionId: "24.04",
          prettyName: "Ubuntu 24.04 LTS",
          family: "ubuntu",
          supported: true
        },
        pathEntries: ["/usr/local/bin", "/usr/bin"]
      }).distro?.supported
    ).toBe(true);
  });

  it("validates a bounded offline catalog search", () => {
    expect(CatalogSearchParamsSchema.parse({ query: "list files", limit: 20 })).toEqual({
      query: "list files",
      limit: 20
    });
    expect(() => CatalogSearchParamsSchema.parse({ query: "", limit: 101 })).toThrow();
  });

  it("validates bounded cached PATH discovery without requiring catalog enrichment", () => {
    expect(CatalogDiscoverParamsSchema.parse({ limit: 5000, refresh: true })).toEqual({
      limit: 5000,
      refresh: true
    });
    const result = CatalogDiscoveryResultSchema.parse({
      total: 2,
      truncated: false,
      cached: false,
      shadowedCount: 1,
      skippedUnsafeNames: 0,
      executables: [{
        executable: "ls",
        path: "/usr/bin/ls",
        catalogCommandId: "ls",
        category: "Files",
        summary: "List directory contents"
      }, {
        executable: "local-tool",
        path: "/usr/local/bin/local-tool",
        catalogCommandId: null,
        category: null,
        summary: null
      }]
    });
    expect(result.shadowedCount).toBe(1);
    expect(() => CatalogDiscoverParamsSchema.parse({ limit: 5001, refresh: false })).toThrow();
    expect(() => CatalogDiscoveryResultSchema.parse({
      ...result,
      total: 1
    })).toThrow();
  });

  it("validates a catalog command with bundled manual content", () => {
    const result = CatalogSearchResultSchema.parse({
      catalogVersion: "1.0.0",
      total: 1,
      commands: [{
        id: "ls",
        executable: "ls",
        versionProbeArguments: ["--version"],
        displayName: "ls",
        summary: "List directory contents",
        category: "Files",
        platforms: ["linux", "macos"],
        distroFamilies: ["ubuntu", "fedora", "other"],
        arguments: [{
          id: "files",
          label: "FILE",
          description: "Files or directories to list.",
          required: false,
          repeatable: true
        }],
        riskTags: ["read-only"],
        shortOptionPolicy: "combine-boolean",
        availability: "installed",
        executablePath: "/usr/bin/ls",
        compatibility: {
          status: "supported",
          target: "ubuntu 24.04",
          note: "Covered by the Ubuntu 24.04 catalog overlay."
        },
        options: [{
          id: "all",
          flags: ["-a", "--all"],
          description: "Include entries starting with a dot.",
          takesValue: false,
          valueName: null,
          repeatable: false,
          combinable: true,
          conflictsWith: []
        }],
        examples: ["ls -la"],
        manual: {
          synopsis: "ls [OPTION]... [FILE]...",
          sections: [{ heading: "Description", body: "List directory contents." }]
        }
      }]
    });
    expect(result.commands[0]?.manual.synopsis).toContain("OPTION");
  });

  it("rejects inconsistent option value metadata", () => {
    expect(() => CommandOptionSchema.parse({
      id: "output",
      flags: ["-o"],
      description: "Write output.",
      takesValue: true,
      valueName: null,
      repeatable: false,
      combinable: false,
      conflictsWith: []
    })).toThrow();
  });

  it("bounds semantic manual responses", () => {
    const result = ManualGetResultSchema.parse({
      commandId: "ls",
      source: "man",
      truncated: false,
      manual: {
        synopsis: "ls [OPTION]... [FILE]...",
        sections: [{ heading: "Description", body: "List directory contents." }]
      },
      tldr: {
        examples: [{ description: "List hidden entries.", command: "ls -a" }],
        attribution: {
          source: "tldr-pages",
          pageUrl: "https://github.com/tldr-pages/tldr/blob/5ca248e494fba9776274f74362440708849e411f/pages/common/ls.md",
          sourceRevision: "5ca248e494fba9776274f74362440708849e411f",
          retrievedAt: "2026-07-18",
          copyright: "Copyright tldr-pages contributors.",
          license: "CC-BY 4.0",
          licenseUrl: "https://creativecommons.org/licenses/by/4.0/"
        }
      }
    });
    expect(result.source).toBe("man");
    expect(() => ManualGetResultSchema.parse({
      commandId: "ls",
      source: "html",
      truncated: false,
      manual: { synopsis: "ls", sections: [] },
      tldr: null
    })).toThrow();
  });

  it("validates the initial versioned ShellProgram subset", () => {
    const params = ShellGenerateParamsSchema.parse({
      program: {
        schemaVersion: "1.4.0",
        dialect: "bash",
        statements: [{
          type: "command",
          nodeId: "command-1",
          commandId: "ls",
          options: [
            { optionId: "all", spelling: "-a", value: null, valueKind: null },
            { optionId: "long", spelling: "-l", value: null, valueKind: null }
          ],
          arguments: [{ argumentId: "files", value: "/tmp/My Files", valueKind: "literal" }]
        }]
      }
    });
    expect(params.program.statements[0]?.commandId).toBe("ls");
  });

  it("requires a version only for successful probes", () => {
    expect(CatalogProbeVersionResultSchema.parse({
      commandId: "ls",
      status: "detected",
      version: "ls (GNU coreutils) 9.5",
      cached: false,
      truncated: false
    }).version).toContain("9.5");
    expect(() => CatalogProbeVersionResultSchema.parse({
      commandId: "ls",
      status: "failed",
      version: "not actually detected",
      cached: false,
      truncated: false
    })).toThrow();
  });

  it("validates deterministic risk evidence and review hashes", () => {
    const assessment = RiskAssessmentSchema.parse({
      script: "ls -al .",
      reviewHash: "a".repeat(64),
      level: "low",
      confirmation: "none",
      evidence: [{ ruleId: "catalog.read-only", nodeId: "command-1", message: "Catalog marks this command read-only." }]
    });
    expect(assessment.reviewHash).toHaveLength(64);
  });

  it("keeps AI output proposal-only and enforces operation inputs", () => {
    const request = AiRequestSchema.parse({
      provider: "ollama",
      endpoint: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      remoteEndpointConfirmed: false,
      operation: "generateExample",
      instruction: "Show a read-only directory listing.",
      source: null,
      failureMessage: null
    });
    expect(request.model).toBe("qwen3:8b");
    expect(() => AiRequestSchema.parse({
      ...request,
      operation: "improveScript",
      source: null
    })).toThrow();
    expect(() => AiRequestSchema.parse({
      ...request,
      operation: "explainFailure",
      source: "ls",
      failureMessage: null
    })).toThrow();

    expect(AiModelsResultSchema.parse({
      status: "available",
      models: [{
        id: "qwen3:8b",
        displayName: "qwen3:8b",
        parameterSize: "8B",
        quantization: "Q4_K_M"
      }],
      reason: null
    }).models).toHaveLength(1);
    expect(AiConnectionResultSchema.parse({
      status: "unsupported",
      reason: "The selected model did not produce structured output."
    }).status).toBe("unsupported");

    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "command",
        nodeId: "command-1",
        commandId: "ls",
        options: [],
        arguments: []
      }]
    });
    const result = AiProposalResultSchema.parse({
      status: "proposed",
      reason: null,
      proposal: {
        schemaVersion: "1.0.0",
        provider: "ollama",
        model: "qwen3:8b",
        operation: "generateExample",
        proposedCode: "ls",
        explanation: "Lists the current directory.",
        assumptions: [],
        warnings: [],
        riskHints: ["Read-only command."],
        program,
        diagnostics: [],
        preservedRaw: false,
        assessment: {
          script: "ls",
          reviewHash: "b".repeat(64),
          level: "low",
          confirmation: "none",
          evidence: [{
            ruleId: "catalog.read-only",
            nodeId: "command-1",
            message: "Catalog marks this command read-only."
          }]
        }
      }
    });
    expect(result.proposal?.assessment.level).toBe("low");
    expect(() => AiProposalResultSchema.parse({
      ...result,
      executionId: "this field would imply execution authority"
    })).toThrow();
    expect(() => AiProposalResultSchema.parse({
      status: "failed",
      proposal: result.proposal,
      reason: "Invalid"
    })).toThrow();
  });

  it("keeps provider credentials write-only and discloses memory fallback", () => {
    expect(CredentialStoreParamsSchema.parse({
      provider: "openai",
      credential: "sk-test-value"
    }).provider).toBe("openai");
    expect(() => CredentialStoreParamsSchema.parse({
      provider: "openai",
      credential: "line\nbreak"
    })).toThrow();
    const status = CredentialStatusSchema.parse({
      provider: "openai",
      configured: true,
      storage: "session",
      backend: "session-memory",
      reason: "Secure storage is unavailable; this key lasts only for the worker session."
    });
    expect(JSON.stringify(status)).not.toContain("sk-test-value");
    expect(() => CredentialStatusSchema.parse({
      ...status,
      credential: "must never be returned"
    })).toThrow();
  });

  it("rejects persisted defaults for sensitive project parameters", () => {
    const project = {
      schemaVersion: "1.4.0",
      projectId: "68d4861b-3ba5-47c8-8828-6ba2efc9945d",
      name: "List files",
      createdAt: "2026-07-18T12:00:00Z",
      updatedAt: "2026-07-18T12:00:00Z",
      catalogVersion: "1.2.0",
      target: {
        operatingSystem: "linux",
        architecture: "x86_64",
        shellDialect: "bash",
        distroFamily: "ubuntu",
        distroVersion: "24.04"
      },
      program: {
        schemaVersion: "1.4.0",
        dialect: "bash",
        statements: [{ type: "command", nodeId: "node-1", commandId: "ls", options: [], arguments: [] }]
      },
      layout: { nodes: [{ nodeId: "node-1", x: 0, y: 0 }], viewport: { x: 0, y: 0, zoom: 1 } },
      parameters: [{ name: "TOKEN", description: "Runtime token", required: true, sensitive: true, defaultValue: "secret" }]
    };
    expect(() => ScriptProjectSchema.parse(project)).toThrow();
    expect(ScriptProjectSchema.parse({
      ...project,
      parameters: [{ ...project.parameters[0], defaultValue: null }]
    }).name).toBe("List files");

    const validProject = ScriptProjectSchema.parse({
      ...project,
      parameters: [{ ...project.parameters[0], defaultValue: null }]
    });
    expect(ExportCreateParamsSchema.parse({
      project: validProject,
      format: "bash",
      strictMode: true,
      includeSourceComments: true
    }).format).toBe("bash");
    expect(ExportArtifactSchema.parse({
      format: "bash",
      suggestedFileName: "list-files.sh",
      mediaType: "text/x-shellscript",
      content: "#!/usr/bin/env bash\nls\n",
      syntaxValidation: "passed",
      warnings: []
    }).syntaxValidation).toBe("passed");
    expect(FileExportResultSchema.parse({ status: "canceled" }).status).toBe("canceled");
    expect(ProjectFileImportResultSchema.parse({
      status: "imported",
      fileName: "list-files.cmdbuilder.json",
      project: validProject
    }).status).toBe("imported");
    expect(ProjectImportParamsSchema.parse({ content: "{}" }).content).toBe("{}");
    const execution = {
      program: validProject.program,
      reviewedScript: "ls",
      reviewHash: "a".repeat(64),
      interfaceMode: "guided" as const,
      confirmed: false,
      typedConfirmation: null,
      workingDirectory: "/tmp",
      columns: 80,
      rows: 24
    };
    expect(ExecutionStartParamsSchema.parse(execution).columns).toBe(80);
    expect(ExecutionStartUiParamsSchema.parse({
      program: execution.program,
      reviewedScript: execution.reviewedScript,
      reviewHash: execution.reviewHash,
      interfaceMode: execution.interfaceMode,
      confirmed: execution.confirmed,
      typedConfirmation: execution.typedConfirmation,
      columns: execution.columns,
      rows: execution.rows,
      workingDirectoryToken: "c657cbe4-d80d-44f5-8d18-2f17119e9e6e"
    }).workingDirectoryToken).toMatch(/^[a-f0-9-]{36}$/);
    expect(ExecutionEventSchema.parse({
      sessionId: "c657cbe4-d80d-44f5-8d18-2f17119e9e6e",
      sequence: 1,
      type: "output",
      data: "ready\r\n",
      exitStatus: null,
      message: null,
      occurredAt: "2026-07-29T12:00:00Z"
    }).type).toBe("output");
    expect(() => ExecutionEventSchema.parse({
      sessionId: "c657cbe4-d80d-44f5-8d18-2f17119e9e6e",
      sequence: 2,
      type: "exit",
      data: null,
      exitStatus: null,
      message: null,
      occurredAt: "2026-07-29T12:00:00Z"
    })).toThrow();
    expect(ExecutionHistoryEntrySchema.parse({
      executionId: "c657cbe4-d80d-44f5-8d18-2f17119e9e6e",
      startedAt: "2026-07-29T12:00:00Z",
      finishedAt: null,
      workingDirectory: "/tmp",
      exitStatus: null,
      redactedCommandText: "curl --token=<redacted>",
      riskLevel: "medium"
    }).riskLevel).toBe("medium");
  });

  it("validates structured pipelines, redirects, sequences, comments, and raw code", () => {
    const command = {
      type: "command" as const,
      nodeId: "list",
      commandId: "ls",
      options: [],
      arguments: []
    };
    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "sequence",
        nodeId: "sequence",
        separator: "newline",
        items: [
          { type: "comment", nodeId: "comment", text: "Inspect and save" },
          {
            type: "pipeline",
            nodeId: "pipeline",
            operator: "|",
            stages: [
              command,
              {
                type: "redirect",
                nodeId: "redirect",
                subject: { ...command, nodeId: "search", commandId: "grep" },
                redirections: [{ operator: ">", target: "output.txt", targetKind: "literal" }]
              }
            ]
          },
          { type: "raw-code", nodeId: "raw", code: "printf '%s\\n' \"$CUSTOM\"", reason: "Unusual expansion" }
        ]
      }]
    });
    expect(program.statements[0]?.type).toBe("sequence");
  });

  it("distinguishes literal values from whole-word Bash variable references", () => {
    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [
        {
          type: "assignment",
          nodeId: "assignment",
          name: "OUTPUT",
          value: "result.txt",
          valueKind: "literal",
          exported: true
        },
        {
          type: "command",
          nodeId: "list",
          commandId: "ls",
          options: [],
          arguments: [{ argumentId: "files", value: "OUTPUT", valueKind: "variable" }]
        }
      ]
    });
    expect(program.statements[0]?.type).toBe("assignment");
    expect(() => ShellArgumentValueSchema.parse({
      argumentId: "files",
      value: "NOT-VALID",
      valueKind: "variable"
    })).toThrow();
  });

  it("validates recursively nested blocks and function bodies", () => {
    const command = {
      type: "command" as const,
      nodeId: "list",
      commandId: "ls",
      options: [],
      arguments: []
    };
    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "function",
        nodeId: "function",
        name: "inspect",
        body: [{
          type: "block",
          nodeId: "subshell",
          mode: "subshell",
          statements: [{
            type: "block",
            nodeId: "group",
            mode: "group",
            statements: [command]
          }]
        }]
      }]
    });
    expect(program.statements[0]?.type).toBe("function");
  });

  it("validates recursively nested conditionals and loops", () => {
    const command = (nodeId: string, commandId = "ls") => ({
      type: "command" as const,
      nodeId,
      commandId,
      options: [],
      arguments: []
    });
    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "if",
        nodeId: "if-1",
        branches: [{
          condition: command("condition-1"),
          body: [{
            type: "for",
            nodeId: "for-1",
            variable: "FILE",
            values: [
              { value: ".", valueKind: "literal" },
              { value: "ROOT", valueKind: "variable" }
            ],
            body: [command("for-body")]
          }]
        }, {
          condition: command("condition-2", "grep"),
          body: [command("elif-body")]
        }],
        elseBody: [{
          type: "loop",
          nodeId: "until-1",
          mode: "until",
          condition: command("until-condition"),
          body: [command("until-body")]
        }]
      }]
    });
    expect(program.statements[0]?.type).toBe("if");
    expect(() => ShellProgramSchema.parse({
      ...program,
      statements: [{
        type: "for",
        nodeId: "invalid-for",
        variable: "FILE",
        values: [{ value: "NOT-VALID", valueKind: "variable" }],
        body: [command("body")]
      }]
    })).toThrow();
  });

  it("distinguishes literal and glob case patterns", () => {
    const command = {
      type: "command" as const,
      nodeId: "case-body",
      commandId: "ls",
      options: [],
      arguments: []
    };
    const program = ShellProgramSchema.parse({
      schemaVersion: "1.4.0",
      dialect: "bash",
      statements: [{
        type: "case",
        nodeId: "case-1",
        word: { value: "VALUE", valueKind: "variable" },
        arms: [{
          patterns: [
            { value: "ready", kind: "literal" },
            { value: "*.log", kind: "glob" }
          ],
          body: [command]
        }]
      }]
    });
    expect(program.statements[0]?.type).toBe("case");
    expect(() => ShellProgramSchema.parse({
      ...program,
      statements: [{
        type: "case",
        nodeId: "case-invalid",
        word: { value: "VALUE", valueKind: "variable" },
        arms: [{ patterns: [{ value: "*.log; rm", kind: "glob" }], body: [command] }]
      }]
    })).toThrow();
  });

  it("validates parser source spans and raw-preservation diagnostics", () => {
    const result = ShellParseResultSchema.parse({
      program: {
        schemaVersion: "1.4.0",
        dialect: "bash",
        statements: [{ type: "raw-code", nodeId: "node-1", code: "value=$(date)", reason: "Command substitution" }]
      },
      sourceSpans: [{
        nodeId: "node-1",
        startOffset: 0,
        endOffset: 13,
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 14
      }],
      diagnostics: [{
        severity: "warning",
        code: "bash.unsupported",
        message: "Command substitution is preserved as raw code.",
        startOffset: 0,
        endOffset: 13
      }],
      preservedRaw: true
    });
    expect(result.program.statements[0]?.type).toBe("raw-code");
  });
});
