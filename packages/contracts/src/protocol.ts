import { z } from "zod";

export const JSON_RPC_VERSION = "2.0" as const;
export const PROTOCOL_VERSION = "1.0" as const;
export const HEALTH_CHECK_METHOD = "v1.health.check" as const;
export const CANCEL_REQUEST_METHOD = "v1.request.cancel" as const;
export const SYSTEM_DETECT_METHOD = "v1.system.detect" as const;
export const TOOLING_DETECT_METHOD = "v1.tooling.detect" as const;
export const TOOLING_SHELLCHECK_METHOD = "v1.tooling.shellcheck" as const;
export const TOOLING_SHFMT_METHOD = "v1.tooling.shfmt" as const;
export const LANGUAGE_OPEN_METHOD = "v1.language.open" as const;
export const LANGUAGE_CHANGE_METHOD = "v1.language.change" as const;
export const LANGUAGE_CLOSE_METHOD = "v1.language.close" as const;
export const LANGUAGE_COMPLETION_METHOD = "v1.language.completion" as const;
export const LANGUAGE_HOVER_METHOD = "v1.language.hover" as const;
export const LANGUAGE_SYMBOLS_METHOD = "v1.language.symbols" as const;
export const LANGUAGE_REFERENCES_METHOD = "v1.language.references" as const;
export const LANGUAGE_DIAGNOSTICS_METHOD = "v1.language.diagnostics" as const;
export const AI_MODELS_METHOD = "v1.ai.models" as const;
export const AI_TEST_METHOD = "v1.ai.test" as const;
export const AI_PROBE_METHOD = "v1.ai.probe" as const;
export const AI_PROPOSE_METHOD = "v1.ai.propose" as const;
export const CREDENTIAL_STATUS_METHOD = "v1.credentials.status" as const;
export const CREDENTIAL_STORE_METHOD = "v1.credentials.store" as const;
export const CREDENTIAL_DELETE_METHOD = "v1.credentials.delete" as const;
export const CATALOG_SEARCH_METHOD = "v1.catalog.search" as const;
export const CATALOG_DISCOVER_METHOD = "v1.catalog.discover" as const;
export const MANUAL_GET_METHOD = "v1.manual.get" as const;
export const SHELL_GENERATE_METHOD = "v1.shell.generate" as const;
export const CATALOG_PROBE_VERSION_METHOD = "v1.catalog.probeVersion" as const;
export const RISK_ASSESS_METHOD = "v1.risk.assess" as const;
export const PROJECT_SAVE_METHOD = "v1.projects.save" as const;
export const PROJECT_GET_METHOD = "v1.projects.get" as const;
export const PROJECT_LIST_METHOD = "v1.projects.list" as const;
export const PROJECT_IMPORT_METHOD = "v1.projects.import" as const;
export const BOOKMARK_SAVE_METHOD = "v1.bookmarks.save" as const;
export const BOOKMARK_LIST_METHOD = "v1.bookmarks.list" as const;
export const BOOKMARK_DELETE_METHOD = "v1.bookmarks.delete" as const;
export const EXPORT_CREATE_METHOD = "v1.export.create" as const;
export const EXECUTION_START_METHOD = "v1.execution.start" as const;
export const EXECUTION_INPUT_METHOD = "v1.execution.input" as const;
export const EXECUTION_RESIZE_METHOD = "v1.execution.resize" as const;
export const EXECUTION_CANCEL_METHOD = "v1.execution.cancel" as const;
export const EXECUTION_EVENT_METHOD = "v1.execution.event" as const;
export const HISTORY_LIST_METHOD = "v1.history.list" as const;
export const SHELL_PARSE_METHOD = "v1.shell.parse" as const;

export const JsonRpcIdSchema = z.union([z.string().min(1), z.number().int()]);

export const JsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal(JSON_RPC_VERSION),
    id: JsonRpcIdSchema,
    method: z.string().min(1),
    params: z.unknown().optional()
  })
  .strict();

export const JsonRpcNotificationSchema = z
  .object({
    jsonrpc: z.literal(JSON_RPC_VERSION),
    method: z.string().min(1),
    params: z.unknown().optional()
  })
  .strict();

export const JsonRpcErrorSchema = z
  .object({
    code: z.number().int(),
    message: z.string().min(1),
    data: z.unknown().optional()
  })
  .strict();

export const JsonRpcSuccessResponseSchema = z
  .object({
    jsonrpc: z.literal(JSON_RPC_VERSION),
    id: JsonRpcIdSchema,
    result: z.unknown()
  })
  .strict();

export const JsonRpcErrorResponseSchema = z
  .object({
    jsonrpc: z.literal(JSON_RPC_VERSION),
    id: JsonRpcIdSchema.nullable(),
    error: JsonRpcErrorSchema
  })
  .strict();

export const JsonRpcResponseSchema = z.union([
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema
]);

export const HealthCheckParamsSchema = z.object({}).strict();

export const CancelRequestParamsSchema = z
  .object({ requestId: JsonRpcIdSchema })
  .strict();

export const HealthCheckResultSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    workerVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    javaVersion: z.string().min(1),
    pid: z.number().int().positive()
  })
  .strict();

export const DistroTargetSchema = z
  .object({
    id: z.string().min(1),
    versionId: z.string().min(1),
    prettyName: z.string().min(1),
    family: z.enum(["ubuntu", "fedora", "other"]),
    supported: z.boolean()
  })
  .strict();

export const ShellEnvironmentSchema = z
  .object({
    executable: z.string(),
    dialect: z.enum(["bash", "zsh", "powershell", "unknown"])
  })
  .strict();

export const SystemProfileSchema = z
  .object({
    operatingSystem: z.enum(["linux", "macos", "windows", "other"]),
    architecture: z.string().min(1),
    shell: ShellEnvironmentSchema,
    distro: DistroTargetSchema.nullable(),
    pathEntries: z.array(z.string()).max(512)
  })
  .strict();

export const SystemDetectParamsSchema = z.object({}).strict();

