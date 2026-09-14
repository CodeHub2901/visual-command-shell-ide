// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

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
  DesktopEnvironmentProfileSchema,
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
  type DesktopEnvironmentProfile,
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
import { createDesktopStartupPlan } from "./linux-startup";
import {
  logErrorContext,
  StructuredLogger,
  type LogLevel
} from "./structured-logger";

const HEALTH_CHANNEL = "cmd-ide:health-check";
const SYSTEM_CHANNEL = "cmd-ide:system-detect";
const DESKTOP_ENVIRONMENT_CHANNEL = "cmd-ide:desktop-environment";
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
let logger: StructuredLogger | null = null;
const workingDirectories = new Map<string, string>();

function readLinuxDmiIdentity(): string {
  if (process.platform !== "linux") return "";
  return ["/sys/class/dmi/id/sys_vendor", "/sys/class/dmi/id/product_name"]
    .flatMap((filePath) => {
      try {
        return [fs.readFileSync(filePath, "utf8").trim()];
      } catch {
        return [];
      }
    })
    .join(" ");
}

const desktopStartupPlan = createDesktopStartupPlan({
  platform: process.platform,
  environment: process.env,
  dmiIdentity: readLinuxDmiIdentity()
});

if (desktopStartupPlan.ozonePlatformHint !== null) {
  app.commandLine.appendSwitch("ozone-platform-hint", desktopStartupPlan.ozonePlatformHint);
}
if (desktopStartupPlan.disableHardwareAcceleration) {
  app.disableHardwareAcceleration();
}

