import { app, BrowserWindow, clipboard, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  createTranslator,
  resolveSupportedLocale,
  type Translator
} from "../shared/localization.js";
import {
  CATALOG_SEARCH_METHOD,
  CatalogSearchParamsSchema,
  CatalogSearchResultSchema,
  CATALOG_DISCOVER_METHOD,
  CatalogDiscoverParamsSchema,
  CatalogDiscoveryResultSchema,
  CATALOG_PROBE_VERSION_METHOD,
  CatalogProbeVersionParamsSchema,
  CatalogProbeVersionResultSchema,
  HEALTH_CHECK_METHOD,
  HealthCheckParamsSchema,
  HealthCheckResultSchema,
  MANUAL_GET_METHOD,
  ManualGetParamsSchema,
  ManualGetResultSchema,
  SHELL_GENERATE_METHOD,
  ShellGenerateParamsSchema,
  ShellGenerateResultSchema,
  SHELL_PARSE_METHOD,
  ShellParseParamsSchema,
  ShellParseResultSchema,
  RISK_ASSESS_METHOD,
  RiskAssessParamsSchema,
  RiskAssessmentSchema,
  PROJECT_GET_METHOD,
  PROJECT_LIST_METHOD,
  PROJECT_SAVE_METHOD,
  PROJECT_IMPORT_METHOD,
  BOOKMARK_SAVE_METHOD,
  BOOKMARK_LIST_METHOD,
  BOOKMARK_DELETE_METHOD,
  EXPORT_CREATE_METHOD,
  ProjectGetParamsSchema,
  ProjectGetResultSchema,
  ProjectListParamsSchema,
  ProjectListResultSchema,
  ProjectSaveParamsSchema,
  ProjectSaveResultSchema,
  ProjectImportParamsSchema,
  ProjectImportResultSchema,
  BookmarkSaveParamsSchema,
  BookmarkSaveResultSchema,
  BookmarkListParamsSchema,
  BookmarkListResultSchema,
  BookmarkDeleteParamsSchema,
  BookmarkDeleteResultSchema,
  ExportCreateParamsSchema,
  ExportArtifactSchema,
  FileExportResultSchema,
  ClipboardCopyParamsSchema,
  ProjectFileImportParamsSchema,
  ProjectFileImportResultSchema,
  EXECUTION_START_METHOD,
  EXECUTION_INPUT_METHOD,
  EXECUTION_RESIZE_METHOD,
  EXECUTION_CANCEL_METHOD,
  EXECUTION_EVENT_METHOD,
  HISTORY_LIST_METHOD,
  ExecutionStartParamsSchema,
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
  SYSTEM_DETECT_METHOD,
  SystemDetectParamsSchema,
  SystemProfileSchema,
  TOOLING_DETECT_METHOD,
  TOOLING_SHELLCHECK_METHOD,
  TOOLING_SHFMT_METHOD,
  ToolingDetectParamsSchema,
  ToolingProfileSchema,
  ToolSourceParamsSchema,
  ShellCheckResultSchema,
  ShfmtResultSchema,
  AI_MODELS_METHOD,
  AI_TEST_METHOD,
  AI_PROBE_METHOD,
  AI_PROPOSE_METHOD,
  AiEndpointParamsSchema,
  AiModelParamsSchema,
  AiRequestSchema,
  AiModelsResultSchema,
  AiConnectionResultSchema,
  AiProposalResultSchema,
  CREDENTIAL_STATUS_METHOD,
  CREDENTIAL_STORE_METHOD,
  CREDENTIAL_DELETE_METHOD,
  CredentialProviderParamsSchema,
  CredentialStoreParamsSchema,
  CredentialStatusSchema,
  LANGUAGE_OPEN_METHOD,
  LANGUAGE_CHANGE_METHOD,
  LANGUAGE_CLOSE_METHOD,
  LANGUAGE_COMPLETION_METHOD,
  LANGUAGE_HOVER_METHOD,
  LANGUAGE_SYMBOLS_METHOD,
  LANGUAGE_REFERENCES_METHOD,
  LANGUAGE_DIAGNOSTICS_METHOD,
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
  type RiskAssessment,
  type ProjectGetResult,
  type ProjectListResult,
  type StructuredBookmark,
  type BookmarkListResult,
  type BookmarkDeleteResult,
  type ScriptProject,
  type FileExportResult,
  type ClipboardCopyResult,
  type ProjectFileImportResult,
  type ExecutionStartResult,
  type WorkingDirectoryResult,
  type HistoryListResult,
  type JsonRpcNotification,
  type SystemProfile,
  type ToolingProfile,
  type ShellCheckResult,
  type ShfmtResult,
  type AiModelsResult,
  type AiConnectionResult,
  type AiProposalResult,
  type CredentialStatus,
  type LanguageOpenResult,
  type LanguageCompletionResult,
  type LanguageHoverResult,
  type LanguageSymbolsResult,
  type LanguageReferencesResult
} from "@cmd-ide/contracts";
import { WorkerClient } from "./protocol/worker-client";
import { WorkerSupervisor } from "./protocol/worker-supervisor";
import { secureWebPreferences } from "./security";
import {
  bundledBashLanguageServerEnvironment,
  resolveJavaExecutable,
  resolveWorkerJar
} from "./worker-path";
import { atomicWriteUtf8, readBoundedUtf8 } from "./file-operations";
import { copyGeneratedCommand } from "./clipboard-operations";

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
let mainWindow: BrowserWindow | null = null;
let worker: WorkerSupervisor | null = null;
const workingDirectories = new Map<string, string>();

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#10141d",
    show: false,
    webPreferences: secureWebPreferences(
      path.join(__dirname, "..", "preload", "index.js"),
      app.isPackaged
    )
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.webContents.once("did-finish-load", () => {
    const smokeRequested = app.isPackaged
      ? process.env.CMD_IDE_PACKAGED_SMOKE_TEST === "1"
      : process.env.CMD_IDE_SMOKE_TEST === "1";
    if (smokeRequested) {
      void verifyRendererEditors(window).catch((error: unknown) => {
        process.stderr.write(`[smoke] editor verification failed: ${String(error)}\n`);
        app.exit(1);
      });
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const devServerUrl = process.env.CMD_IDE_DEV_SERVER_URL;
  if (devServerUrl !== undefined) {
    const url = new URL(devServerUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("Development server must use an HTTP loopback address");
    }
    void window.loadURL(url.toString());
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  }

  return window;
}

async function verifyRendererEditors(window: BrowserWindow): Promise<void> {
  await waitForRendererCondition(window, "document.querySelector('.guided-builder .react-flow__node') !== null");
  await waitForRendererCondition(
    window,
    "document.querySelector('button[aria-label=\"Copy exact generated command\"]')?.disabled === false"
  );
  const copied = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Copy exact generated command"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()
  `));
  if (!copied) throw new Error("Copy command action was not available");
  await waitForRendererCondition(
    window,
    "[...document.querySelectorAll('.project-actions [role=\"status\"]')].some((node) => node.textContent?.includes('Copied exact command'))"
  );
  process.stderr.write("[smoke] exact generated command clipboard action validated\n");
  const commentAdded = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.guided-builder .shell-canvas-toolbar button')]
        .find((candidate) => candidate.textContent?.trim() === 'Add comment');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!commentAdded) throw new Error("Semantic Add comment action was not available");
  await waitForRendererCondition(
    window,
    "document.querySelectorAll('.guided-builder .react-flow__node').length >= 2"
  );
  await waitForRendererCondition(
    window,
    "document.querySelector('.guided-builder .generated-preview code')?.textContent?.includes('# Add documentation') === true"
  );
  process.stderr.write("[smoke] semantic React Flow mutation validated\n");
  const switched = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Compact');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!switched) throw new Error("Compact mode button was not available");
  await waitForRendererCondition(window, "document.querySelector('.compact-editor .monaco-editor') !== null");
  await waitForRendererCondition(
    window,
    "document.querySelector('.language-server-status.connected')?.textContent?.includes('connected') === true"
  );
  process.stderr.write("[smoke] bundled Bash Language Server session validated\n");
  const shellCheckRequested = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.editor-tool-actions button')]
        .find((candidate) => candidate.textContent?.trim() === 'Run ShellCheck');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!shellCheckRequested) throw new Error("Explicit ShellCheck action was not available");
  await waitForRendererCondition(
    window,
    "document.querySelector('.editor-tool-actions [role=\"status\"]')?.textContent?.length > 0"
  );
  process.stderr.write("[smoke] explicit optional-tool analysis boundary validated\n");
  await waitForRendererCondition(window, "document.querySelectorAll('.compact-editor .react-flow__node').length >= 2");
  await waitForRendererCondition(window, "document.querySelector('.terminal-panel .xterm') !== null");
  const openedHistory = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="History"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedHistory) throw new Error("History workspace button was not available");
  await waitForRendererCondition(window, "document.querySelector('.history-view') !== null");
  process.stderr.write("[smoke] local xterm and redacted History workspace validated\n");
  const openedBookmarks = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Bookmarks"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedBookmarks) throw new Error("Bookmarks workspace button was not available");
  await waitForRendererCondition(window, "document.querySelector('.bookmarks-view') !== null");
  const bookmarkSaved = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.bookmark-create input');
      const button = document.querySelector('.bookmark-create button');
      if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Smoke structured selection');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.setTimeout(() => button.click(), 0);
      return true;
    })()
  `));
  if (!bookmarkSaved) throw new Error("Structured bookmark controls were unavailable");
  await waitForRendererCondition(
    window,
    "[...document.querySelectorAll('.bookmark-list strong')].some((node) => node.textContent === 'Smoke structured selection')"
  );
  await window.webContents.executeJavaScript(`
    (async () => {
      const result = await window.commandIde.bookmarks.list(100);
      const matches = result.bookmarks.filter((bookmark) => bookmark.name === 'Smoke structured selection');
      await Promise.all(matches.map((bookmark) => window.commandIde.bookmarks.delete(bookmark.bookmarkId)));
    })()
  `);
  process.stderr.write("[smoke] structured bookmark persistence validated\n");
  const openedAi = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="AI Assistant"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedAi) throw new Error("AI Assistant workspace button was not available");
  await waitForRendererCondition(window, "document.querySelector('.ai-view') !== null");
  await waitForRendererCondition(
    window,
    "document.querySelector('.ai-configuration select') !== null || [...document.querySelectorAll('.ai-status')].some((node) => !node.textContent?.includes('Looking for'))"
  );
  process.stderr.write("[smoke] proposal-only Ollama review workspace validated\n");
  const selectedOpenAi = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector('.ai-configuration > label select');
      if (!(select instanceof HTMLSelectElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'openai');
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()
  `));
  if (!selectedOpenAi) throw new Error("OpenAI provider selection was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.ai-credentials input[type=\"password\"]')?.value === ''"
  );
  await waitForRendererCondition(
    window,
    "[...document.querySelectorAll('.ai-configuration option')].some((option) => option.value === 'gpt-5.6')"
  );
  const credentialMetadataOnly = Boolean(await window.webContents.executeJavaScript(`
    (async () => {
      const status = await window.commandIde.credentials.status();
      return status.provider === 'openai'
        && typeof status.configured === 'boolean'
        && !Object.hasOwn(status, 'credential');
    })()
  `));
  if (!credentialMetadataOnly) throw new Error("Credential bridge exposed more than status metadata");
  process.stderr.write("[smoke] OpenAI write-only credential and curated-model workspace validated\n");
  const openedSettings = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Settings"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedSettings) throw new Error("Settings workspace button was not available");
  await waitForRendererCondition(window, "document.querySelectorAll('.tooling-list > section').length === 3");
  await waitForRendererCondition(
    window,
    "document.querySelector('.tool-status.bundled')?.textContent?.trim() === 'Bundled'"
  );
  process.stderr.write("[smoke] passive local tooling detection validated\n");
  const searchFocused = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));
      return document.activeElement?.matches('.search-label input') === true;
    })()
  `));
  if (!searchFocused) throw new Error("Catalog search keyboard focus shortcut failed");
  await window.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: '4',
      altKey: true,
      bubbles: true,
      cancelable: true
    }))
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.ai-view') !== null && document.activeElement?.id === 'main-workspace'"
  );
  process.stderr.write("[smoke] keyboard shortcuts and workspace focus validated\n");
  const terminalAvailable = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.terminal-toggle');
      if (!(button instanceof HTMLButtonElement)) return false;
      if (button.getAttribute('aria-expanded') === 'false') button.click();
      return true;
    })()
  `));
  if (!terminalAvailable) throw new Error("Terminal collapse control was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.terminal-toggle')?.getAttribute('aria-expanded') === 'true'"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('.terminal-toggle')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.terminal-toggle')?.getAttribute('aria-expanded') === 'false'"
      + " && document.querySelector('.workspace')?.classList.contains('terminal-collapsed') === true"
      + " && document.querySelector('.terminal-workspace')?.hasAttribute('hidden') === true"
      + " && sessionStorage.getItem('command-ide:terminal-layout') === 'collapsed'"
  );
  await window.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: 't',
      altKey: true,
      bubbles: true,
      cancelable: true
    }))
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.terminal-toggle')?.getAttribute('aria-expanded') === 'true'"
      + " && document.querySelector('.terminal-workspace')?.hasAttribute('hidden') === false"
      + " && sessionStorage.getItem('command-ide:terminal-layout') === 'expanded'"
  );
  process.stderr.write("[smoke] collapsible terminal layout and session state validated\n");
  process.stderr.write("[smoke] React Flow and local Monaco editors validated\n");
  await measureInteractiveCanvas(window);
  app.quit();
}

async function measureInteractiveCanvas(window: BrowserWindow): Promise<void> {
  const renderStarted = performance.now();
  await window.loadFile(
    path.join(app.getAppPath(), "dist", "renderer", "index.html"),
    { query: { performanceProbe: "canvas" } }
  );
  await waitForRendererCondition(
    window,
    "document.querySelector('[data-performance-probe=\"canvas\"]') !== null"
      + " && document.querySelectorAll('.canvas-performance-probe .react-flow__node').length === 1000",
    15_000
  );
  const renderMs = performance.now() - renderStarted;
  const interaction = await window.webContents.executeJavaScript(`
    (async () => {
      const pane = document.querySelector('.canvas-performance-probe .react-flow__pane');
      const viewport = document.querySelector('.canvas-performance-probe .react-flow__viewport');
      if (!(pane instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
        throw new Error('React Flow performance surface was unavailable');
      }
      const frameUntilChanged = async (before) => {
        const deadline = performance.now() + 1000;
        while (performance.now() < deadline) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (viewport.style.transform !== before) return;
        }
        throw new Error('React Flow zoom interaction did not update the viewport');
      };
      const bounds = pane.getBoundingClientRect();
      const samples = [];
      for (let index = 0; index < 20; index += 1) {
        const before = viewport.style.transform;
        const started = performance.now();
        pane.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
          deltaY: index % 2 === 0 ? -120 : 120,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL
        }));
        await frameUntilChanged(before);
        samples.push(performance.now() - started);
      }
      samples.sort((left, right) => left - right);
      return {
        p95Ms: samples[Math.ceil(samples.length * 0.95) - 1],
        samples
      };
    })()
  `) as { p95Ms: number; samples: number[] };
  if (renderMs >= 15_000) {
    throw new Error(`1,000-node React Flow render exceeded 15000 ms: ${renderMs.toFixed(1)} ms`);
  }
  if (!Number.isFinite(interaction.p95Ms) || interaction.p95Ms >= 500) {
    throw new Error(
      `1,000-node React Flow zoom p95 exceeded 500 ms: ${String(interaction.p95Ms)} ms`
    );
  }
  process.stderr.write(
    `[performance] Interactive React Flow large-canvas: render ${renderMs.toFixed(1)} ms, `
      + `zoom p95 ${interaction.p95Ms.toFixed(1)} ms (1,000 nodes).\n`
  );
}

async function waitForRendererCondition(
  window: BrowserWindow,
  expression: string,
  timeoutMs = 12_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.isDestroyed()) throw new Error("Renderer window closed during editor verification");
    const matched = Boolean(await window.webContents.executeJavaScript(`Boolean(${expression})`));
    if (matched) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Renderer condition timed out: ${expression}`);
}

