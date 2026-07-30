import { contextBridge, ipcRenderer } from "electron";
import {
  CatalogSearchParamsSchema,
  CatalogSearchResultSchema,
  CatalogDiscoverParamsSchema,
  CatalogDiscoveryResultSchema,
  CatalogProbeVersionParamsSchema,
  CatalogProbeVersionResultSchema,
  HealthCheckResultSchema,
  ManualGetParamsSchema,
  ManualGetResultSchema,
  ShellGenerateParamsSchema,
  ShellGenerateResultSchema,
  ShellParseParamsSchema,
  ShellParseResultSchema,
  RiskAssessParamsSchema,
  RiskAssessmentSchema,
  ProjectGetParamsSchema,
  ProjectGetResultSchema,
  ProjectListParamsSchema,
  ProjectListResultSchema,
  ProjectSaveParamsSchema,
  ProjectSaveResultSchema,
  BookmarkSaveParamsSchema,
  BookmarkSaveResultSchema,
  BookmarkListParamsSchema,
  BookmarkListResultSchema,
  BookmarkDeleteParamsSchema,
  BookmarkDeleteResultSchema,
  ExportCreateParamsSchema,
  FileExportResultSchema,
  ClipboardCopyParamsSchema,
  ClipboardCopyResultSchema,
  ProjectFileImportParamsSchema,
  ProjectFileImportResultSchema,
  ExecutionStartUiParamsSchema,
  ExecutionStartResultSchema,
  ExecutionInputParamsSchema,
  ExecutionResizeParamsSchema,
  ExecutionCancelParamsSchema,
  ExecutionEventSchema,
  AcceptedResultSchema,
  WorkingDirectoryResultSchema,
  HistoryListParamsSchema,
  HistoryListResultSchema,
  SystemProfileSchema,
  ToolingProfileSchema,
  ToolSourceParamsSchema,
  ShellCheckResultSchema,
  ShfmtResultSchema,
  AiEndpointParamsSchema,
  AiModelParamsSchema,
  AiRequestSchema,
  AiModelsResultSchema,
  AiConnectionResultSchema,
  AiProposalResultSchema,
  CredentialProviderParamsSchema,
  CredentialStoreParamsSchema,
  CredentialStatusSchema,
  LanguageOpenParamsSchema,
  LanguageOpenResultSchema,
  LanguageChangeParamsSchema,
  LanguageCloseParamsSchema,
  LanguagePositionParamsSchema,
  LanguageCompletionResultSchema,
  LanguageHoverResultSchema,
  LanguageSymbolsResultSchema,
  LanguageReferencesResultSchema,
  LanguageDiagnosticsEventSchema,
  type CatalogSearchResult,
  type CatalogDiscoveryResult,
  type CatalogProbeVersionResult,
  type HealthCheckResult,
  type ManualGetResult,
  type ShellGenerateResult,
  type ShellParseResult,
  type ShellProgram,
  type RiskAssessment,
  type ProjectGetResult,
  type ProjectListResult,
  type ScriptProject,
  type BookmarkSaveParams,
  type StructuredBookmark,
  type BookmarkListResult,
  type ExportCreateParams,
  type FileExportResult,
  type ClipboardCopyResult,
  type ProjectFileImportResult,
  type ExecutionStartUiParams,
  type ExecutionStartResult,
  type ExecutionEvent,
  type WorkingDirectoryResult,
  type HistoryListResult,
  type SystemProfile,
  type ToolingProfile,
  type ShellCheckResult,
  type ShfmtResult,
  type AiEndpointParams,
  type AiModelParams,
  type AiRequest,
  type AiModelsResult,
  type AiConnectionResult,
  type AiProposalResult,
  type CredentialStatus,
  type LanguageOpenResult,
  type LanguageCompletionResult,
  type LanguageHoverResult,
  type LanguageDiagnosticsEvent,
  type LanguageSymbolsResult,
  type LanguageReferencesResult
} from "@cmd-ide/contracts";