function createWindow(): BrowserWindow {
  // Native transparency depends on Linux compositor support. Keep it opt-in so
  // unsupported sessions retain a reliable opaque window while the renderer's
  // in-app glass materials remain available everywhere.
  const nativeTransparency = desktopStartupPlan.profile.nativeTransparency;
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: nativeTransparency ? "#00000000" : "#10141d",
    transparent: nativeTransparency,
    show: false,
    webPreferences: secureWebPreferences(
      path.join(__dirname, "..", "preload", "index.js"),
      app.isPackaged
    )
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.on("console-message", (details) => {
    logger?.ingestRendererMessage(details.message, details.level);
  });
  window.webContents.on("dom-ready", () => {
    const flag = nativeTransparency ? "true" : "false";
    void window.webContents.executeJavaScript(
      `document.documentElement.dataset.nativeTransparency = ${JSON.stringify(flag)};`
    );
  });
  window.once("ready-to-show", () => window.show());
  window.webContents.once("did-finish-load", () => {
    const responsiveCaptureDirectory = process.env.CMD_IDE_RESPONSIVE_CAPTURE_DIR;
    if (!app.isPackaged && responsiveCaptureDirectory !== undefined) {
      window.webContents.setZoomFactor(1);
      void captureResponsiveVerification(window, path.resolve(responsiveCaptureDirectory)).catch((error: unknown) => {
        process.stderr.write(`[responsive] verification failed: ${String(error)}\n`);
        app.exit(1);
      });
      return;
    }
    const smokeRequested = app.isPackaged
      ? process.env.CMD_IDE_PACKAGED_SMOKE_TEST === "1"
      : process.env.CMD_IDE_SMOKE_TEST === "1";
    if (smokeRequested) {
      window.webContents.setZoomFactor(1);
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

type ResponsiveWorkspace = {
  id: string;
  railId: string;
  readySelector: string;
  tabLabel?: string;
};

type ResponsiveCaptureResult = {
  file: string;
  workspace: string;
  requestedOuterSize: [number, number];
  actualOuterSize: [number, number];
  rendererSize: [number, number];
  imageSize: [number, number];
  zoomPercent: number;
  layout: string | null;
  checks: Record<string, boolean>;
};

async function captureResponsiveVerification(window: BrowserWindow, outputDirectory: string): Promise<void> {
  const fullSizes = [
    [980, 640],
    [1024, 768],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [2560, 1440]
  ] as const;
  const debugCapture = process.env.CMD_IDE_RESPONSIVE_DEBUG === "1";
  const requestedTheme = process.env.CMD_IDE_RESPONSIVE_THEME;
  if (requestedTheme !== undefined && requestedTheme !== "dark" && requestedTheme !== "light") {
    throw new Error("CMD_IDE_RESPONSIVE_THEME must be either dark or light");
  }
  const requestedDebugZoom = Number(process.env.CMD_IDE_RESPONSIVE_DEBUG_ZOOM ?? "1");
  const debugZoom = Number.isFinite(requestedDebugZoom) && requestedDebugZoom > 0 ? requestedDebugZoom : 1;
  const sizes: ReadonlyArray<readonly [number, number]> = debugCapture ? [fullSizes[0]] : fullSizes;
  const zoomFactors: readonly number[] = debugCapture ? [debugZoom] : [1, 1.5, 2];
  const additionalZoomFactors: readonly number[] = debugCapture ? [] : [1.25, 1.75];
  const allWorkspaces: readonly ResponsiveWorkspace[] = [
    { id: "home", railId: "home", readySelector: ".home-projects" },
    { id: "command-manual", railId: "command", tabLabel: "Manual", readySelector: ".manual-documentation" },
    { id: "command-guided", railId: "command", tabLabel: "Guided", readySelector: ".guided-builder" },
    { id: "command-editor", railId: "command", tabLabel: "Editor", readySelector: ".compact-editor .monaco-editor" },
    { id: "command-review", railId: "command", tabLabel: "Review", readySelector: ".execution-review-workspace" },
    { id: "ai-assistant", railId: "ai-assistant", readySelector: ".ai-view" },
    { id: "bookmarks", railId: "bookmarks", readySelector: ".bookmarks-view" },
    { id: "history", railId: "history", readySelector: ".history-view" },
    { id: "settings", railId: "settings", readySelector: ".settings-view" }
  ];
  const requestedWorkspaceIds = new Set(
    (process.env.CMD_IDE_RESPONSIVE_WORKSPACES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
  const workspaces = requestedWorkspaceIds.size === 0
    ? allWorkspaces
    : allWorkspaces.filter((workspace) => requestedWorkspaceIds.has(workspace.id));
  if (workspaces.length === 0) throw new Error("Responsive workspace filter did not match any surface");

  fs.mkdirSync(outputDirectory, { recursive: true });
  await waitForRendererCondition(
    window,
    "document.querySelector('.command-result[data-command-id=\"ls\"]') !== null"
  );
  if (requestedTheme !== undefined) {
    await window.webContents.executeJavaScript(`
      document.documentElement.dataset.theme = ${JSON.stringify(requestedTheme)};
      document.documentElement.style.colorScheme = ${JSON.stringify(requestedTheme)};
    `);
  }
  await window.webContents.executeJavaScript(`
    document.querySelector('.command-result[data-command-id="ls"]')?.click()
  `);
  await waitForRendererCondition(window, "document.querySelector('.manual-documentation') !== null");

  const captures: ResponsiveCaptureResult[] = [];
  const additionalScalingChecks: Array<Omit<ResponsiveCaptureResult, "file" | "imageSize">> = [];
  const failures: string[] = [];
  for (const zoomFactor of zoomFactors) {
    window.webContents.setZoomFactor(zoomFactor);
    for (const requestedSize of sizes) {
      await applyOuterWindowSize(window, requestedSize[0], requestedSize[1]);
      await settleResponsiveLayout(window);
      for (const workspace of workspaces) {
        await window.webContents.executeJavaScript(`
          document.querySelector('[data-workspace-id=${JSON.stringify(workspace.railId)}]')?.click()
        `);
        await waitForRendererCondition(
          window,
          `document.querySelector('.app-shell')?.getAttribute('data-active-workspace') === ${JSON.stringify(workspace.railId)}`
        );
        if (workspace.tabLabel !== undefined) {
          await window.webContents.executeJavaScript(`
            [...document.querySelectorAll('.command-view-switch button')]
              .find((button) => button.textContent?.trim() === ${JSON.stringify(workspace.tabLabel)})?.click()
          `);
        }
        await waitForRendererCondition(
          window,
          `document.querySelector('.app-shell')?.getAttribute('data-active-workspace') === ${JSON.stringify(workspace.railId)}`
            + ` && document.querySelector(${JSON.stringify(workspace.readySelector)}) !== null`,
          20_000
        );
        await settleResponsiveLayout(window);
        if (requestedTheme !== undefined) {
          await window.webContents.executeJavaScript(`
            document.documentElement.dataset.theme = ${JSON.stringify(requestedTheme)};
            document.documentElement.style.colorScheme = ${JSON.stringify(requestedTheme)};
          `);
        }
        const metrics = await collectResponsiveMetrics(window, workspace.id, workspace.railId);
        const image = await window.webContents.capturePage();
        const file = `${workspace.id}__${requestedSize[0]}x${requestedSize[1]}__${Math.round(zoomFactor * 100)}pct.png`;
        fs.writeFileSync(path.join(outputDirectory, file), image.toPNG());
        const actualOuterSize = window.getSize() as [number, number];
        const imageSize = image.getSize();
        metrics.checks.outerSizeApplied = outerWindowSizeMatches(actualOuterSize, requestedSize);
        const expectedLayout = metrics.rendererSize[0] >= 1440
          ? "wide"
          : metrics.rendererSize[0] >= 1100 ? "medium" : "compact";
        metrics.checks.layoutBreakpointMatches = metrics.layout === expectedLayout;
        metrics.checks.captureIsNonEmpty = imageSize.width > 0 && imageSize.height > 0;
        const capture: ResponsiveCaptureResult = {
          file,
          workspace: workspace.id,
          requestedOuterSize: [requestedSize[0], requestedSize[1]],
          actualOuterSize,
          rendererSize: metrics.rendererSize,
          imageSize: [imageSize.width, imageSize.height],
          zoomPercent: Math.round(zoomFactor * 100),
          layout: metrics.layout,
          checks: metrics.checks
        };
        captures.push(capture);
        for (const [check, passed] of Object.entries(metrics.checks)) {
          if (!passed) failures.push(`${file}: ${check}`);
        }
      }
      process.stderr.write(
        `[responsive] captured ${requestedSize[0]}x${requestedSize[1]} at ${Math.round(zoomFactor * 100)}%\n`
      );
    }
  }

  for (const zoomFactor of additionalZoomFactors) {
    window.webContents.setZoomFactor(zoomFactor);
    for (const requestedSize of sizes) {
      await applyOuterWindowSize(window, requestedSize[0], requestedSize[1]);
      await settleResponsiveLayout(window);
      for (const workspace of workspaces) {
        await window.webContents.executeJavaScript(`
          document.querySelector('[data-workspace-id=${JSON.stringify(workspace.railId)}]')?.click()
        `);
        await waitForRendererCondition(
          window,
          `document.querySelector('.app-shell')?.getAttribute('data-active-workspace') === ${JSON.stringify(workspace.railId)}`
        );
        if (workspace.tabLabel !== undefined) {
          await window.webContents.executeJavaScript(`
            [...document.querySelectorAll('.command-view-switch button')]
              .find((button) => button.textContent?.trim() === ${JSON.stringify(workspace.tabLabel)})?.click()
          `);
        }
        await waitForRendererCondition(
          window,
          `document.querySelector('.app-shell')?.getAttribute('data-active-workspace') === ${JSON.stringify(workspace.railId)}`
            + ` && document.querySelector(${JSON.stringify(workspace.readySelector)}) !== null`,
          20_000
        );
        await settleResponsiveLayout(window);
        const metrics = await collectResponsiveMetrics(window, workspace.id, workspace.railId);
        const actualOuterSize = window.getSize() as [number, number];
        metrics.checks.outerSizeApplied = outerWindowSizeMatches(actualOuterSize, requestedSize);
        const expectedLayout = metrics.rendererSize[0] >= 1440
          ? "wide"
          : metrics.rendererSize[0] >= 1100 ? "medium" : "compact";
        metrics.checks.layoutBreakpointMatches = metrics.layout === expectedLayout;
        const stateName = `${workspace.id}__${requestedSize[0]}x${requestedSize[1]}__${Math.round(zoomFactor * 100)}pct`;
        additionalScalingChecks.push({
          workspace: workspace.id,
          requestedOuterSize: [requestedSize[0], requestedSize[1]],
          actualOuterSize,
          rendererSize: metrics.rendererSize,
          zoomPercent: Math.round(zoomFactor * 100),
          layout: metrics.layout,
          checks: metrics.checks
        });
        for (const [check, passed] of Object.entries(metrics.checks)) {
          if (!passed) failures.push(`${stateName}: ${check}`);
        }
      }
      process.stderr.write(
        `[responsive] checked ${requestedSize[0]}x${requestedSize[1]} at ${Math.round(zoomFactor * 100)}%\n`
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    captureCount: captures.length,
    expectedCaptureCount: sizes.length * zoomFactors.length * workspaces.length,
    additionalScalingCheckCount: additionalScalingChecks.length,
    expectedAdditionalScalingCheckCount: sizes.length * additionalZoomFactors.length * workspaces.length,
    failures,
    captures,
    additionalScalingChecks
  };
  fs.writeFileSync(
    path.join(outputDirectory, "responsive-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  if (failures.length > 0) {
    throw new Error(`${failures.length} responsive assertions failed; see responsive-report.json`);
  }
  window.webContents.setZoomFactor(1);
  process.stderr.write(`[responsive] ${captures.length} screenshots and all layout assertions passed\n`);
  app.quit();
}

async function settleResponsiveLayout(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const element of document.querySelectorAll('.workspace-content, .pane-scroll-content')) {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      }
      resolve(true);
    })))
  `);
  await new Promise<void>((resolve) => setTimeout(resolve, 120));
}

async function applyOuterWindowSize(window: BrowserWindow, width: number, height: number): Promise<void> {
  if (window.isMaximized()) window.unmaximize();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    window.setSize(width, height);
    await window.webContents.executeJavaScript(`
      new Promise((resolve) => requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }))
    `);
    const [actualWidth, actualHeight] = window.getSize() as [number, number];
    if (outerWindowSizeMatches([actualWidth, actualHeight], [width, height])) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Electron did not apply requested outer size ${width}x${height}; actual ${window.getSize().join("x")}`);
}

function outerWindowSizeMatches(
  actual: readonly [number, number],
  requested: readonly [number, number]
): boolean {
  const tolerance = process.platform === "win32" ? 1 : 0;
  return Math.abs(actual[0] - requested[0]) <= tolerance
    && Math.abs(actual[1] - requested[1]) <= tolerance;
}

async function collectResponsiveMetrics(window: BrowserWindow, workspace: string, railWorkspace: string): Promise<{
  rendererSize: [number, number];
  layout: string | null;
  checks: Record<string, boolean>;
}> {
  return await window.webContents.executeJavaScript(`
    (() => {
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0
          && rect.left >= 0
          && rect.top >= 0
          && rect.right <= window.innerWidth + 1
          && rect.bottom <= window.innerHeight + 1;
      };
      const shell = document.querySelector('.app-shell');
      const workspaceHeader = document.querySelector('.workspace-tabs');
      const activeRail = document.querySelector('[data-workspace-id=${JSON.stringify(railWorkspace)}]');
      const commandTabList = document.querySelector('.command-view-switch');
      const commandTabs = [...document.querySelectorAll('.command-view-switch button')];
      const primaryActions = [...document.querySelectorAll('.primary-actions button')];
      const editing = ${JSON.stringify(workspace)}.startsWith('command-');
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        rendererSize: [window.innerWidth, window.innerHeight],
        layout: shell?.getAttribute('data-layout') ?? null,
        checks: {
          bodyOverflowHidden: bodyStyle.overflowX === 'hidden' && bodyStyle.overflowY === 'hidden',
          documentOverflowHidden: rootStyle.overflowX === 'hidden' && rootStyle.overflowY === 'hidden',
          noHorizontalDocumentOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
            && document.body.scrollWidth <= document.body.clientWidth,
          noVerticalDocumentOverflow: document.documentElement.scrollHeight <= document.documentElement.clientHeight
            && document.body.scrollHeight <= document.body.clientHeight,
          activeWorkspaceVisible: visible(activeRail),
          applicationBarVisible: visible(workspaceHeader),
          terminalControlReachable: visible(document.querySelector('.terminal-toggle')),
          safetyModeDiscoverable: !editing || (commandTabs.length === 4
            && commandTabList instanceof HTMLElement
            && commandTabs.every((button) => {
              if (!visible(button)) return false;
              const buttonRect = button.getBoundingClientRect();
              const listRect = commandTabList.getBoundingClientRect();
              return buttonRect.left >= listRect.left - 1 && buttonRect.right <= listRect.right + 1;
            })),
          primaryActionsPresent: !editing || primaryActions.length <= 1,
          primaryActionsVisible: !editing || primaryActions.every(visible),
          sidebarOwnsOverflow: getComputedStyle(document.querySelector('.command-sidebar .pane-scroll-content')).overflowY === 'auto',
          workspaceOwnsOverflow: getComputedStyle(document.querySelector('.workspace-content')).overflowY === 'auto',
          inspectorOwnsOverflow: getComputedStyle(document.querySelector('.inspector .pane-scroll-content')).overflowY === 'auto'
        }
      };
    })()
  `) as {
    rendererSize: [number, number];
    layout: string | null;
    checks: Record<string, boolean>;
  };
}

async function verifyRendererEditors(window: BrowserWindow): Promise<void> {
  await verifyPolishedNavigation(window);
  await waitForRendererCondition(window, "document.querySelector('.command-result[data-command-id=\"ls\"]') !== null");
  const selectedCatalogCommand = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.command-result[data-command-id="ls"]');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!selectedCatalogCommand) throw new Error("Catalog command selection was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.manual-documentation') !== null"
      + " && document.querySelector('button[aria-label=\"Command Workspace\"]')?.getAttribute('aria-current') === 'page'"
  );
  const openedManual = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.command-view-switch button')]
        .find((candidate) => candidate.textContent?.trim() === 'Manual');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedManual) throw new Error("Manual command tab was unavailable");
  await waitForRendererCondition(window, "document.querySelector('.manual-documentation') !== null");
  const openedBuilder = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.command-view-switch button')]
        .find((candidate) => candidate.textContent?.trim() === 'Guided');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedBuilder) throw new Error("Guided command tab was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.guided-builder') !== null"
      + " && [...document.querySelectorAll('.command-view-switch button')].some((button) => button.textContent?.trim() === 'Guided' && button.getAttribute('aria-selected') === 'true')"
  );
  await waitForRendererCondition(
    window,
    "document.querySelector('.guided-builder .generated-preview.ready, .guided-builder .generated-preview.error') !== null"
  );
  const builderGenerationError = await window.webContents.executeJavaScript(`
    document.querySelector('.guided-builder .generated-preview.error')?.textContent?.trim() ?? ''
  `) as string;
  if (builderGenerationError.length > 0) {
    throw new Error(`Visual Builder generation failed: ${builderGenerationError}`);
  }
  await waitForRendererCondition(
    window,
    "document.querySelector('.session-context .draft-state.unsaved, .session-context .draft-state.saved') !== null"
  );
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
  const exampleAdded = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.visual-catalog-actions button');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()
  `));
  if (!exampleAdded) throw new Error("Add catalog example action was not available");
  await waitForRendererCondition(
    window,
    "document.querySelector('.visual-catalog-actions span')?.textContent?.includes('Added') === true"
  );
  process.stderr.write("[smoke] catalog example insertion validated\n");
  const switched = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.command-view-switch button')]
        .find((candidate) => candidate.textContent?.trim() === 'Editor');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!switched) throw new Error("Editor command tab was not available");
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
  await waitForRendererCondition(window, "document.querySelector('.compact-editor .parse-summary.ready') !== null");
  await waitForRendererCondition(window, "document.querySelector('.terminal-panel .xterm') !== null");
  await verifyActiveSurfaceResizeState(window);
  const openedReview = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('.command-view-switch button')]
        .find((candidate) => candidate.textContent?.trim() === 'Review');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedReview) throw new Error("Dedicated Review command tab was unavailable");
  await waitForRendererCondition(window, "document.querySelector('.execution-review-workspace') !== null");
  const reviewBoundary = await window.webContents.executeJavaScript(`
    (() => ({
      script: document.querySelector('.execution-review-workspace .review-script pre')?.textContent ?? null,
      runDisabled: document.querySelector('.execution-review-workspace [data-primary-run]')?.disabled ?? null,
      editorPreserved: document.querySelector('.compact-editor .monaco-editor') !== null
    }))()
  `) as { script: string | null; runDisabled: boolean | null; editorPreserved: boolean };
  if (!(reviewBoundary.script?.includes('ls -al .') === true)
      || reviewBoundary.runDisabled !== true
      || !reviewBoundary.editorPreserved) {
    throw new Error(`Dedicated review boundary was incomplete: ${JSON.stringify(reviewBoundary)}`);
  }
  process.stderr.write("[smoke] dedicated exact-script review boundary and persistent editor validated\n");
  const unsavedReplacementBlocked = Boolean(await window.webContents.executeJavaScript(`
    (async () => {
      window.confirm = () => false;
      const replacement = [...document.querySelectorAll('.command-result')]
        .find((candidate) => !candidate.classList.contains('selected'));
      if (!(replacement instanceof HTMLButtonElement)) return false;
      replacement.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return document.querySelector('.command-result.selected')?.getAttribute('data-command-id') === 'ls'
        && document.querySelector('.execution-review-workspace') !== null;
    })()
  `));
  if (!unsavedReplacementBlocked) throw new Error("Unsaved command replacement was not blocked after cancellation");
  process.stderr.write("[smoke] unsaved command replacement safeguard validated\n");
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
  const themeControlsReady = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const choices = [...document.querySelectorAll('.theme-picker [data-theme-option]')];
      const rail = document.querySelector('.navigation-rail');
      const glass = rail === null ? '' : getComputedStyle(rail).backdropFilter;
      return choices.length === 3
        && choices.every((choice) => choice.getAttribute('role') === 'radio')
        && glass !== ''
        && glass !== 'none';
    })()
  `));
  if (!themeControlsReady) throw new Error("Theme controls or frosted material were unavailable");
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-theme-option="light"]')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.documentElement.dataset.theme === 'light'"
      + " && document.documentElement.style.colorScheme === 'light'"
      + " && localStorage.getItem('command-ide:theme-preference') === 'light'"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-theme-option="dark"]')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.documentElement.dataset.theme === 'dark'"
      + " && document.documentElement.style.colorScheme === 'dark'"
      + " && localStorage.getItem('command-ide:theme-preference') === 'dark'"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-theme-option="system"]')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.documentElement.dataset.themePreference === 'system'"
      + " && localStorage.getItem('command-ide:theme-preference') === 'system'"
  );
  process.stderr.write("[smoke] persisted System/Light/Dark glass appearance validated\n");
  await waitForRendererCondition(
    window,
    "document.querySelectorAll('.desktop-environment-panel dd').length === 6"
  );
  const reopenedOnboarding = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.onboarding-settings-panel button');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!reopenedOnboarding) throw new Error("Getting-started walkthrough control was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.onboarding-panel') !== null"
      + " && document.querySelector('[data-active-workspace=\"home\"]') !== null"
      + " && localStorage.getItem('command-ide:onboarding-complete') === null"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('.onboarding-actions button')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.onboarding-panel') === null"
      + " && localStorage.getItem('command-ide:onboarding-complete') === '1'"
      + " && document.activeElement?.matches('.search-label input') === true"
  );
  process.stderr.write("[smoke] desktop diagnostics and restartable first-run walkthrough validated\n");
  const searchShortcutDispatched = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      }));
      return true;
    })()
  `));
  if (!searchShortcutDispatched) throw new Error("Catalog search keyboard shortcut was not dispatched");
  await waitForRendererCondition(
    window,
    "document.activeElement?.matches('.search-label input') === true"
      + " && document.querySelector('.app-shell')?.classList.contains('sidebar-open') === true"
  );
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('.search-label input');
      if (!(input instanceof HTMLInputElement)) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'list');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('[data-clear-catalog-search]') !== null"
      + " && document.querySelector('#catalog-results .command-result') !== null"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('.search-label input')?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true
    }))
  `);
  await waitForRendererCondition(
    window,
    "document.activeElement?.matches('#catalog-results .command-result') === true"
  );
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-clear-catalog-search]')?.click()
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.search-label input')?.value === ''"
      + " && document.activeElement?.matches('.search-label input') === true"
  );
  await window.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', {
      key: '3',
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
  process.stderr.write("[smoke] Guided form and local Monaco editors validated\n");
  await measureInteractiveCanvas(window);
  app.quit();
}