function startWorker(): WorkerSupervisor {
  const workerJar = resolveWorkerJar();
  if (!fs.existsSync(workerJar)) {
    throw new Error(`Java worker JAR does not exist: ${workerJar}`);
  }

  return new WorkerSupervisor(() => {
    const client = new WorkerClient({
      javaExecutable: resolveJavaExecutable(),
      workerJar,
      environment: {
        CMD_IDE_DATA_DIR: process.env.CMD_IDE_DATA_DIR ?? app.getPath("userData"),
        ...bundledBashLanguageServerEnvironment(app.getAppPath(), process.execPath)
      }
    });
    client.on("workerLog", (message: string) => process.stderr.write(`[worker] ${message}`));
    client.on("workerError", (error: Error) => process.stderr.write(`[worker-error] ${error.message}\n`));
    client.on("notification", (notification: JsonRpcNotification) => {
      try {
        if (notification.method === EXECUTION_EVENT_METHOD) {
          const event = ExecutionEventSchema.parse(notification.params);
          if (mainWindow !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(EXECUTION_EVENT_CHANNEL, event);
          }
          return;
        }
        if (notification.method === LANGUAGE_DIAGNOSTICS_METHOD) {
          const event = LanguageDiagnosticsEventSchema.parse(notification.params);
          if (mainWindow !== null && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(LANGUAGE_DIAGNOSTICS_CHANNEL, event);
          }
          return;
        }
        process.stderr.write(`[worker-error] Unexpected notification method: ${notification.method}\n`);
      } catch (error: unknown) {
        process.stderr.write(`[worker-error] Invalid worker notification: ${String(error)}\n`);
      }
    });
    return client;
  });
}