export const ToolStatusSchema = z.object({
  id: z.enum(["bash-language-server", "shellcheck", "shfmt"]),
  displayName: z.string().min(1).max(100),
  status: z.enum(["installed", "missing"]),
  source: z.enum(["bundled", "system", "missing"]),
  executablePath: z.string().min(1).max(32_768).nullable(),
  installGuidance: z.string().min(1).max(1000)
}).strict().refine((tool) => (tool.status === "installed") === (tool.executablePath !== null), {
  message: "Installed tools require a path and missing tools must not invent one"
}).refine((tool) => (tool.status === "installed") === (tool.source !== "missing"), {
  message: "Installed tools require bundled/system provenance and missing tools require missing provenance"
});
export const ToolingDetectParamsSchema = z.object({}).strict();
export const ToolingProfileSchema = z.object({
  tools: z.array(ToolStatusSchema).length(3)
}).strict().refine((profile) => new Set(profile.tools.map((tool) => tool.id)).size === 3, {
  message: "Tooling profile must contain each supported tool exactly once"
});

export const LanguageOpenParamsSchema = z.object({
  source: z.string().max(1_000_000)
}).strict();
export const LanguageOpenResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("opened"),
    sessionId: z.uuid(),
    reason: z.null()
  }).strict(),
  z.object({
    status: z.literal("unavailable"),
    sessionId: z.null(),
    reason: z.string().min(1).max(1000)
  }).strict()
]);
export const LanguageChangeParamsSchema = z.object({
  sessionId: z.uuid(),
  source: z.string().max(1_000_000),
  version: z.number().int().min(2)
}).strict();
export const LanguageCloseParamsSchema = z.object({
  sessionId: z.uuid()
}).strict();
export const LanguagePositionParamsSchema = z.object({
  sessionId: z.uuid(),
  line: z.number().int().min(0).max(1_000_000),
  character: z.number().int().min(0).max(1_000_000)
}).strict();
export const LanguageCompletionItemSchema = z.object({
  label: z.string().min(1).max(500),
  insertText: z.string().max(4096),
  detail: z.string().max(2000).nullable(),
  documentation: z.string().max(20_000).nullable(),
  kind: z.number().int().min(1).max(25),
  snippet: z.boolean()
}).strict();
export const LanguageCompletionResultSchema = z.object({
  items: z.array(LanguageCompletionItemSchema).max(200),
  incomplete: z.boolean()
}).strict();
export const LanguageHoverResultSchema = z.object({
  contents: z.string().min(1).max(20_000).nullable()
}).strict();
export const LanguagePositionSchema = z.object({
  line: z.number().int().min(0).max(1_000_000),
  character: z.number().int().min(0).max(1_000_000)
}).strict();
export const LanguageRangeSchema = z.object({
  start: LanguagePositionSchema,
  end: LanguagePositionSchema
}).strict();
export const LanguageSymbolSchema = z.object({
  name: z.string().min(1).max(500),
  detail: z.string().max(2000).nullable(),
  containerName: z.string().max(500).nullable(),
  kind: z.number().int().min(1).max(26),
  range: LanguageRangeSchema,
  selectionRange: LanguageRangeSchema
}).strict();
export const LanguageSymbolsResultSchema = z.object({
  symbols: z.array(LanguageSymbolSchema).max(500)
}).strict();
export const LanguageReferenceSchema = z.object({
  range: LanguageRangeSchema
}).strict();
export const LanguageReferencesResultSchema = z.object({
  references: z.array(LanguageReferenceSchema).max(1000)
}).strict();
export const LanguageDiagnosticSchema = z.object({
  range: LanguageRangeSchema,
  severity: z.enum(["error", "warning", "information", "hint"]),
  code: z.string().max(100).nullable(),
  message: z.string().min(1).max(1000),
  source: z.string().max(100).nullable()
}).strict();
export const LanguageDiagnosticsEventSchema = z.object({
  sessionId: z.uuid(),
  version: z.number().int().min(1).nullable(),
  diagnostics: z.array(LanguageDiagnosticSchema).max(1000)
}).strict();
export const ToolSourceParamsSchema = z.object({
  source: z.string().max(1_000_000)
}).strict();
export const ShellCheckResultSchema = z.object({
  status: z.enum(["completed", "unavailable", "failed"]),
  diagnostics: z.array(LanguageDiagnosticSchema).max(1000),
  reason: z.string().min(1).max(1000).nullable()
}).strict().superRefine((result, context) => {
  if (result.status === "completed" && result.reason !== null) {
    context.addIssue({ code: "custom", message: "Completed ShellCheck results cannot have a failure reason" });
  }
  if (result.status !== "completed"
      && (result.reason === null || result.diagnostics.length !== 0)) {
    context.addIssue({ code: "custom", message: "Unavailable or failed ShellCheck results require only a reason" });
  }
});
export const ShfmtResultSchema = z.object({
  status: z.enum(["formatted", "unavailable", "failed"]),
  source: z.string().max(1_000_000).nullable(),
  changed: z.boolean(),
  reason: z.string().min(1).max(1000).nullable()
}).strict().superRefine((result, context) => {
  if (result.status === "formatted" && (result.source === null || result.reason !== null)) {
    context.addIssue({ code: "custom", message: "Formatted shfmt results require source and no failure reason" });
  }
  if (result.status !== "formatted"
      && (result.source !== null || result.changed || result.reason === null)) {
    context.addIssue({ code: "custom", message: "Unavailable or failed shfmt results require only a reason" });
  }
});
export const AiProviderSchema = z.enum(["ollama", "openai"]);
export const AiOperationSchema = z.enum([
  "generateExample", "explain", "completeScript", "improveScript", "explainFailure"
]);
export const AiEndpointParamsSchema = z.object({
  provider: AiProviderSchema,
  endpoint: z.url().max(2000),
  remoteEndpointConfirmed: z.boolean()
}).strict();
export const AiModelParamsSchema = AiEndpointParamsSchema.extend({
  model: z.string().min(1).max(500)
}).strict();
export const AiRequestSchema = AiModelParamsSchema.extend({
  operation: AiOperationSchema,
  instruction: z.string().trim().min(1).max(10_000),
  source: z.string().max(1_000_000).nullable(),
  failureMessage: z.string().max(20_000).nullable()
}).strict().superRefine((request, context) => {
  if (request.operation !== "generateExample" && (request.source === null || request.source.trim() === "")) {
    context.addIssue({ code: "custom", message: "This AI operation requires Bash source" });
  }
  if (request.operation === "explainFailure"
      && (request.failureMessage === null || request.failureMessage.trim() === "")) {
    context.addIssue({ code: "custom", message: "Failure explanation requires failure text" });
  }
});
export const AiModelSchema = z.object({
  id: z.string().min(1).max(500),
  displayName: z.string().min(1).max(500),
  parameterSize: z.string().min(1).max(100).nullable(),
  quantization: z.string().min(1).max(100).nullable()
}).strict();
export const AiModelsResultSchema = z.object({
  status: z.enum(["available", "unavailable", "failed"]),
  models: z.array(AiModelSchema).max(200),
  reason: z.string().min(1).max(2000).nullable()
}).strict().superRefine((result, context) => {
  if (result.status === "available" && result.reason !== null) {
    context.addIssue({ code: "custom", message: "Available model results cannot include an error" });
  }
  if (result.status !== "available" && (result.reason === null || result.models.length !== 0)) {
    context.addIssue({ code: "custom", message: "Unavailable model results require only a reason" });
  }
});
export const AiConnectionResultSchema = z.object({
  status: z.enum(["connected", "supported", "unavailable", "failed", "unsupported"]),
  reason: z.string().min(1).max(2000).nullable()
}).strict().refine(
  (result) => ["connected", "supported"].includes(result.status)
    ? result.reason === null
    : result.reason !== null,
  { message: "AI connection failures require a reason" }
);
export const CredentialProviderParamsSchema = z.object({
  provider: z.literal("openai")
}).strict();
export const CredentialStoreParamsSchema = z.object({
  provider: z.literal("openai"),
  credential: z.string().min(1).max(4096).refine(
    (value) => !/[\u0000-\u001f\u007f]/u.test(value),
    { message: "Credential cannot contain control characters" }
  )
}).strict();
export const CredentialStatusSchema = z.object({
  provider: z.literal("openai"),
  configured: z.boolean(),
  storage: z.enum(["secure", "session", "unavailable"]),
  backend: z.enum([
    "windows-credential-manager",
    "macos-keychain",
    "linux-secret-service",
    "session-memory",
    "none"
  ]),
  reason: z.string().min(1).max(1000).nullable()
}).strict().superRefine((result, context) => {
  if (result.storage === "secure"
      && (result.reason !== null
        || !["windows-credential-manager", "macos-keychain", "linux-secret-service"].includes(result.backend))) {
    context.addIssue({ code: "custom", message: "Secure credential status requires an OS credential backend" });
  }
  if (result.storage === "session"
      && (!result.configured || result.backend !== "session-memory" || result.reason === null)) {
    context.addIssue({ code: "custom", message: "Session credential status must disclose memory-only storage" });
  }
  if (result.storage === "unavailable" && (result.configured || result.reason === null)) {
    context.addIssue({ code: "custom", message: "Unavailable credential storage cannot be configured" });
  }
});