const HEALTH_CHANNEL = "cmd-ide:health-check";
const SYSTEM_CHANNEL = "cmd-ide:system-detect";
const TOOLING_CHANNEL = "cmd-ide:tooling-detect";
const SHELLCHECK_CHANNEL = "cmd-ide:tooling-shellcheck";
const SHFMT_CHANNEL = "cmd-ide:tooling-shfmt";
const AI_MODELS_CHANNEL = "cmd-ide:ai-models";
const AI_TEST_CHANNEL = "cmd-ide:ai-test";
const AI_PROBE_CHANNEL = "cmd-ide:ai-probe";
const AI_PROPOSE_CHANNEL = "cmd-ide:ai-propose";
const CREDENTIAL_STATUS_CHANNEL = "cmd-ide:credential-status";
const CREDENTIAL_STORE_CHANNEL = "cmd-ide:credential-store";
const CREDENTIAL_DELETE_CHANNEL = "cmd-ide:credential-delete";
const LANGUAGE_OPEN_CHANNEL = "cmd-ide:language-open";
const LANGUAGE_CHANGE_CHANNEL = "cmd-ide:language-change";
const LANGUAGE_CLOSE_CHANNEL = "cmd-ide:language-close";
const LANGUAGE_COMPLETION_CHANNEL = "cmd-ide:language-completion";
const LANGUAGE_HOVER_CHANNEL = "cmd-ide:language-hover";
const LANGUAGE_SYMBOLS_CHANNEL = "cmd-ide:language-symbols";
const LANGUAGE_REFERENCES_CHANNEL = "cmd-ide:language-references";
const LANGUAGE_DIAGNOSTICS_CHANNEL = "cmd-ide:language-diagnostics";
const CATALOG_CHANNEL = "cmd-ide:catalog-search";
const CATALOG_DISCOVER_CHANNEL = "cmd-ide:catalog-discover";
const MANUAL_CHANNEL = "cmd-ide:manual-get";
const SHELL_GENERATE_CHANNEL = "cmd-ide:shell-generate";
const SHELL_PARSE_CHANNEL = "cmd-ide:shell-parse";
const CATALOG_VERSION_CHANNEL = "cmd-ide:catalog-probe-version";
const RISK_CHANNEL = "cmd-ide:risk-assess";
const PROJECT_SAVE_CHANNEL = "cmd-ide:project-save";
const PROJECT_GET_CHANNEL = "cmd-ide:project-get";
const PROJECT_LIST_CHANNEL = "cmd-ide:project-list";
const BOOKMARK_SAVE_CHANNEL = "cmd-ide:bookmark-save";
const BOOKMARK_LIST_CHANNEL = "cmd-ide:bookmark-list";
const BOOKMARK_DELETE_CHANNEL = "cmd-ide:bookmark-delete";
const FILE_EXPORT_CHANNEL = "cmd-ide:file-export";
const CLIPBOARD_COPY_CHANNEL = "cmd-ide:clipboard-copy-command";
const PROJECT_FILE_IMPORT_CHANNEL = "cmd-ide:project-file-import";
const WORKING_DIRECTORY_CHANNEL = "cmd-ide:working-directory";
const EXECUTION_START_CHANNEL = "cmd-ide:execution-start";
const EXECUTION_INPUT_CHANNEL = "cmd-ide:execution-input";
const EXECUTION_RESIZE_CHANNEL = "cmd-ide:execution-resize";
const EXECUTION_CANCEL_CHANNEL = "cmd-ide:execution-cancel";
const EXECUTION_EVENT_CHANNEL = "cmd-ide:execution-event";
const HISTORY_LIST_CHANNEL = "cmd-ide:history-list";