function registerIpc(translator: Translator): void {
  const { t } = translator;
  ipcMain.handle(HEALTH_CHANNEL, async (_event, rawParams: unknown): Promise<HealthCheckResult> => {
    if (process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write("[smoke] renderer requested worker health\n");
    }
    const params = HealthCheckParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(HEALTH_CHECK_METHOD, params);
    const validated = HealthCheckResultSchema.parse(result);
    return validated;
  });

  ipcMain.handle(SYSTEM_CHANNEL, async (_event, rawParams: unknown): Promise<SystemProfile> => {
    const params = SystemDetectParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(SYSTEM_DETECT_METHOD, params);
    const validated = SystemProfileSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write("[smoke] system profile validated\n");
    }
    return validated;
  });

  ipcMain.handle(TOOLING_CHANNEL, async (_event, rawParams: unknown): Promise<ToolingProfile> => {
    const params = ToolingDetectParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return ToolingProfileSchema.parse(await worker.request<unknown>(TOOLING_DETECT_METHOD, params));
  });

  ipcMain.handle(SHELLCHECK_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<ShellCheckResult> => {
    const params = ToolSourceParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return ShellCheckResultSchema.parse(
      await worker.request<unknown>(TOOLING_SHELLCHECK_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(SHFMT_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<ShfmtResult> => {
    const params = ToolSourceParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return ShfmtResultSchema.parse(
      await worker.request<unknown>(TOOLING_SHFMT_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(AI_MODELS_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<AiModelsResult> => {
    const params = AiEndpointParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = AiModelsResultSchema.parse(
      await worker.request<unknown>(AI_MODELS_METHOD, params, { timeoutMs: 5_000 })
    );
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] ${params.provider} model boundary returned ${result.status}\n`);
    }
    return result;
  });

  ipcMain.handle(AI_TEST_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<AiConnectionResult> => {
    const params = AiEndpointParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AiConnectionResultSchema.parse(
      await worker.request<unknown>(AI_TEST_METHOD, params, { timeoutMs: 5_000 })
    );
  });

  ipcMain.handle(AI_PROBE_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<AiConnectionResult> => {
    const params = AiModelParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AiConnectionResultSchema.parse(
      await worker.request<unknown>(AI_PROBE_METHOD, params, { timeoutMs: 40_000 })
    );
  });

  ipcMain.handle(AI_PROPOSE_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<AiProposalResult> => {
    const params = AiRequestSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AiProposalResultSchema.parse(
      await worker.request<unknown>(AI_PROPOSE_METHOD, params, { timeoutMs: 70_000 })
    );
  });

  ipcMain.handle(CREDENTIAL_STATUS_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<CredentialStatus> => {
    const params = CredentialProviderParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return CredentialStatusSchema.parse(
      await worker.request<unknown>(CREDENTIAL_STATUS_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(CREDENTIAL_STORE_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<CredentialStatus> => {
    const params = CredentialStoreParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return CredentialStatusSchema.parse(
      await worker.request<unknown>(CREDENTIAL_STORE_METHOD, params, { timeoutMs: 10_000 })
    );
  });

  ipcMain.handle(CREDENTIAL_DELETE_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<CredentialStatus> => {
    const params = CredentialProviderParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return CredentialStatusSchema.parse(
      await worker.request<unknown>(CREDENTIAL_DELETE_METHOD, params, { timeoutMs: 10_000 })
    );
  });

  ipcMain.handle(LANGUAGE_OPEN_CHANNEL, async (_event, rawParams: unknown): Promise<LanguageOpenResult> => {
    const params = LanguageOpenParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return LanguageOpenResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_OPEN_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_CHANGE_CHANNEL, async (_event, rawParams: unknown): Promise<{ accepted: true }> => {
    const params = LanguageChangeParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AcceptedResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_CHANGE_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_CLOSE_CHANNEL, async (_event, rawParams: unknown): Promise<{ accepted: true }> => {
    const params = LanguageCloseParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AcceptedResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_CLOSE_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_COMPLETION_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<LanguageCompletionResult> => {
    const params = LanguagePositionParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return LanguageCompletionResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_COMPLETION_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_HOVER_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<LanguageHoverResult> => {
    const params = LanguagePositionParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return LanguageHoverResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_HOVER_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_SYMBOLS_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<LanguageSymbolsResult> => {
    const params = LanguageCloseParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return LanguageSymbolsResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_SYMBOLS_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(LANGUAGE_REFERENCES_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<LanguageReferencesResult> => {
    const params = LanguagePositionParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return LanguageReferencesResultSchema.parse(
      await worker.request<unknown>(LANGUAGE_REFERENCES_METHOD, params, { timeoutMs: 7_000 })
    );
  });

  ipcMain.handle(CATALOG_CHANNEL, async (_event, rawParams: unknown): Promise<CatalogSearchResult> => {
    const params = CatalogSearchParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(CATALOG_SEARCH_METHOD, params);
    const validated = CatalogSearchResultSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write("[smoke] offline catalog validated\n");
    }
    return validated;
  });

  ipcMain.handle(CATALOG_DISCOVER_CHANNEL, async (_event, rawParams: unknown): Promise<CatalogDiscoveryResult> => {
    const params = CatalogDiscoverParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(CATALOG_DISCOVER_METHOD, params, { timeoutMs: 8_000 });
    const validated = CatalogDiscoveryResultSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] discovered ${validated.total} PATH executables\n`);
    }
    return validated;
  });

  ipcMain.handle(MANUAL_CHANNEL, async (_event, rawParams: unknown): Promise<ManualGetResult> => {
    const params = ManualGetParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(MANUAL_GET_METHOD, params, { timeoutMs: 8_000 });
    const validated = ManualGetResultSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] ${validated.source} manual validated\n`);
      if (validated.tldr !== null) {
        process.stderr.write(`[smoke] tldr ${validated.tldr.attribution.license} attribution validated\n`);
      }
    }
    return validated;
  });

  ipcMain.handle(SHELL_GENERATE_CHANNEL, async (_event, rawParams: unknown): Promise<ShellGenerateResult> => {
    const params = ShellGenerateParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(SHELL_GENERATE_METHOD, params);
    const validated = ShellGenerateResultSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] generated ${validated.script}\n`);
    }
    return validated;
  });

  ipcMain.handle(SHELL_PARSE_CHANNEL, async (_event, rawParams: unknown): Promise<ShellParseResult> => {
    const params = ShellParseParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(SHELL_PARSE_METHOD, params);
    const validated = ShellParseResultSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] parsed ${validated.sourceSpans.length} shell nodes\n`);
    }
    return validated;
  });

  ipcMain.handle(RISK_CHANNEL, async (_event, rawParams: unknown): Promise<RiskAssessment> => {
    const params = RiskAssessParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(RISK_ASSESS_METHOD, params);
    const validated = RiskAssessmentSchema.parse(result);
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] ${validated.level} risk hash ${validated.reviewHash}\n`);
    }
    return validated;
  });

  ipcMain.handle(CATALOG_VERSION_CHANNEL, async (_event, rawParams: unknown): Promise<CatalogProbeVersionResult> => {
    const params = CatalogProbeVersionParamsSchema.parse(rawParams);
    if (worker === null) {
      throw new Error(t("error.workerUnavailable"));
    }
    const result = await worker.request<unknown>(CATALOG_PROBE_VERSION_METHOD, params, { timeoutMs: 5_000 });
    return CatalogProbeVersionResultSchema.parse(result);
  });

  ipcMain.handle(PROJECT_SAVE_CHANNEL, async (_event, rawParams: unknown): Promise<{ project: ScriptProject }> => {
    const params = ProjectSaveParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = await worker.request<unknown>(PROJECT_SAVE_METHOD, params);
    return ProjectSaveResultSchema.parse(result);
  });

  ipcMain.handle(PROJECT_GET_CHANNEL, async (_event, rawParams: unknown): Promise<ProjectGetResult> => {
    const params = ProjectGetParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = await worker.request<unknown>(PROJECT_GET_METHOD, params);
    return ProjectGetResultSchema.parse(result);
  });

  ipcMain.handle(PROJECT_LIST_CHANNEL, async (_event, rawParams: unknown): Promise<ProjectListResult> => {
    const params = ProjectListParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = await worker.request<unknown>(PROJECT_LIST_METHOD, params);
    return ProjectListResultSchema.parse(result);
  });

  ipcMain.handle(BOOKMARK_SAVE_CHANNEL, async (_event, rawParams: unknown): Promise<StructuredBookmark> => {
    const params = BookmarkSaveParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = await worker.request<unknown>(BOOKMARK_SAVE_METHOD, params);
    return BookmarkSaveResultSchema.parse(result).bookmark;
  });

  ipcMain.handle(BOOKMARK_LIST_CHANNEL, async (_event, rawParams: unknown): Promise<BookmarkListResult> => {
    const params = BookmarkListParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return BookmarkListResultSchema.parse(await worker.request<unknown>(BOOKMARK_LIST_METHOD, params));
  });

  ipcMain.handle(BOOKMARK_DELETE_CHANNEL, async (_event, rawParams: unknown): Promise<BookmarkDeleteResult> => {
    const params = BookmarkDeleteParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return BookmarkDeleteResultSchema.parse(await worker.request<unknown>(BOOKMARK_DELETE_METHOD, params));
  });

  ipcMain.handle(FILE_EXPORT_CHANNEL, async (event, rawParams: unknown): Promise<FileExportResult> => {
    const params = ExportCreateParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const result = await worker.request<unknown>(EXPORT_CREATE_METHOD, params, { timeoutMs: 10_000 });
    const artifact = ExportArtifactSchema.parse(result);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t("dialog.exportTitle", { label: exportLabel(artifact.format, t) }),
      defaultPath: artifact.suggestedFileName,
      filters: [exportFilter(artifact.format, t)],
      properties: ["showOverwriteConfirmation"] as Array<"showOverwriteConfirmation">
    };
    const selection = owner === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(owner, options);
    if (selection.canceled || selection.filePath === undefined) {
      return FileExportResultSchema.parse({ status: "canceled" });
    }
    const target = ensureExportExtension(selection.filePath, artifact.format);
    const bytes = await atomicWriteUtf8(target, artifact.content);
    return FileExportResultSchema.parse({
      status: "saved",
      format: artifact.format,
      fileName: path.basename(target),
      bytes,
      syntaxValidation: artifact.syntaxValidation,
      warnings: artifact.warnings
    });
  });

  ipcMain.handle(CLIPBOARD_COPY_CHANNEL, async (_event, rawParams: unknown): Promise<ClipboardCopyResult> => {
    const params = ClipboardCopyParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const generated = await worker.request<unknown>(SHELL_GENERATE_METHOD, params);
    const result = copyGeneratedCommand(generated, (text) => clipboard.writeText(text, "clipboard"));
    if (!app.isPackaged && process.env.CMD_IDE_SMOKE_TEST === "1") {
      process.stderr.write(`[smoke] copied ${result.characters} command characters to clipboard\n`);
    }
    return result;
  });

  ipcMain.handle(PROJECT_FILE_IMPORT_CHANNEL, async (event, rawParams: unknown): Promise<ProjectFileImportResult> => {
    ProjectFileImportParamsSchema.parse(rawParams);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t("dialog.importProjectTitle"),
      filters: [{ name: t("dialog.projectFilter"), extensions: ["json"] }],
      properties: ["openFile"] as Array<"openFile">
    };
    const selection = owner === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(owner, options);
    if (selection.canceled || selection.filePaths.length !== 1) {
      return ProjectFileImportResultSchema.parse({ status: "canceled" });
    }
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const selectedPath = selection.filePaths[0]!;
    if (!selectedPath.toLowerCase().endsWith(".cmdbuilder.json")) {
      throw new Error(t("dialog.invalidProjectExtension"));
    }
    const content = await readBoundedUtf8(selectedPath);
    const params = ProjectImportParamsSchema.parse({ content });
    const result = ProjectImportResultSchema.parse(
      await worker.request<unknown>(PROJECT_IMPORT_METHOD, params)
    );
    return ProjectFileImportResultSchema.parse({
      status: "imported",
      fileName: path.basename(selectedPath),
      project: result.project
    });
  });

  ipcMain.handle(WORKING_DIRECTORY_CHANNEL, async (event, rawParams: unknown): Promise<WorkingDirectoryResult> => {
    ProjectFileImportParamsSchema.parse(rawParams);
    const owner = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: t("dialog.chooseWorkingDirectory"),
      properties: ["openDirectory"] as Array<"openDirectory">
    };
    const selection = owner === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(owner, options);
    if (selection.canceled || selection.filePaths.length !== 1) {
      return WorkingDirectoryResultSchema.parse({ status: "canceled" });
    }
    const directory = selection.filePaths[0]!;
    const token = randomUUID();
    while (workingDirectories.size >= 32) {
      const oldest = workingDirectories.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      workingDirectories.delete(oldest);
    }
    workingDirectories.set(token, directory);
    return WorkingDirectoryResultSchema.parse({
      status: "selected",
      token,
      label: path.basename(directory) || path.parse(directory).root
    });
  });

  ipcMain.handle(EXECUTION_START_CHANNEL, async (_event, rawParams: unknown): Promise<ExecutionStartResult> => {
    const uiParams = ExecutionStartUiParamsSchema.parse(rawParams);
    const workingDirectory = workingDirectories.get(uiParams.workingDirectoryToken);
    if (workingDirectory === undefined) throw new Error(t("dialog.chooseDirectoryBeforeRun"));
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    const { workingDirectoryToken: _token, ...execution } = uiParams;
    const params = ExecutionStartParamsSchema.parse({ ...execution, workingDirectory });
    const result = await worker.request<unknown>(EXECUTION_START_METHOD, params, { timeoutMs: 15_000 });
    return ExecutionStartResultSchema.parse(result);
  });

  ipcMain.handle(EXECUTION_INPUT_CHANNEL, async (_event, rawParams: unknown): Promise<{ accepted: true }> => {
    const params = ExecutionInputParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AcceptedResultSchema.parse(await worker.request<unknown>(EXECUTION_INPUT_METHOD, params));
  });

  ipcMain.handle(EXECUTION_RESIZE_CHANNEL, async (_event, rawParams: unknown): Promise<{ accepted: true }> => {
    const params = ExecutionResizeParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AcceptedResultSchema.parse(await worker.request<unknown>(EXECUTION_RESIZE_METHOD, params));
  });

  ipcMain.handle(EXECUTION_CANCEL_CHANNEL, async (_event, rawParams: unknown): Promise<{ accepted: true }> => {
    const params = ExecutionCancelParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return AcceptedResultSchema.parse(await worker.request<unknown>(EXECUTION_CANCEL_METHOD, params));
  });

  ipcMain.handle(HISTORY_LIST_CHANNEL, async (_event, rawParams: unknown): Promise<HistoryListResult> => {
    const params = HistoryListParamsSchema.parse(rawParams);
    if (worker === null) throw new Error(t("error.workerUnavailable"));
    return HistoryListResultSchema.parse(await worker.request<unknown>(HISTORY_LIST_METHOD, params));
  });
}

