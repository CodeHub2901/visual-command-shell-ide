import type { AiConnectionResult, AiEndpointParams, AiModelParams, AiModelsResult, AiProposalResult, AiRequest, BookmarkListResult, BookmarkSaveParams, CatalogDiscoveryResult, CatalogProbeVersionResult, CatalogSearchResult, ClipboardCopyResult, CredentialStatus, ExecutionEvent, ExecutionStartResult, ExecutionStartUiParams, ExportCreateParams, FileExportResult, HealthCheckResult, HistoryListResult, LanguageCompletionResult, LanguageDiagnosticsEvent, LanguageHoverResult, LanguageOpenResult, LanguageReferencesResult, LanguageSymbolsResult, ManualGetResult, ProjectFileImportResult, ProjectGetResult, ProjectListResult, RiskAssessment, ScriptProject, ShellCheckResult, ShellGenerateResult, ShellParseResult, ShellProgram, ShfmtResult, StructuredBookmark, SystemProfile, ToolingProfile, WorkingDirectoryResult } from "@cmd-ide/contracts";

declare global {
  interface Window {
    commandIde: Readonly<{
      health: Readonly<{
        check: () => Promise<HealthCheckResult>;
      }>;
      system: Readonly<{
        detect: () => Promise<SystemProfile>;
      }>;
      tooling: Readonly<{
        detect: () => Promise<ToolingProfile>;
        shellcheck: (source: string) => Promise<ShellCheckResult>;
        shfmt: (source: string) => Promise<ShfmtResult>;
      }>;
      ai: Readonly<{
        models: (input: AiEndpointParams) => Promise<AiModelsResult>;
        test: (input: AiEndpointParams) => Promise<AiConnectionResult>;
        probe: (input: AiModelParams) => Promise<AiConnectionResult>;
        propose: (input: AiRequest) => Promise<AiProposalResult>;
      }>;
      credentials: Readonly<{
        status: () => Promise<CredentialStatus>;
        store: (credential: string) => Promise<CredentialStatus>;
        delete: () => Promise<CredentialStatus>;
      }>;
      language: Readonly<{
        open: (source: string) => Promise<LanguageOpenResult>;
        change: (sessionId: string, source: string, version: number) => Promise<void>;
        close: (sessionId: string) => Promise<void>;
        completion: (sessionId: string, line: number, character: number) => Promise<LanguageCompletionResult>;
        hover: (sessionId: string, line: number, character: number) => Promise<LanguageHoverResult>;
        symbols: (sessionId: string) => Promise<LanguageSymbolsResult>;
        references: (sessionId: string, line: number, character: number) => Promise<LanguageReferencesResult>;
        onDiagnostics: (listener: (event: LanguageDiagnosticsEvent) => void) => () => void;
      }>;
      catalog: Readonly<{
        search: (query: string, limit?: number) => Promise<CatalogSearchResult>;
        discover: (limit?: number, refresh?: boolean) => Promise<CatalogDiscoveryResult>;
        probeVersion: (commandId: string, force?: boolean) => Promise<CatalogProbeVersionResult>;
      }>;
      manual: Readonly<{
        get: (commandId: string) => Promise<ManualGetResult>;
      }>;
      shell: Readonly<{
        generate: (program: ShellProgram) => Promise<ShellGenerateResult>;
        parse: (source: string) => Promise<ShellParseResult>;
      }>;
      risk: Readonly<{
        assess: (program: ShellProgram) => Promise<RiskAssessment>;
      }>;
      projects: Readonly<{
        save: (project: ScriptProject) => Promise<ScriptProject>;
        get: (projectId: string) => Promise<ProjectGetResult>;
        list: (limit?: number) => Promise<ProjectListResult>;
      }>;
      bookmarks: Readonly<{
        save: (input: BookmarkSaveParams) => Promise<StructuredBookmark>;
        list: (limit?: number) => Promise<BookmarkListResult>;
        delete: (bookmarkId: string) => Promise<boolean>;
      }>;
      files: Readonly<{
        export: (input: ExportCreateParams) => Promise<FileExportResult>;
        importProject: () => Promise<ProjectFileImportResult>;
      }>;
      clipboard: Readonly<{
        copyCommand: (program: ShellProgram) => Promise<ClipboardCopyResult>;
      }>;
      execution: Readonly<{
        chooseWorkingDirectory: () => Promise<WorkingDirectoryResult>;
        start: (input: ExecutionStartUiParams) => Promise<ExecutionStartResult>;
        input: (sessionId: string, data: string) => Promise<void>;
        resize: (sessionId: string, columns: number, rows: number) => Promise<void>;
        cancel: (sessionId: string) => Promise<void>;
        onEvent: (listener: (event: ExecutionEvent) => void) => () => void;
      }>;
      history: Readonly<{
        list: (limit?: number) => Promise<HistoryListResult>;
      }>;
    }>;
  }
}

export {};