const commandIdeApi = Object.freeze({
  health: Object.freeze({
    check: async (): Promise<HealthCheckResult> => {
      const result: unknown = await ipcRenderer.invoke(HEALTH_CHANNEL, {});
      return HealthCheckResultSchema.parse(result);
    }
  }),
  system: Object.freeze({
    detect: async (): Promise<SystemProfile> => {
      const result: unknown = await ipcRenderer.invoke(SYSTEM_CHANNEL, {});
      return SystemProfileSchema.parse(result);
    }
  }),
  tooling: Object.freeze({
    detect: async (): Promise<ToolingProfile> => {
      const result: unknown = await ipcRenderer.invoke(TOOLING_CHANNEL, {});
      return ToolingProfileSchema.parse(result);
    },
    shellcheck: async (source: string): Promise<ShellCheckResult> => {
      const params = ToolSourceParamsSchema.parse({ source });
      const result: unknown = await ipcRenderer.invoke(SHELLCHECK_CHANNEL, params);
      return ShellCheckResultSchema.parse(result);
    },
    shfmt: async (source: string): Promise<ShfmtResult> => {
      const params = ToolSourceParamsSchema.parse({ source });
      const result: unknown = await ipcRenderer.invoke(SHFMT_CHANNEL, params);
      return ShfmtResultSchema.parse(result);
    }
  }),
  ai: Object.freeze({
    models: async (input: AiEndpointParams): Promise<AiModelsResult> => {
      const params = AiEndpointParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(AI_MODELS_CHANNEL, params);
      return AiModelsResultSchema.parse(result);
    },
    test: async (input: AiEndpointParams): Promise<AiConnectionResult> => {
      const params = AiEndpointParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(AI_TEST_CHANNEL, params);
      return AiConnectionResultSchema.parse(result);
    },
    probe: async (input: AiModelParams): Promise<AiConnectionResult> => {
      const params = AiModelParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(AI_PROBE_CHANNEL, params);
      return AiConnectionResultSchema.parse(result);
    },
    propose: async (input: AiRequest): Promise<AiProposalResult> => {
      const params = AiRequestSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(AI_PROPOSE_CHANNEL, params);
      return AiProposalResultSchema.parse(result);
    }
  }),
  credentials: Object.freeze({
    status: async (): Promise<CredentialStatus> => {
      const params = CredentialProviderParamsSchema.parse({ provider: "openai" });
      const result: unknown = await ipcRenderer.invoke(CREDENTIAL_STATUS_CHANNEL, params);
      return CredentialStatusSchema.parse(result);
    },
    store: async (credential: string): Promise<CredentialStatus> => {
      const params = CredentialStoreParamsSchema.parse({ provider: "openai", credential });
      const result: unknown = await ipcRenderer.invoke(CREDENTIAL_STORE_CHANNEL, params);
      return CredentialStatusSchema.parse(result);
    },
    delete: async (): Promise<CredentialStatus> => {
      const params = CredentialProviderParamsSchema.parse({ provider: "openai" });
      const result: unknown = await ipcRenderer.invoke(CREDENTIAL_DELETE_CHANNEL, params);
      return CredentialStatusSchema.parse(result);
    }
  }),
  language: Object.freeze({
    open: async (source: string): Promise<LanguageOpenResult> => {
      const params = LanguageOpenParamsSchema.parse({ source });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_OPEN_CHANNEL, params);
      return LanguageOpenResultSchema.parse(result);
    },
    change: async (sessionId: string, source: string, version: number): Promise<void> => {
      const params = LanguageChangeParamsSchema.parse({ sessionId, source, version });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_CHANGE_CHANNEL, params);
      AcceptedResultSchema.parse(result);
    },
    close: async (sessionId: string): Promise<void> => {
      const params = LanguageCloseParamsSchema.parse({ sessionId });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_CLOSE_CHANNEL, params);
      AcceptedResultSchema.parse(result);
    },
    completion: async (
      sessionId: string,
      line: number,
      character: number
    ): Promise<LanguageCompletionResult> => {
      const params = LanguagePositionParamsSchema.parse({ sessionId, line, character });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_COMPLETION_CHANNEL, params);
      return LanguageCompletionResultSchema.parse(result);
    },
    hover: async (
      sessionId: string,
      line: number,
      character: number
    ): Promise<LanguageHoverResult> => {
      const params = LanguagePositionParamsSchema.parse({ sessionId, line, character });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_HOVER_CHANNEL, params);
      return LanguageHoverResultSchema.parse(result);
    },
    symbols: async (sessionId: string): Promise<LanguageSymbolsResult> => {
      const params = LanguageCloseParamsSchema.parse({ sessionId });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_SYMBOLS_CHANNEL, params);
      return LanguageSymbolsResultSchema.parse(result);
    },
    references: async (
      sessionId: string,
      line: number,
      character: number
    ): Promise<LanguageReferencesResult> => {
      const params = LanguagePositionParamsSchema.parse({ sessionId, line, character });
      const result: unknown = await ipcRenderer.invoke(LANGUAGE_REFERENCES_CHANNEL, params);
      return LanguageReferencesResultSchema.parse(result);
    },
    onDiagnostics: (listener: (event: LanguageDiagnosticsEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, rawEvent: unknown) => {
        listener(LanguageDiagnosticsEventSchema.parse(rawEvent));
      };
      ipcRenderer.on(LANGUAGE_DIAGNOSTICS_CHANNEL, wrapped);
      return () => ipcRenderer.removeListener(LANGUAGE_DIAGNOSTICS_CHANNEL, wrapped);
    }
  }),
  catalog: Object.freeze({
    search: async (query: string, limit = 50): Promise<CatalogSearchResult> => {
      const params = CatalogSearchParamsSchema.parse({ query, limit });
      const result: unknown = await ipcRenderer.invoke(CATALOG_CHANNEL, params);
      return CatalogSearchResultSchema.parse(result);
    },
    discover: async (limit = 5000, refresh = false): Promise<CatalogDiscoveryResult> => {
      const params = CatalogDiscoverParamsSchema.parse({ limit, refresh });
      const result: unknown = await ipcRenderer.invoke(CATALOG_DISCOVER_CHANNEL, params);
      return CatalogDiscoveryResultSchema.parse(result);
    },
    probeVersion: async (commandId: string, force = false): Promise<CatalogProbeVersionResult> => {
      const params = CatalogProbeVersionParamsSchema.parse({ commandId, force });
      const result: unknown = await ipcRenderer.invoke(CATALOG_VERSION_CHANNEL, params);
      return CatalogProbeVersionResultSchema.parse(result);
    }
  }),
  manual: Object.freeze({
    get: async (commandId: string): Promise<ManualGetResult> => {
      const params = ManualGetParamsSchema.parse({ commandId });
      const result: unknown = await ipcRenderer.invoke(MANUAL_CHANNEL, params);
      return ManualGetResultSchema.parse(result);
    }
  }),
  shell: Object.freeze({
    generate: async (program: ShellProgram): Promise<ShellGenerateResult> => {
      const params = ShellGenerateParamsSchema.parse({ program });
      const result: unknown = await ipcRenderer.invoke(SHELL_GENERATE_CHANNEL, params);
      return ShellGenerateResultSchema.parse(result);
    },
    parse: async (source: string): Promise<ShellParseResult> => {
      const params = ShellParseParamsSchema.parse({ source });
      const result: unknown = await ipcRenderer.invoke(SHELL_PARSE_CHANNEL, params);
      return ShellParseResultSchema.parse(result);
    }
  }),
  risk: Object.freeze({
    assess: async (program: ShellProgram): Promise<RiskAssessment> => {
      const params = RiskAssessParamsSchema.parse({ program });
      const result: unknown = await ipcRenderer.invoke(RISK_CHANNEL, params);
      return RiskAssessmentSchema.parse(result);
    }
  }),
  projects: Object.freeze({
    save: async (project: ScriptProject): Promise<ScriptProject> => {
      const params = ProjectSaveParamsSchema.parse({ project });
      const result: unknown = await ipcRenderer.invoke(PROJECT_SAVE_CHANNEL, params);
      return ProjectSaveResultSchema.parse(result).project;
    },
    get: async (projectId: string): Promise<ProjectGetResult> => {
      const params = ProjectGetParamsSchema.parse({ projectId });
      const result: unknown = await ipcRenderer.invoke(PROJECT_GET_CHANNEL, params);
      return ProjectGetResultSchema.parse(result);
    },
    list: async (limit = 50): Promise<ProjectListResult> => {
      const params = ProjectListParamsSchema.parse({ limit });
      const result: unknown = await ipcRenderer.invoke(PROJECT_LIST_CHANNEL, params);
      return ProjectListResultSchema.parse(result);
    }
  }),
  bookmarks: Object.freeze({
    save: async (input: BookmarkSaveParams): Promise<StructuredBookmark> => {
      const params = BookmarkSaveParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(BOOKMARK_SAVE_CHANNEL, params);
      return BookmarkSaveResultSchema.parse({ bookmark: result }).bookmark;
    },
    list: async (limit = 50): Promise<BookmarkListResult> => {
      const params = BookmarkListParamsSchema.parse({ limit });
      const result: unknown = await ipcRenderer.invoke(BOOKMARK_LIST_CHANNEL, params);
      return BookmarkListResultSchema.parse(result);
    },
    delete: async (bookmarkId: string): Promise<boolean> => {
      const params = BookmarkDeleteParamsSchema.parse({ bookmarkId });
      const result: unknown = await ipcRenderer.invoke(BOOKMARK_DELETE_CHANNEL, params);
      return BookmarkDeleteResultSchema.parse(result).deleted;
    }
  }),
  files: Object.freeze({
    export: async (input: ExportCreateParams): Promise<FileExportResult> => {
      const params = ExportCreateParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(FILE_EXPORT_CHANNEL, params);
      return FileExportResultSchema.parse(result);
    },
    importProject: async (): Promise<ProjectFileImportResult> => {
      const params = ProjectFileImportParamsSchema.parse({});
      const result: unknown = await ipcRenderer.invoke(PROJECT_FILE_IMPORT_CHANNEL, params);
      return ProjectFileImportResultSchema.parse(result);
    }
  }),
  clipboard: Object.freeze({
    copyCommand: async (program: ShellProgram): Promise<ClipboardCopyResult> => {
      const params = ClipboardCopyParamsSchema.parse({ program });
      const result: unknown = await ipcRenderer.invoke(CLIPBOARD_COPY_CHANNEL, params);
      return ClipboardCopyResultSchema.parse(result);
    }
  }),
  execution: Object.freeze({
    chooseWorkingDirectory: async (): Promise<WorkingDirectoryResult> => {
      const result: unknown = await ipcRenderer.invoke(WORKING_DIRECTORY_CHANNEL, {});
      return WorkingDirectoryResultSchema.parse(result);
    },
    start: async (input: ExecutionStartUiParams): Promise<ExecutionStartResult> => {
      const params = ExecutionStartUiParamsSchema.parse(input);
      const result: unknown = await ipcRenderer.invoke(EXECUTION_START_CHANNEL, params);
      return ExecutionStartResultSchema.parse(result);
    },
    input: async (sessionId: string, data: string): Promise<void> => {
      const params = ExecutionInputParamsSchema.parse({ sessionId, data });
      const result: unknown = await ipcRenderer.invoke(EXECUTION_INPUT_CHANNEL, params);
      AcceptedResultSchema.parse(result);
    },
    resize: async (sessionId: string, columns: number, rows: number): Promise<void> => {
      const params = ExecutionResizeParamsSchema.parse({ sessionId, columns, rows });
      const result: unknown = await ipcRenderer.invoke(EXECUTION_RESIZE_CHANNEL, params);
      AcceptedResultSchema.parse(result);
    },
    cancel: async (sessionId: string): Promise<void> => {
      const params = ExecutionCancelParamsSchema.parse({ sessionId });
      const result: unknown = await ipcRenderer.invoke(EXECUTION_CANCEL_CHANNEL, params);
      AcceptedResultSchema.parse(result);
    },
    onEvent: (listener: (event: ExecutionEvent) => void): (() => void) => {
      const wrapped = (_event: Electron.IpcRendererEvent, rawEvent: unknown) => {
        listener(ExecutionEventSchema.parse(rawEvent));
      };
      ipcRenderer.on(EXECUTION_EVENT_CHANNEL, wrapped);
      return () => ipcRenderer.removeListener(EXECUTION_EVENT_CHANNEL, wrapped);
    }
  }),
  history: Object.freeze({
    list: async (limit = 50): Promise<HistoryListResult> => {
      const params = HistoryListParamsSchema.parse({ limit });
      const result: unknown = await ipcRenderer.invoke(HISTORY_LIST_CHANNEL, params);
      return HistoryListResultSchema.parse(result);
    }
  })
});

contextBridge.exposeInMainWorld("commandIde", commandIdeApi);