function exportLabel(
  format: "project" | "bash" | "markdown",
  t: Translator["t"]
): string {
  if (format === "project") return t("dialog.exportLabel.project");
  if (format === "bash") return t("dialog.exportLabel.bash");
  return t("dialog.exportLabel.markdown");
}

function exportFilter(
  format: "project" | "bash" | "markdown",
  t: Translator["t"]
): { name: string; extensions: string[] } {
  if (format === "project") return { name: t("dialog.projectFilter"), extensions: ["json"] };
  if (format === "bash") return { name: t("dialog.exportLabel.bash"), extensions: ["sh"] };
  return { name: t("dialog.exportLabel.markdown"), extensions: ["md"] };
}

function ensureExportExtension(filePath: string, format: "project" | "bash" | "markdown"): string {
  const extension = format === "project" ? ".cmdbuilder.json" : format === "bash" ? ".sh" : ".md";
  return filePath.toLowerCase().endsWith(extension) ? filePath : filePath + extension;
}

app.whenReady().then(() => {
  worker = startWorker();
  const locale = resolveSupportedLocale([
    ...app.getPreferredSystemLanguages(),
    app.getLocale()
  ]);
  registerIpc(createTranslator(locale));
  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
}).catch((error: unknown) => {
  process.stderr.write(`Application startup failed: ${String(error)}\n`);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  ipcMain.removeHandler(HEALTH_CHANNEL);
  ipcMain.removeHandler(SYSTEM_CHANNEL);
  ipcMain.removeHandler(TOOLING_CHANNEL);
  ipcMain.removeHandler(SHELLCHECK_CHANNEL);
  ipcMain.removeHandler(SHFMT_CHANNEL);
  ipcMain.removeHandler(AI_MODELS_CHANNEL);
  ipcMain.removeHandler(AI_TEST_CHANNEL);
  ipcMain.removeHandler(AI_PROBE_CHANNEL);
  ipcMain.removeHandler(AI_PROPOSE_CHANNEL);
  ipcMain.removeHandler(CREDENTIAL_STATUS_CHANNEL);
  ipcMain.removeHandler(CREDENTIAL_STORE_CHANNEL);
  ipcMain.removeHandler(CREDENTIAL_DELETE_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_OPEN_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_CHANGE_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_CLOSE_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_COMPLETION_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_HOVER_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_SYMBOLS_CHANNEL);
  ipcMain.removeHandler(LANGUAGE_REFERENCES_CHANNEL);
  ipcMain.removeHandler(CATALOG_CHANNEL);
  ipcMain.removeHandler(CATALOG_DISCOVER_CHANNEL);
  ipcMain.removeHandler(MANUAL_CHANNEL);
  ipcMain.removeHandler(SHELL_GENERATE_CHANNEL);
  ipcMain.removeHandler(SHELL_PARSE_CHANNEL);
  ipcMain.removeHandler(CATALOG_VERSION_CHANNEL);
  ipcMain.removeHandler(RISK_CHANNEL);
  ipcMain.removeHandler(PROJECT_SAVE_CHANNEL);
  ipcMain.removeHandler(PROJECT_GET_CHANNEL);
  ipcMain.removeHandler(PROJECT_LIST_CHANNEL);
  ipcMain.removeHandler(BOOKMARK_SAVE_CHANNEL);
  ipcMain.removeHandler(BOOKMARK_LIST_CHANNEL);
  ipcMain.removeHandler(BOOKMARK_DELETE_CHANNEL);
  ipcMain.removeHandler(FILE_EXPORT_CHANNEL);
  ipcMain.removeHandler(CLIPBOARD_COPY_CHANNEL);
  ipcMain.removeHandler(PROJECT_FILE_IMPORT_CHANNEL);
  ipcMain.removeHandler(WORKING_DIRECTORY_CHANNEL);
  ipcMain.removeHandler(EXECUTION_START_CHANNEL);
  ipcMain.removeHandler(EXECUTION_INPUT_CHANNEL);
  ipcMain.removeHandler(EXECUTION_RESIZE_CHANNEL);
  ipcMain.removeHandler(EXECUTION_CANCEL_CHANNEL);
  ipcMain.removeHandler(HISTORY_LIST_CHANNEL);
  workingDirectories.clear();
  worker?.shutdown();
  worker = null;
});