async function verifyPolishedNavigation(window: BrowserWindow): Promise<void> {
  await waitForRendererCondition(window, "document.querySelectorAll('.rail-button').length === 6");
  await applyOuterWindowSize(window, 980, 640);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.getAttribute('data-layout') === 'compact'"
      + " && document.querySelector('.app-shell')?.classList.contains('sidebar-closed') === true"
      + " && document.querySelector('.app-shell')?.classList.contains('inspector-closed') === true"
  );
  await waitForRendererCondition(window, "document.querySelectorAll('.workflow-guide li').length === 4");
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll('.rail-button')];
      const commandViewSwitch = document.querySelector('.command-view-switch');
      const workflowGuide = document.querySelector('.workflow-guide');
      const workflowSteps = [...document.querySelectorAll('.workflow-guide li')];
      const sessionContext = document.querySelector('.session-context');
      const documentWidth = document.documentElement.clientWidth;
      const documentHeight = document.documentElement.clientHeight;
      return {
        buttonCount: buttons.length,
        iconsPresent: buttons.every((button) => button.querySelector('.workspace-icon') !== null),
        labelsPresent: buttons.every((button) => {
          const label = button.getAttribute('aria-label');
          return label !== null && label.length > 2 && button.getAttribute('data-label') === label;
        }),
        activeCount: buttons.filter((button) => button.getAttribute('aria-current') === 'page').length,
        commandFlowIsContextual: commandViewSwitch === null,
        workflowStepCount: workflowSteps.length,
        workflowActiveCount: workflowSteps.filter((step) => step.classList.contains('active')).length,
        workflowLabelPresent: (workflowGuide?.getAttribute('aria-label')?.length ?? 0) > 3,
        contextLabelPresent: (sessionContext?.getAttribute('aria-label')?.length ?? 0) > 3,
        contextFieldCount: sessionContext?.querySelectorAll(':scope > span').length ?? 0,
        contextHasDraftState: sessionContext?.querySelector('.draft-state') !== null,
        contextHasRiskState: sessionContext?.querySelector('.context-risk') !== null,
        contextIsLocal: sessionContext?.querySelector('.local-only') !== null,
        layoutBand: document.querySelector('.app-shell')?.getAttribute('data-layout'),
        sidebarExpanded: document.querySelector('.sidebar-toggle')?.getAttribute('aria-expanded'),
        inspectorExpanded: document.querySelector('.inspector-toggle')?.getAttribute('aria-expanded'),
        resizeHandleCount: document.querySelectorAll('.pane-resize-handle').length,
        bodyOverflow: [getComputedStyle(document.body).overflowX, getComputedStyle(document.body).overflowY],
        sidebarOverflow: getComputedStyle(document.querySelector('.command-sidebar .pane-scroll-content')).overflowY,
        workspaceOverflow: getComputedStyle(document.querySelector('.workspace-content')).overflowY,
        inspectorOverflow: getComputedStyle(document.querySelector('.inspector .pane-scroll-content')).overflowY,
        horizontalOverflow: document.documentElement.scrollWidth > documentWidth
          || document.body.scrollWidth > documentWidth,
        verticalOverflow: document.documentElement.scrollHeight > documentHeight
          || document.body.scrollHeight > documentHeight,
        viewport: [documentWidth, documentHeight],
        scrollSize: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        bodyScrollSize: [document.body.scrollWidth, document.body.scrollHeight],
        innerViewport: [window.innerWidth, window.innerHeight],
        appShellSize: (() => {
          const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
          return shell === undefined ? null : [Math.round(shell.width), Math.round(shell.height)];
        })(),
        overflowElements: [...document.querySelectorAll('body *')]
          .map((element) => ({
            element: element instanceof HTMLElement
              ? element.tagName.toLowerCase() + '.' + String(element.className)
              : element.tagName.toLowerCase(),
            bottom: Math.round(element.getBoundingClientRect().bottom),
            scrollHeight: element instanceof HTMLElement ? element.scrollHeight : 0,
            clientHeight: element instanceof HTMLElement ? element.clientHeight : 0,
            overflowY: getComputedStyle(element).overflowY
          }))
          .filter((entry) => entry.bottom > documentHeight + 1)
          .sort((left, right) => right.bottom - left.bottom)
          .slice(0, 8)
      };
    })()
  `) as {
    buttonCount: number;
    iconsPresent: boolean;
    labelsPresent: boolean;
    activeCount: number;
    commandFlowIsContextual: boolean;
    workflowStepCount: number;
    workflowActiveCount: number;
    workflowLabelPresent: boolean;
    contextLabelPresent: boolean;
    contextFieldCount: number;
    contextHasDraftState: boolean;
    contextHasRiskState: boolean;
    contextIsLocal: boolean;
    layoutBand: string | null;
    sidebarExpanded: string | null;
    inspectorExpanded: string | null;
    resizeHandleCount: number;
    bodyOverflow: [string, string];
    sidebarOverflow: string;
    workspaceOverflow: string;
    inspectorOverflow: string;
    horizontalOverflow: boolean;
    verticalOverflow: boolean;
    viewport: [number, number];
    scrollSize: [number, number];
    bodyScrollSize: [number, number];
    innerViewport: [number, number];
    appShellSize: [number, number] | null;
    overflowElements: Array<{
      element: string;
      bottom: number;
      scrollHeight: number;
      clientHeight: number;
      overflowY: string;
    }>;
  };
  if (result.buttonCount !== 6
      || !result.iconsPresent
      || !result.labelsPresent
      || result.activeCount !== 1
      || !result.commandFlowIsContextual
      || result.workflowStepCount !== 4
      || result.workflowActiveCount !== 1
      || !result.workflowLabelPresent
      || !result.contextLabelPresent
      || result.contextFieldCount !== 5
      || !result.contextHasDraftState
      || !result.contextHasRiskState
      || !result.contextIsLocal
      || result.layoutBand !== "compact"
      || result.sidebarExpanded !== "false"
      || result.inspectorExpanded !== "false"
      || result.resizeHandleCount !== 3
      || result.bodyOverflow.some((value) => value !== "hidden")
      || result.sidebarOverflow !== "auto"
      || result.workspaceOverflow !== "auto"
      || result.inspectorOverflow !== "auto"
      || result.horizontalOverflow
      || result.verticalOverflow) {
    throw new Error(`Minimum-window navigation polish check failed: ${JSON.stringify(result)}`);
  }
  const openedSidebar = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.sidebar-toggle');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedSidebar) throw new Error("Compact contextual sidebar toggle was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('sidebar-open') === true"
      + " && document.activeElement?.id === 'contextual-sidebar'"
  );
  await window.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('sidebar-closed') === true"
      + " && document.activeElement?.matches('.sidebar-toggle') === true"
  );
  const openedInspector = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('.inspector-toggle');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()
  `));
  if (!openedInspector) throw new Error("Compact inspector toggle was unavailable");
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('inspector-open') === true"
      + " && document.activeElement?.id === 'command-inspector'"
  );
  await window.webContents.executeJavaScript(`
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  `);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('inspector-closed') === true"
      + " && document.activeElement?.matches('.inspector-toggle') === true"
  );
  const terminalResizeRequested = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const handle = document.querySelector('.terminal-panel .pane-resize-handle');
      if (!(handle instanceof HTMLElement)) return false;
      const before = Number(handle.getAttribute('aria-valuenow'));
      handle.dataset.beforeResize = String(before);
      const maximum = Number(handle.getAttribute('aria-valuemax'));
      const key = before < maximum ? 'ArrowUp' : 'ArrowDown';
      handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      return true;
    })()
  `));
  if (!terminalResizeRequested) throw new Error("Keyboard terminal pane resize handle was unavailable");
  await waitForRendererCondition(
    window,
    "(() => {"
      + " const handle = document.querySelector('.terminal-panel .pane-resize-handle');"
      + " if (!(handle instanceof HTMLElement)) return false;"
      + " const before = Number(handle.dataset.beforeResize);"
      + " const stored = JSON.parse(localStorage.getItem('command-ide:pane-layout') ?? '{}');"
      + " return Number(handle.getAttribute('aria-valuenow')) !== before && stored.terminal !== before;"
      + " })()"
  );
  await applyOuterWindowSize(window, 1360, 860);
  process.stderr.write("[smoke] minimum-window responsive panels, focus restoration, and resizing validated\n");
}

async function verifyActiveSurfaceResizeState(window: BrowserWindow): Promise<void> {
  await applyOuterWindowSize(window, 1366, 768);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.getAttribute('data-layout') === 'medium'"
  );
  const surfaceState = await window.webContents.executeJavaScript(`
    (() => {
      const editor = document.querySelector('.compact-editor .monaco-editor');
      const terminal = document.querySelector('.terminal-panel .xterm');
      const preview = document.querySelector('.compact-editor .parse-summary.ready');
      const available = {
        editor: editor instanceof HTMLElement,
        terminal: terminal instanceof HTMLElement,
        draftReview: preview !== null
      };
      if (!(editor instanceof HTMLElement)
          || !(terminal instanceof HTMLElement)
          || preview === null) return { marked: false, available };
      editor.dataset.resizeIdentity = 'editor-preserved';
      terminal.dataset.resizeIdentity = 'terminal-preserved';
      editor.dataset.sourcePreview = preview.textContent ?? '';
      const content = document.querySelector('.workspace-content');
      if (content instanceof HTMLElement) {
        content.scrollTop = Math.min(24, content.scrollHeight - content.clientHeight);
        content.dataset.resizeScrollTop = String(content.scrollTop);
      }
      return { marked: true, available };
    })()
  `) as { marked: boolean; available: Record<string, boolean> };
  if (!surfaceState.marked) {
    throw new Error(`Active surfaces unavailable for resize validation: ${JSON.stringify(surfaceState.available)}`);
  }

  await applyOuterWindowSize(window, 980, 640);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.getAttribute('data-layout') === 'compact'"
  );
  await window.webContents.executeJavaScript(`document.querySelector('.inspector-toggle')?.click()`);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('inspector-open') === true"
  );
  await window.webContents.executeJavaScript(`document.querySelector('.inspector-toggle')?.click()`);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.classList.contains('inspector-closed') === true"
  );
  await window.webContents.executeJavaScript(`document.querySelector('.terminal-toggle')?.click()`);
  await waitForRendererCondition(window, "document.querySelector('.terminal-panel')?.classList.contains('collapsed') === true");
  await window.webContents.executeJavaScript(`document.querySelector('.terminal-toggle')?.click()`);
  await waitForRendererCondition(window, "document.querySelector('.terminal-panel')?.classList.contains('collapsed') === false");

  await applyOuterWindowSize(window, 1920, 1080);
  await waitForRendererCondition(
    window,
    "document.querySelector('.app-shell')?.getAttribute('data-layout') === 'wide'"
  );
  const preserved = Boolean(await window.webContents.executeJavaScript(`
    (() => {
      const editor = document.querySelector('.compact-editor .monaco-editor');
      const terminal = document.querySelector('.terminal-panel .xterm');
      const preview = document.querySelector('.compact-editor .parse-summary.ready');
      const content = document.querySelector('.workspace-content');
      if (!(editor instanceof HTMLElement)
          || !(terminal instanceof HTMLElement)
          || !(content instanceof HTMLElement)
          || preview === null) return false;
      return editor.dataset.resizeIdentity === 'editor-preserved'
        && terminal.dataset.resizeIdentity === 'terminal-preserved'
        && editor.dataset.sourcePreview === (preview.textContent ?? '')
        && content.scrollTop === Number(content.dataset.resizeScrollTop)
        && document.documentElement.scrollWidth === document.documentElement.clientWidth
        && document.documentElement.scrollHeight === document.documentElement.clientHeight;
    })()
  `));
  if (!preserved) {
    throw new Error("Live resizing remounted a primary surface or changed editor/scroll state");
  }
  await applyOuterWindowSize(window, 1360, 860);
  process.stderr.write("[smoke] live responsive resizing preserved Monaco, xterm, draft, and scroll state\n");
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

function startWorker(activeLogger: StructuredLogger): WorkerSupervisor {
  const workerJar = resolveWorkerJar();
  if (!fs.existsSync(workerJar)) {
    throw new Error(`Java worker JAR does not exist: ${workerJar}`);
  }

  return new WorkerSupervisor(() => {
    const client = new WorkerClient({
      javaExecutable: resolveJavaExecutable(),
      workerJar,
      logger: activeLogger,
      environment: {
        CMD_IDE_DATA_DIR: process.env.CMD_IDE_DATA_DIR ?? app.getPath("userData"),
        CMD_IDE_LOG_LEVEL: activeLogger.level,
        ...bundledBashLanguageServerEnvironment(app.getAppPath(), process.execPath)
      }
    });
    client.on("workerLog", (message: string) => activeLogger.ingestWorkerLine(message));
    client.on("workerError", (error: Error) => {
      activeLogger.error("worker.error", logErrorContext(error));
      process.stderr.write(`[worker-error] ${error.message}\n`);
    });
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
        activeLogger.error("worker.notification.unexpected", { method: notification.method });
        process.stderr.write(`[worker-error] Unexpected notification method: ${notification.method}\n`);
      } catch (error: unknown) {
        activeLogger.error("worker.notification.invalid", logErrorContext(error));
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

  ipcMain.handle(DESKTOP_ENVIRONMENT_CHANNEL, async (
    _event,
    rawParams: unknown
  ): Promise<DesktopEnvironmentProfile> => {
    SystemDetectParamsSchema.parse(rawParams);
    return DesktopEnvironmentProfileSchema.parse(desktopStartupPlan.profile);
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
  app.setAppLogsPath();
  logger = new StructuredLogger({
    component: "electron-main",
    directory: process.env.CMD_IDE_LOG_DIR === undefined
      ? app.getPath("logs")
      : path.resolve(process.env.CMD_IDE_LOG_DIR),
    level: resolveLogLevel(process.env.CMD_IDE_LOG_LEVEL),
    mirrorToStderr: process.env.CMD_IDE_LOG_STDERR === "1"
  });
  logger.info("application.starting", {
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    packaged: app.isPackaged,
    ozonePlatformHint: desktopStartupPlan.ozonePlatformHint ?? "none",
    hardwareAccelerationDisabled: desktopStartupPlan.disableHardwareAcceleration
  });
  process.stderr.write(`[command-ide] structured log: ${logger.filePath}\n`);
  worker = startWorker(logger);
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
  logger?.error("application.startup_failed", logErrorContext(error));
  process.stderr.write(`Application startup failed: ${String(error)}\n`);
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  logger?.info("application.stopping");
  ipcMain.removeHandler(HEALTH_CHANNEL);
  ipcMain.removeHandler(SYSTEM_CHANNEL);
  ipcMain.removeHandler(DESKTOP_ENVIRONMENT_CHANNEL);
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
  logger?.flush();
});

function resolveLogLevel(value: string | undefined): LogLevel {
  return value === "debug" || value === "warn" || value === "error" ? value : "info";
}