export const CommandOptionSchema = z
  .object({
    id: z.string().min(1),
    flags: z.array(z.string().min(1)).min(1),
    description: z.string().min(1),
    takesValue: z.boolean(),
    valueName: z.string().min(1).nullable(),
    repeatable: z.boolean(),
    combinable: z.boolean(),
    conflictsWith: z.array(z.string().min(1))
  })
  .strict()
  .refine((option) => option.takesValue === (option.valueName !== null), {
    message: "valueName must be present exactly when an option takes a value"
  });

export const CommandArgumentSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    required: z.boolean(),
    repeatable: z.boolean()
  })
  .strict();

export const CommandManualSchema = z
  .object({
    synopsis: z.string().min(1).max(2000),
    sections: z.array(
      z.object({
        heading: z.string().min(1).max(80),
        body: z.string().min(1).max(200_000)
      }).strict()
    ).max(32)
  })
  .strict();

export const CommandSpecSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    executable: z.string().min(1),
    versionProbeArguments: z.array(z.string().min(1).max(100)).min(1).max(4),
    displayName: z.string().min(1),
    summary: z.string().min(1),
    category: z.string().min(1),
    platforms: z.array(z.enum(["linux", "macos", "windows"])).min(1),
    distroFamilies: z.array(z.enum(["ubuntu", "fedora", "other"])),
    arguments: z.array(CommandArgumentSchema),
    riskTags: z.array(z.enum([
      "read-only",
      "filesystem-write",
      "network",
      "process-signal",
      "package-query",
      "system-change",
      "package-change",
      "privilege",
      "destructive"
    ])),
    shortOptionPolicy: z.enum(["never", "combine-boolean"]),
    availability: z.enum(["installed", "missing", "unknown"]),
    executablePath: z.string().min(1).nullable(),
    compatibility: z.object({
      status: z.enum(["supported", "limited", "unsupported", "unknown"]),
      target: z.string().min(1).max(200),
      note: z.string().min(1).max(1000)
    }).strict(),
    options: z.array(CommandOptionSchema),
    examples: z.array(z.string().min(1)),
    manual: CommandManualSchema
  })
  .strict();

export const CatalogSearchParamsSchema = z
  .object({
    query: z.string().max(200),
    limit: z.number().int().min(1).max(100)
  })
  .strict();

export const CatalogSearchResultSchema = z
  .object({
    catalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    total: z.number().int().nonnegative(),
    commands: z.array(CommandSpecSchema)
  })
  .strict();

export const CatalogDiscoverParamsSchema = z
  .object({
    limit: z.number().int().min(1).max(5_000),
    refresh: z.boolean()
  })
  .strict();

export const DiscoveredExecutableSchema = z
  .object({
    executable: z.string().min(1).max(255),
    path: z.string().min(1).max(32_768),
    catalogCommandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).nullable(),
    category: z.string().min(1).max(100).nullable(),
    summary: z.string().min(1).max(2_000).nullable()
  })
  .strict()
  .refine((entry) => (entry.catalogCommandId === null) === (entry.category === null), {
    message: "Catalog category must be present exactly when a catalog command ID is present"
  })
  .refine((entry) => (entry.catalogCommandId === null) === (entry.summary === null), {
    message: "Catalog summary must be present exactly when a catalog command ID is present"
  });

export const CatalogDiscoveryResultSchema = z
  .object({
    total: z.number().int().nonnegative().max(20_000),
    truncated: z.boolean(),
    cached: z.boolean(),
    shadowedCount: z.number().int().nonnegative(),
    skippedUnsafeNames: z.number().int().nonnegative(),
    executables: z.array(DiscoveredExecutableSchema).max(5_000)
  })
  .strict()
  .refine((result) => result.total >= result.executables.length, {
    message: "Discovery total cannot be smaller than the returned executable list"
  });

export const ManualGetParamsSchema = z
  .object({ commandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/) })
  .strict();

export const TldrSupplementSchema = z
  .object({
    examples: z.array(z.object({
      description: z.string().min(1).max(500),
      command: z.string().min(1).max(4096)
    }).strict()).min(1).max(20),
    attribution: z.object({
      source: z.literal("tldr-pages"),
      pageUrl: z.string().url().max(1000),
      sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
      retrievedAt: z.iso.date(),
      copyright: z.string().min(1).max(300),
      license: z.literal("CC-BY 4.0"),
      licenseUrl: z.literal("https://creativecommons.org/licenses/by/4.0/")
    }).strict()
  })
  .strict();

export const ManualGetResultSchema = z
  .object({
    commandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    source: z.enum(["man", "help", "bundled"]),
    truncated: z.boolean(),
    manual: CommandManualSchema,
    tldr: TldrSupplementSchema.nullable()
  })
  .strict();

export const ShellOptionSelectionSchema = z
  .object({
    optionId: z.string().min(1),
    spelling: z.string().min(1),
    value: z.string().max(4096).nullable(),
    valueKind: z.enum(["literal", "variable"]).nullable()
  })
  .strict()
  .refine((selection) => (selection.value === null) === (selection.valueKind === null), {
    message: "Option value and valueKind must both be present or absent"
  })
  .refine((selection) => selection.valueKind !== "variable" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(selection.value ?? ""), {
    message: "Variable option values must be valid Bash names"
  });

export const ShellArgumentValueSchema = z
  .object({
    argumentId: z.string().min(1),
    value: z.string().max(4096),
    valueKind: z.enum(["literal", "variable"])
  })
  .strict()
  .refine((argument) => argument.valueKind !== "variable" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(argument.value), {
    message: "Variable arguments must be valid Bash names"
  });

export const ShellCommandNodeSchema = z
  .object({
    type: z.literal("command"),
    nodeId: z.string().min(1).max(128),
    commandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    options: z.array(ShellOptionSelectionSchema).max(128),
    arguments: z.array(ShellArgumentValueSchema).max(128)
  })
  .strict();

export const ShellRedirectionSchema = z
  .object({
    operator: z.enum(["<", ">", ">>", "2>", "2>>", "&>"]),
    target: z.string().max(4096),
    targetKind: z.enum(["literal", "variable"])
  })
  .strict()
  .refine((redirect) => redirect.targetKind !== "variable" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(redirect.target), {
    message: "Variable redirect targets must be valid Bash names"
  });

export const ShellRedirectNodeSchema = z
  .object({
    type: z.literal("redirect"),
    nodeId: z.string().min(1).max(128),
    subject: ShellCommandNodeSchema,
    redirections: z.array(ShellRedirectionSchema).min(1).max(16)
  })
  .strict();

export type ShellCommandNode = z.infer<typeof ShellCommandNodeSchema>;
export type ShellRedirectNode = z.infer<typeof ShellRedirectNodeSchema>;
export type ShellAssignmentNode = {
  type: "assignment";
  nodeId: string;
  name: string;
  value: string;
  valueKind: "literal" | "variable";
  exported: boolean;
};
export type ShellCommentNode = { type: "comment"; nodeId: string; text: string };
export type ShellRawCodeNode = { type: "raw-code"; nodeId: string; code: string; reason: string };
export type ShellBlockNode = {
  type: "block";
  nodeId: string;
  mode: "group" | "subshell";
  statements: ShellNode[];
};
export type ShellFunctionNode = {
  type: "function";
  nodeId: string;
  name: string;
  body: ShellNode[];
};
export type ShellWord = {
  value: string;
  valueKind: "literal" | "variable";
};
export type ShellPipelineStage = ShellCommandNode | ShellRedirectNode | ShellBlockNode;
export type ShellPipelineNode = {
  type: "pipeline";
  nodeId: string;
  operator: "|" | "|&";
  stages: ShellPipelineStage[];
};
export type ShellBooleanOperand = ShellCommandNode | ShellRedirectNode | ShellPipelineNode | ShellBlockNode;
export type ShellBooleanChainNode = {
  type: "boolean-chain";
  nodeId: string;
  operator: "&&" | "||";
  left: ShellBooleanOperand;
  right: ShellBooleanOperand;
};
export type ShellIfBranch = {
  condition: ShellBooleanOperand;
  body: ShellNode[];
};
export type ShellIfNode = {
  type: "if";
  nodeId: string;
  branches: ShellIfBranch[];
  elseBody: ShellNode[] | null;
};
export type ShellLoopNode = {
  type: "loop";
  nodeId: string;
  mode: "while" | "until";
  condition: ShellBooleanOperand;
  body: ShellNode[];
};
export type ShellForNode = {
  type: "for";
  nodeId: string;
  variable: string;
  values: ShellWord[];
  body: ShellNode[];
};
export type ShellCasePattern = {
  value: string;
  kind: "literal" | "glob";
};
export type ShellCaseArm = {
  patterns: ShellCasePattern[];
  body: ShellNode[];
};
export type ShellCaseNode = {
  type: "case";
  nodeId: string;
  word: ShellWord;
  arms: ShellCaseArm[];
};
export type ShellSequenceItem = ShellCommandNode | ShellRedirectNode | ShellPipelineNode
  | ShellBooleanChainNode | ShellAssignmentNode | ShellBlockNode | ShellFunctionNode
  | ShellIfNode | ShellLoopNode | ShellForNode | ShellCaseNode
  | ShellCommentNode | ShellRawCodeNode;
export type ShellSequenceNode = {
  type: "sequence";
  nodeId: string;
  separator: ";" | "newline";
  items: ShellSequenceItem[];
};
export type ShellNode = ShellSequenceItem | ShellSequenceNode;

export const ShellBlockNodeSchema: z.ZodType<ShellBlockNode> = z.lazy(() => z
  .object({
    type: z.literal("block"),
    nodeId: z.string().min(1).max(128),
    mode: z.enum(["group", "subshell"]),
    statements: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellFunctionNodeSchema: z.ZodType<ShellFunctionNode> = z.lazy(() => z
  .object({
    type: z.literal("function"),
    nodeId: z.string().min(1).max(128),
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    body: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellPipelineStageSchema: z.ZodType<ShellPipelineStage> = z.union([
  ShellCommandNodeSchema,
  ShellRedirectNodeSchema,
  ShellBlockNodeSchema
]);

export const ShellPipelineNodeSchema: z.ZodType<ShellPipelineNode> = z
  .object({
    type: z.literal("pipeline"),
    nodeId: z.string().min(1).max(128),
    operator: z.enum(["|", "|&"]),
    stages: z.array(ShellPipelineStageSchema).min(2).max(64)
  })
  .strict();

export const ShellBooleanOperandSchema: z.ZodType<ShellBooleanOperand> = z.union([
  ShellCommandNodeSchema,
  ShellRedirectNodeSchema,
  ShellPipelineNodeSchema,
  ShellBlockNodeSchema
]);

export const ShellBooleanChainNodeSchema: z.ZodType<ShellBooleanChainNode> = z
  .object({
    type: z.literal("boolean-chain"),
    nodeId: z.string().min(1).max(128),
    operator: z.enum(["&&", "||"]),
    left: ShellBooleanOperandSchema,
    right: ShellBooleanOperandSchema
  })
  .strict();

export const ShellIfBranchSchema: z.ZodType<ShellIfBranch> = z.lazy(() => z
  .object({
    condition: ShellBooleanOperandSchema,
    body: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellIfNodeSchema: z.ZodType<ShellIfNode> = z.lazy(() => z
  .object({
    type: z.literal("if"),
    nodeId: z.string().min(1).max(128),
    branches: z.array(ShellIfBranchSchema).min(1).max(32),
    elseBody: z.array(ShellNodeSchema).min(1).max(1000).nullable()
  })
  .strict());

export const ShellLoopNodeSchema: z.ZodType<ShellLoopNode> = z.lazy(() => z
  .object({
    type: z.literal("loop"),
    nodeId: z.string().min(1).max(128),
    mode: z.enum(["while", "until"]),
    condition: ShellBooleanOperandSchema,
    body: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellWordSchema: z.ZodType<ShellWord> = z
  .object({
    value: z.string().max(4096),
    valueKind: z.enum(["literal", "variable"])
  })
  .strict()
  .refine((word) => word.valueKind !== "variable" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(word.value), {
    message: "Variable words must be valid Bash names"
  });

export const ShellForNodeSchema: z.ZodType<ShellForNode> = z.lazy(() => z
  .object({
    type: z.literal("for"),
    nodeId: z.string().min(1).max(128),
    variable: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    values: z.array(ShellWordSchema).min(1).max(1000),
    body: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellCasePatternSchema: z.ZodType<ShellCasePattern> = z
  .object({
    value: z.string().min(1).max(4096),
    kind: z.enum(["literal", "glob"])
  })
  .strict()
  .refine((pattern) => pattern.kind !== "glob" || /^[A-Za-z0-9_@%+=:,./*?\[\]!-]+$/.test(pattern.value), {
    message: "Glob case patterns may contain only portable pattern characters"
  });

export const ShellCaseArmSchema: z.ZodType<ShellCaseArm> = z.lazy(() => z
  .object({
    patterns: z.array(ShellCasePatternSchema).min(1).max(64),
    body: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict());

export const ShellCaseNodeSchema: z.ZodType<ShellCaseNode> = z.lazy(() => z
  .object({
    type: z.literal("case"),
    nodeId: z.string().min(1).max(128),
    word: ShellWordSchema,
    arms: z.array(ShellCaseArmSchema).min(1).max(128)
  })
  .strict());

export const ShellCommentNodeSchema: z.ZodType<ShellCommentNode> = z
  .object({
    type: z.literal("comment"),
    nodeId: z.string().min(1).max(128),
    text: z.string().max(10_000)
  })
  .strict();

export const ShellRawCodeNodeSchema: z.ZodType<ShellRawCodeNode> = z
  .object({
    type: z.literal("raw-code"),
    nodeId: z.string().min(1).max(128),
    code: z.string().min(1).max(200_000),
    reason: z.string().min(1).max(1000)
  })
  .strict();

export const ShellAssignmentNodeSchema: z.ZodType<ShellAssignmentNode> = z
  .object({
    type: z.literal("assignment"),
    nodeId: z.string().min(1).max(128),
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    value: z.string().max(4096),
    valueKind: z.enum(["literal", "variable"]),
    exported: z.boolean()
  })
  .strict()
  .refine((assignment) => assignment.valueKind !== "variable" || /^[A-Za-z_][A-Za-z0-9_]*$/.test(assignment.value), {
    message: "Variable assignment values must be valid Bash names"
  });

export const ShellSequenceItemSchema: z.ZodType<ShellSequenceItem> = z.union([
  ShellCommandNodeSchema,
  ShellRedirectNodeSchema,
  ShellPipelineNodeSchema,
  ShellBooleanChainNodeSchema,
  ShellAssignmentNodeSchema,
  ShellBlockNodeSchema,
  ShellFunctionNodeSchema,
  ShellIfNodeSchema,
  ShellLoopNodeSchema,
  ShellForNodeSchema,
  ShellCaseNodeSchema,
  ShellCommentNodeSchema,
  ShellRawCodeNodeSchema
]);

export const ShellSequenceNodeSchema: z.ZodType<ShellSequenceNode> = z
  .object({
    type: z.literal("sequence"),
    nodeId: z.string().min(1).max(128),
    separator: z.enum([";", "newline"]),
    items: z.array(ShellSequenceItemSchema).min(1).max(1000)
  })
  .strict();

export const ShellNodeSchema: z.ZodType<ShellNode> = z.union([
  ShellCommandNodeSchema,
  ShellRedirectNodeSchema,
  ShellPipelineNodeSchema,
  ShellBooleanChainNodeSchema,
  ShellSequenceNodeSchema,
  ShellAssignmentNodeSchema,
  ShellBlockNodeSchema,
  ShellFunctionNodeSchema,
  ShellIfNodeSchema,
  ShellLoopNodeSchema,
  ShellForNodeSchema,
  ShellCaseNodeSchema,
  ShellCommentNodeSchema,
  ShellRawCodeNodeSchema
]);

export const ShellProgramSchema = z
  .object({
    schemaVersion: z.literal("1.4.0"),
    dialect: z.literal("bash"),
    statements: z.array(ShellNodeSchema).min(1).max(1000)
  })
  .strict();

export const ShellGenerateParamsSchema = z.object({ program: ShellProgramSchema }).strict();

export const ShellGenerateResultSchema = z
  .object({
    script: z.string().min(1).max(1_000_000),
    compacted: z.boolean(),
    warnings: z.array(z.string().min(1).max(1000)).max(100)
  })
  .strict();

export const SourceSpanSchema = z
  .object({
    nodeId: z.string().min(1).max(128),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    startLine: z.number().int().positive(),
    startColumn: z.number().int().positive(),
    endLine: z.number().int().positive(),
    endColumn: z.number().int().positive()
  })
  .strict()
  .refine((span) => span.endOffset >= span.startOffset, {
    message: "Source span end must not precede its start"
  });

export const ShellDiagnosticSchema = z
  .object({
    severity: z.enum(["info", "warning", "error"]),
    code: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    message: z.string().min(1).max(1000),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative()
  })
  .strict();

export const ShellParseParamsSchema = z
  .object({ source: z.string().min(1).max(1_000_000) })
  .strict();

export const ShellParseResultSchema = z
  .object({
    program: ShellProgramSchema,
    sourceSpans: z.array(SourceSpanSchema).max(5000),
    diagnostics: z.array(ShellDiagnosticSchema).max(1000),
    preservedRaw: z.boolean()
  })
  .strict();

export const CatalogProbeVersionParamsSchema = z
  .object({
    commandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    force: z.boolean()
  })
  .strict();

export const CatalogProbeVersionResultSchema = z
  .object({
    commandId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    status: z.enum(["detected", "unavailable", "failed", "timed-out"]),
    version: z.string().min(1).max(200).nullable(),
    cached: z.boolean(),
    truncated: z.boolean()
  })
  .strict()
  .refine((result) => (result.status === "detected") === (result.version !== null), {
    message: "version must be present exactly when detection succeeds"
  });

export const RiskEvidenceSchema = z
  .object({
    ruleId: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
    nodeId: z.string().min(1).max(128),
    message: z.string().min(1).max(1000)
  })
  .strict();

export const RiskAssessParamsSchema = z.object({ program: ShellProgramSchema }).strict();

export const RiskAssessmentSchema = z
  .object({
    script: z.string().min(1).max(1_000_000),
    reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
    level: z.enum(["low", "medium", "high", "critical"]),
    confirmation: z.enum(["none", "confirm", "type-script"]),
    evidence: z.array(RiskEvidenceSchema).min(1).max(100)
  })
  .strict();

export const AiProposalSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  provider: AiProviderSchema,
  model: z.string().min(1).max(500),
  operation: AiOperationSchema,
  proposedCode: z.string().min(1).max(1_000_000),
  explanation: z.string().min(1).max(20_000),
  assumptions: z.array(z.string().min(1).max(2000)).max(50),
  warnings: z.array(z.string().min(1).max(2000)).max(100),
  riskHints: z.array(z.string().min(1).max(2000)).max(50),
  program: ShellProgramSchema,
  diagnostics: z.array(ShellDiagnosticSchema).max(1000),
  preservedRaw: z.boolean(),
  assessment: RiskAssessmentSchema
}).strict();

export const AiProposalResultSchema = z.object({
  status: z.enum(["proposed", "refused", "failed"]),
  proposal: AiProposalSchema.nullable(),
  reason: z.string().min(1).max(2000).nullable()
}).strict().superRefine((result, context) => {
  if (result.status === "proposed" && (result.proposal === null || result.reason !== null)) {
    context.addIssue({ code: "custom", message: "Successful AI results require only a proposal" });
  }
  if (result.status !== "proposed" && (result.proposal !== null || result.reason === null)) {
    context.addIssue({ code: "custom", message: "Refused or failed AI results require only a reason" });
  }
});

export const ProjectTargetSchema = z
  .object({
    operatingSystem: z.enum(["linux", "macos", "windows"]),
    architecture: z.string().min(1).max(100),
    shellDialect: z.enum(["bash", "zsh", "powershell"]),
    distroFamily: z.enum(["ubuntu", "fedora", "other"]).nullable(),
    distroVersion: z.string().min(1).max(100).nullable()
  })
  .strict();

export const ProjectParameterSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
    description: z.string().max(1000),
    required: z.boolean(),
    sensitive: z.boolean(),
    defaultValue: z.string().max(4096).nullable()
  })
  .strict()
  .refine((parameter) => !parameter.sensitive || parameter.defaultValue === null, {
    message: "Sensitive project parameters cannot store defaults"
  });

export const ProjectLayoutSchema = z
  .object({
    nodes: z.array(z.object({
      nodeId: z.string().min(1).max(128),
      x: z.number().finite(),
      y: z.number().finite()
    }).strict()).max(5000),
    viewport: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().finite().min(0.05).max(8)
    }).strict()
  })
  .strict();

export const ScriptProjectSchema = z
  .object({
    schemaVersion: z.literal("1.4.0"),
    projectId: z.uuid(),
    name: z.string().trim().min(1).max(120),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    catalogVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    target: ProjectTargetSchema,
    program: ShellProgramSchema,
    layout: ProjectLayoutSchema,
    parameters: z.array(ProjectParameterSchema).max(200)
  })
  .strict();

export const ProjectSaveParamsSchema = z.object({ project: ScriptProjectSchema }).strict();
export const ProjectSaveResultSchema = z.object({ project: ScriptProjectSchema }).strict();
export const ProjectGetParamsSchema = z.object({ projectId: z.uuid() }).strict();
export const ProjectGetResultSchema = z.object({ project: ScriptProjectSchema.nullable() }).strict();
export const ProjectListParamsSchema = z.object({ limit: z.number().int().min(1).max(100) }).strict();
export const ProjectSummarySchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1).max(120),
  updatedAt: z.iso.datetime({ offset: true })
}).strict();
export const ProjectListResultSchema = z.object({ projects: z.array(ProjectSummarySchema) }).strict();

export const StructuredBookmarkSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  bookmarkId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  program: ShellProgramSchema,
  parameters: z.array(ProjectParameterSchema).max(200),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true })
}).strict();
export const BookmarkSaveParamsSchema = z.object({
  bookmarkId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  program: ShellProgramSchema,
  parameters: z.array(ProjectParameterSchema).max(200)
}).strict();
export const BookmarkSaveResultSchema = z.object({
  bookmark: StructuredBookmarkSchema
}).strict();
export const BookmarkListParamsSchema = z.object({
  limit: z.number().int().min(1).max(100)
}).strict();
export const BookmarkListResultSchema = z.object({
  bookmarks: z.array(StructuredBookmarkSchema).max(100)
}).strict();
export const BookmarkDeleteParamsSchema = z.object({
  bookmarkId: z.uuid()
}).strict();
export const BookmarkDeleteResultSchema = z.object({
  deleted: z.boolean()
}).strict();

export const ProjectImportParamsSchema = z.object({
  content: z.string().trim().min(1).max(2_000_000)
}).strict();
export const ProjectImportResultSchema = z.object({ project: ScriptProjectSchema }).strict();

export const ExportFormatSchema = z.enum(["project", "bash", "markdown"]);
export const ExportCreateParamsSchema = z.object({
  project: ScriptProjectSchema,
  format: ExportFormatSchema,
  strictMode: z.boolean(),
  includeSourceComments: z.boolean()
}).strict();
export const ExportArtifactSchema = z.object({
  format: ExportFormatSchema,
  suggestedFileName: z.string().min(1).max(160),
  mediaType: z.enum(["application/json", "text/x-shellscript", "text/markdown"]),
  content: z.string().min(1).max(2_000_000),
  syntaxValidation: z.enum(["passed", "not-applicable"]),
  warnings: z.array(z.string().min(1).max(1000)).max(100)
}).strict();

export const FileExportResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("canceled") }).strict(),
  z.object({
    status: z.literal("saved"),
    format: ExportFormatSchema,
    fileName: z.string().min(1).max(260),
    bytes: z.number().int().min(1).max(2_000_000),
    syntaxValidation: z.enum(["passed", "not-applicable"]),
    warnings: z.array(z.string().min(1).max(1000)).max(100)
  }).strict()
]);
export const ClipboardCopyParamsSchema = z.object({
  program: ShellProgramSchema
}).strict();
export const ClipboardCopyResultSchema = z.object({
  copied: z.literal(true),
  characters: z.number().int().min(1).max(1_000_000)
}).strict();
export const ProjectFileImportParamsSchema = z.object({}).strict();
export const ProjectFileImportResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("canceled") }).strict(),
  z.object({
    status: z.literal("imported"),
    fileName: z.string().min(1).max(260),
    project: ScriptProjectSchema
  }).strict()
]);

export const ExecutionStartParamsSchema = z.object({
  program: ShellProgramSchema,
  reviewedScript: z.string().min(1).max(1_000_000),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  interfaceMode: z.enum(["guided", "compact"]),
  confirmed: z.boolean(),
  typedConfirmation: z.string().max(100).nullable(),
  workingDirectory: z.string().min(1).max(4096),
  columns: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(200)
}).strict();

export const ExecutionStartUiParamsSchema = ExecutionStartParamsSchema
  .omit({ workingDirectory: true })
  .extend({ workingDirectoryToken: z.uuid() })
  .strict();

export const ExecutionStartResultSchema = z.object({
  sessionId: z.uuid(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  startedAt: z.iso.datetime({ offset: true })
}).strict();

export const ExecutionInputParamsSchema = z.object({
  sessionId: z.uuid(),
  data: z.string().min(1).max(65_536)
}).strict();
export const ExecutionResizeParamsSchema = z.object({
  sessionId: z.uuid(),
  columns: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(200)
}).strict();
export const ExecutionCancelParamsSchema = z.object({ sessionId: z.uuid() }).strict();
export const AcceptedResultSchema = z.object({ accepted: z.literal(true) }).strict();

export const ExecutionEventSchema = z.object({
  sessionId: z.uuid(),
  sequence: z.number().int().min(1),
  type: z.enum(["started", "output", "exit", "error"]),
  data: z.string().max(16_384).nullable(),
  exitStatus: z.number().int().nullable(),
  message: z.string().min(1).max(1000).nullable(),
  occurredAt: z.iso.datetime({ offset: true })
}).strict().superRefine((event, context) => {
  if (event.type === "output" && event.data === null) {
    context.addIssue({ code: "custom", message: "Output events require data" });
  }
  if (event.type === "exit" && event.exitStatus === null) {
    context.addIssue({ code: "custom", message: "Exit events require an exit status" });
  }
  if (event.type === "error" && event.message === null) {
    context.addIssue({ code: "custom", message: "Error events require a message" });
  }
});

export const WorkingDirectoryResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("canceled") }).strict(),
  z.object({
    status: z.literal("selected"),
    token: z.uuid(),
    label: z.string().min(1).max(260)
  }).strict()
]);

export const ExecutionHistoryEntrySchema = z.object({
  executionId: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
  workingDirectory: z.string().min(1).max(4096),
  exitStatus: z.number().int().nullable(),
  redactedCommandText: z.string().max(1_000_000),
  riskLevel: z.enum(["low", "medium", "high", "critical"])
}).strict();
export const HistoryListParamsSchema = z.object({
  limit: z.number().int().min(1).max(100)
}).strict();
export const HistoryListResultSchema = z.object({
  entries: z.array(ExecutionHistoryEntrySchema).max(100)
}).strict();

export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;
export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;
export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type DistroTarget = z.infer<typeof DistroTargetSchema>;
export type ShellEnvironment = z.infer<typeof ShellEnvironmentSchema>;
export type SystemProfile = z.infer<typeof SystemProfileSchema>;
export type ToolStatus = z.infer<typeof ToolStatusSchema>;
export type ToolingProfile = z.infer<typeof ToolingProfileSchema>;
export type LanguageOpenResult = z.infer<typeof LanguageOpenResultSchema>;
export type LanguageCompletionItem = z.infer<typeof LanguageCompletionItemSchema>;
export type LanguageCompletionResult = z.infer<typeof LanguageCompletionResultSchema>;
export type LanguageHoverResult = z.infer<typeof LanguageHoverResultSchema>;
export type LanguageSymbol = z.infer<typeof LanguageSymbolSchema>;
export type LanguageSymbolsResult = z.infer<typeof LanguageSymbolsResultSchema>;
export type LanguageReference = z.infer<typeof LanguageReferenceSchema>;
export type LanguageReferencesResult = z.infer<typeof LanguageReferencesResultSchema>;
export type LanguageDiagnostic = z.infer<typeof LanguageDiagnosticSchema>;
export type LanguageDiagnosticsEvent = z.infer<typeof LanguageDiagnosticsEventSchema>;
export type ShellCheckResult = z.infer<typeof ShellCheckResultSchema>;
export type ShfmtResult = z.infer<typeof ShfmtResultSchema>;
export type AiProvider = z.infer<typeof AiProviderSchema>;
export type AiOperation = z.infer<typeof AiOperationSchema>;
export type AiEndpointParams = z.infer<typeof AiEndpointParamsSchema>;
export type AiModelParams = z.infer<typeof AiModelParamsSchema>;
export type AiRequest = z.infer<typeof AiRequestSchema>;
export type AiModel = z.infer<typeof AiModelSchema>;
export type AiModelsResult = z.infer<typeof AiModelsResultSchema>;
export type AiConnectionResult = z.infer<typeof AiConnectionResultSchema>;
export type AiProposal = z.infer<typeof AiProposalSchema>;
export type AiProposalResult = z.infer<typeof AiProposalResultSchema>;
export type CredentialProviderParams = z.infer<typeof CredentialProviderParamsSchema>;
export type CredentialStoreParams = z.infer<typeof CredentialStoreParamsSchema>;
export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;
export type CommandOption = z.infer<typeof CommandOptionSchema>;
export type CommandArgument = z.infer<typeof CommandArgumentSchema>;
export type CommandManual = z.infer<typeof CommandManualSchema>;
export type CommandSpec = z.infer<typeof CommandSpecSchema>;
export type CatalogSearchParams = z.infer<typeof CatalogSearchParamsSchema>;
export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;
export type CatalogDiscoverParams = z.infer<typeof CatalogDiscoverParamsSchema>;
export type DiscoveredExecutable = z.infer<typeof DiscoveredExecutableSchema>;
export type CatalogDiscoveryResult = z.infer<typeof CatalogDiscoveryResultSchema>;
export type ManualGetResult = z.infer<typeof ManualGetResultSchema>;
export type ShellOptionSelection = z.infer<typeof ShellOptionSelectionSchema>;
export type ShellArgumentValue = z.infer<typeof ShellArgumentValueSchema>;
export type ShellRedirection = z.infer<typeof ShellRedirectionSchema>;
export type ShellProgram = z.infer<typeof ShellProgramSchema>;
export type ShellGenerateResult = z.infer<typeof ShellGenerateResultSchema>;
export type SourceSpan = z.infer<typeof SourceSpanSchema>;
export type ShellDiagnostic = z.infer<typeof ShellDiagnosticSchema>;
export type ShellParseResult = z.infer<typeof ShellParseResultSchema>;
export type CatalogProbeVersionResult = z.infer<typeof CatalogProbeVersionResultSchema>;
export type RiskEvidence = z.infer<typeof RiskEvidenceSchema>;
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;
export type ProjectTarget = z.infer<typeof ProjectTargetSchema>;
export type ProjectParameter = z.infer<typeof ProjectParameterSchema>;
export type ProjectLayout = z.infer<typeof ProjectLayoutSchema>;
export type ScriptProject = z.infer<typeof ScriptProjectSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type ProjectGetResult = z.infer<typeof ProjectGetResultSchema>;
export type ProjectListResult = z.infer<typeof ProjectListResultSchema>;
export type StructuredBookmark = z.infer<typeof StructuredBookmarkSchema>;
export type BookmarkSaveParams = z.infer<typeof BookmarkSaveParamsSchema>;
export type BookmarkListResult = z.infer<typeof BookmarkListResultSchema>;
export type BookmarkDeleteResult = z.infer<typeof BookmarkDeleteResultSchema>;
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
export type ExportArtifact = z.infer<typeof ExportArtifactSchema>;
export type ExportCreateParams = z.infer<typeof ExportCreateParamsSchema>;
export type FileExportResult = z.infer<typeof FileExportResultSchema>;
export type ClipboardCopyResult = z.infer<typeof ClipboardCopyResultSchema>;
export type ProjectFileImportResult = z.infer<typeof ProjectFileImportResultSchema>;
export type ExecutionStartParams = z.infer<typeof ExecutionStartParamsSchema>;
export type ExecutionStartUiParams = z.infer<typeof ExecutionStartUiParamsSchema>;
export type ExecutionStartResult = z.infer<typeof ExecutionStartResultSchema>;
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;
export type WorkingDirectoryResult = z.infer<typeof WorkingDirectoryResultSchema>;
export type ExecutionHistoryEntry = z.infer<typeof ExecutionHistoryEntrySchema>;
export type HistoryListResult = z.infer<typeof HistoryListResultSchema>;
