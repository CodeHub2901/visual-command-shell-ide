// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import {
  lazy,
  Suspense,
  type CSSProperties,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  CatalogSearchResult,
  CatalogDiscoveryResult,
  CatalogProbeVersionResult,
  DesktopEnvironmentProfile,
  AiProposal,
  CommandSpec,
  ExecutionHistoryEntry,
  HealthCheckResult,
  ManualGetResult,
  ProjectParameter,
  ProjectLayout,
  RiskAssessment,
  ScriptProject,
  ProjectSummary,
  ShellGenerateResult,
  ShellParseResult,
  ShellCommandNode,
  ShellProgram,
  StructuredBookmark,
  SystemProfile,
  ToolStatus,
  ToolingProfile
} from "@cmd-ide/contracts";
import { replaceCommandNode } from "./shell-graph";
import { appendProgram } from "./shell-mutations";
import { mergeBookmarkParameters } from "./bookmark-utils";
import { AiAssistantView } from "./AiAssistantView";
import { resolveAppShortcut } from "./app-shortcuts";
import { WorkspaceIcon } from "./WorkspaceIcon";
import { PanelIcon } from "./PanelIcon";
import { PaneResizeHandle } from "./PaneResizeHandle";
import {
  clampPaneSizes,
  desktopLayoutBand,
  paneSizeBounds,
  parsePaneSizes,
  PANE_LAYOUT_STORAGE_KEY,
  serializePaneSizes,
  type PaneSizes
} from "./pane-layout";
import { workflowProgress, type WorkflowStepState } from "./workflow-progress";
import {
  buildCommandView,
  catalogSelectionView,
  interfaceModeView,
  type CommandView
} from "./command-view";
import { formatOptionDescription, mergeCommandOptions, optionsFromManual, splitManualBlocks } from "./manual-format";
import { draftSaveState, type DraftSaveState } from "./draft-status";
import {
  TERMINAL_LAYOUT_SESSION_KEY,
  terminalExpandedFromStorage,
  terminalStorageValue
} from "./terminal-layout";
import { criticalExecutionPolicy } from "./execution-policy";
import { useI18n, type MessageId, type Translator } from "./i18n";
import { useTheme } from "./theme";
import type { ThemePreference } from "./theme-preference";
import {
  onboardingCompleteFromStorage,
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STORAGE_VALUE
} from "./onboarding-preference";
import { rendererErrorContext, rendererLog } from "./structured-logger";

const MonacoBashEditor = lazy(async () => ({
  default: (await import("./MonacoBashEditor")).MonacoBashEditor
}));
const XtermTerminal = lazy(async () => ({
  default: (await import("./XtermTerminal")).XtermTerminal
}));

type HealthState =
  | { status: "checking" }
  | { status: "ready"; result: HealthCheckResult }
  | { status: "error"; message: string };

type SystemState =
  | { status: "checking" }
  | { status: "ready"; result: SystemProfile }
  | { status: "error"; message: string };

type DesktopEnvironmentState =
  | { status: "loading" }
  | { status: "ready"; profile: DesktopEnvironmentProfile }
  | { status: "error"; message: string };

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; result: CatalogSearchResult }
  | { status: "error"; message: string };

type DiscoveryState =
  | { status: "loading" }
  | { status: "ready"; result: CatalogDiscoveryResult }
  | { status: "error"; message: string };

type ManualState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: ManualGetResult }
  | { status: "error"; message: string };

type GenerationState =
  | { status: "idle"; message: string }
  | { status: "loading" }
  | { status: "ready"; result: ShellGenerateResult; assessment: RiskAssessment; program: ShellProgram }
  | { status: "error"; message: string };

type VersionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; result: CatalogProbeVersionResult }
  | { status: "error"; message: string };

type ProjectActionState =
  | { status: "idle" }
  | { status: "working"; message: string }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type ProjectListState =
  | { status: "loading" }
  | { status: "ready"; projects: ProjectSummary[] }
  | { status: "error"; message: string };

type ParseState =
  | { status: "idle"; message: string }
  | { status: "loading" }
  | { status: "ready"; result: ShellParseResult; canonical: ShellGenerateResult; assessment: RiskAssessment }
  | { status: "error"; message: string };

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; entries: ExecutionHistoryEntry[] }
  | { status: "error"; message: string };

type BookmarkState =
  | { status: "loading" }
  | { status: "ready"; bookmarks: StructuredBookmark[] }
  | { status: "error"; message: string };

type ToolingState =
  | { status: "loading" }
  | { status: "ready"; profile: ToolingProfile }
  | { status: "error"; message: string };

type ExecutionDraft = {
  program: ShellProgram;
  assessment: RiskAssessment;
};

type WorkingDirectory = { token: string; label: string };

type ExecutionState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "running" }
  | { status: "exited"; exitStatus: number }
  | { status: "error"; message: string };

function focusAfterLayout(action: () => void): void {
  window.requestAnimationFrame(() => window.requestAnimationFrame(action));
}

const workspaces = [
  { id: "home", messageId: "workspace.home" },
  { id: "command", messageId: "workspace.command" },
  { id: "ai-assistant", messageId: "workspace.aiAssistant" },
  { id: "bookmarks", messageId: "workspace.bookmarks" },
  { id: "history", messageId: "workspace.history" },
  { id: "settings", messageId: "workspace.settings" }
] as const satisfies ReadonlyArray<{ id: string; messageId: MessageId }>;

type WorkspaceId = (typeof workspaces)[number]["id"];

export function App() {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const [healthRefresh, setHealthRefresh] = useState(0);
  const [system, setSystem] = useState<SystemState>({ status: "checking" });
  const [desktopEnvironment, setDesktopEnvironment] = useState<DesktopEnvironmentState>({ status: "loading" });
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [discovery, setDiscovery] = useState<DiscoveryState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [manual, setManual] = useState<ManualState>({ status: "idle" });
  const [mode, setMode] = useState<"Guided" | "Compact">("Guided");
  const [projects, setProjects] = useState<ProjectListState>({ status: "loading" });
  const [projectRefresh, setProjectRefresh] = useState(0);
  const [loadedProject, setLoadedProject] = useState<ScriptProject | null>(null);
  const [projectImport, setProjectImport] = useState<ProjectActionState>({ status: "idle" });
  const [executionDraft, setExecutionDraft] = useState<ExecutionDraft | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceId>("home");
  const [commandView, setCommandView] = useState<CommandView>(catalogSelectionView);
  const [onboardingVisible, setOnboardingVisible] = useState(() => {
    try {
      return !onboardingCompleteFromStorage(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
    } catch {
      return true;
    }
  });
  const [terminalExpanded, setTerminalExpanded] = useState(() => {
    try {
      return terminalExpandedFromStorage(window.sessionStorage.getItem(TERMINAL_LAYOUT_SESSION_KEY));
    } catch {
      return true;
    }
  });
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => {
    try {
      return parsePaneSizes(
        window.localStorage.getItem(PANE_LAYOUT_STORAGE_KEY),
        { width: window.innerWidth, height: window.innerHeight }
      );
    } catch {
      return clampPaneSizes(null, { width: window.innerWidth, height: window.innerHeight });
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1100);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 1440);
  const [workingDirectory, setWorkingDirectory] = useState<WorkingDirectory | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({ columns: 80, rows: 24 });
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [executionState, setExecutionState] = useState<ExecutionState>({ status: "idle" });
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [languageCommands, setLanguageCommands] = useState<CommandSpec[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const workspaceContent = useRef<HTMLDivElement>(null);
  const appShell = useRef<HTMLElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const inspector = useRef<HTMLElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const inspectorToggle = useRef<HTMLButtonElement>(null);
  const layoutBand = desktopLayoutBand(viewport.width);
  const previousLayoutBand = useRef(layoutBand);
  const paneBounds = paneSizeBounds(viewport);

  useEffect(() => {
    rendererLog.info("workspace.changed", {
      workspace,
      commandView,
      interfaceMode: mode.toLowerCase(),
      layoutBand
    });
  }, [workspace, commandView, mode, layoutBand]);

  useEffect(() => {
    if (selectedId !== null) rendererLog.info("command.selected", { commandId: selectedId });
  }, [selectedId]);

  const commitPaneSize = (pane: keyof PaneSizes, value: number) => {
    setPaneSizes((current) => clampPaneSizes({ ...current, [pane]: value }, viewport));
  };

  const openSidebar = () => {
    setSidebarOpen(true);
    focusAfterLayout(() => sidebar.current?.focus());
  };
  const closeSidebar = (restoreFocus = false) => {
    setSidebarOpen(false);
    if (restoreFocus) focusAfterLayout(() => sidebarToggle.current?.focus());
  };
  const openInspector = () => {
    setInspectorOpen(true);
    focusAfterLayout(() => inspector.current?.focus());
  };
  const closeInspector = (restoreFocus = false) => {
    setInspectorOpen(false);
    if (restoreFocus) focusAfterLayout(() => inspectorToggle.current?.focus());
  };

  useEffect(() => {
    let active = true;
    window.commandIde.system.desktopEnvironment().then((profile) => {
      if (active) setDesktopEnvironment({ status: "ready", profile });
    }, (error: unknown) => {
      rendererLog.error("desktop_environment.load_failed", rendererErrorContext(error));
      if (active) setDesktopEnvironment({
        status: "error",
        message: errorMessage(error, t("error.desktopEnvironment"))
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (desktopEnvironment.status !== "ready") return;
    document.documentElement.dataset.nativeTransparency = desktopEnvironment.profile.nativeTransparency
      ? "true"
      : "false";
  }, [desktopEnvironment]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = resolveAppShortcut(event);
      if (shortcut === null) return;
      event.preventDefault();
      if (shortcut.kind === "focus-search") {
        setWorkspace("home");
        setSidebarOpen(true);
        focusAfterLayout(() => {
          searchInput.current?.focus();
          searchInput.current?.select();
        });
        return;
      }
      if (shortcut.kind === "mode") {
        setMode(shortcut.mode);
        setCommandView(interfaceModeView(shortcut.mode));
        if (selectedId !== null) {
          setWorkspace("command");
        }
        workspaceContent.current?.focus();
        return;
      }
      if (shortcut.kind === "toggle-terminal") {
        setTerminalExpanded((value) => !value);
        return;
      }
      const target = workspaces[shortcut.index];
      if (target === undefined) return;
      if (target.id === "command" && selectedId === null) {
        setWorkspace("home");
        setSidebarOpen(true);
        focusAfterLayout(() => searchInput.current?.focus());
        return;
      }
      setWorkspace(target.id);
      if (layoutBand === "compact") setSidebarOpen(false);
      workspaceContent.current?.focus();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [layoutBand, selectedId]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        TERMINAL_LAYOUT_SESSION_KEY,
        terminalStorageValue(terminalExpanded)
      );
    } catch {
      // Storage may be unavailable in a restricted session; in-memory state still works.
    }
  }, [terminalExpanded]);

  useEffect(() => {
    setTypedConfirmation("");
    setExecutionState((current) => current.status === "running" || current.status === "starting"
      ? current
      : { status: "idle" });
  }, [executionDraft?.assessment.reviewHash]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANE_LAYOUT_STORAGE_KEY, serializePaneSizes(paneSizes));
    } catch {
      // Pane resizing remains available when local storage is restricted.
    }
  }, [paneSizes]);

  useEffect(() => {
    let resizeFrame: number | null = null;
    const handleResize = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const nextViewport = { width: window.innerWidth, height: window.innerHeight };
        setViewport(nextViewport);
        setPaneSizes((current) => clampPaneSizes(current, nextViewport));
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (previousLayoutBand.current === layoutBand) return;
    previousLayoutBand.current = layoutBand;
    setSidebarOpen(layoutBand !== "compact");
    setInspectorOpen(layoutBand === "wide");
  }, [layoutBand]);

  useEffect(() => {
    const closeActiveDrawer = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (layoutBand !== "wide" && inspectorOpen) {
        event.preventDefault();
        closeInspector(true);
        return;
      }
      if (layoutBand === "compact" && sidebarOpen) {
        event.preventDefault();
        closeSidebar(true);
      }
    };
    window.addEventListener("keydown", closeActiveDrawer);
    return () => window.removeEventListener("keydown", closeActiveDrawer);
  }, [inspectorOpen, layoutBand, sidebarOpen]);

  useEffect(() => {
    let active = true;
    window.commandIde.health.check().then(async (result) => {
      if (!active) return;
      setHealth({ status: "ready", result });
      try {
        const profile = await window.commandIde.system.detect();
        if (active) setSystem({ status: "ready", result: profile });
      } catch (error: unknown) {
        rendererLog.error("system.detect_failed", rendererErrorContext(error));
        if (active) setSystem({ status: "error", message: errorMessage(error, t("error.systemDetection")) });
      }
    }, (error: unknown) => {
      rendererLog.error("worker.health_failed", rendererErrorContext(error));
      if (active) {
        setHealth({ status: "error", message: errorMessage(error, t("error.workerHealth")) });
        setSystem({ status: "error", message: t("error.workerUnavailable") });
      }
    });
    return () => { active = false; };
  }, [healthRefresh]);

  useEffect(() => {
    let active = true;
    setProjects({ status: "loading" });
    window.commandIde.projects.list(8).then((result) => {
      if (active) setProjects({ status: "ready", projects: result.projects });
    }, (error: unknown) => {
      rendererLog.error("projects.list_failed", rendererErrorContext(error));
      if (active) setProjects({ status: "error", message: errorMessage(error, t("error.projectList")) });
    });
    return () => { active = false; };
  }, [projectRefresh]);

  useEffect(() => {
    let active = true;
    setCatalog({ status: "loading" });
    const timer = window.setTimeout(() => {
      window.commandIde.catalog.search(query, 50).then((result) => {
        if (!active) return;
        setCatalog({ status: "ready", result });
        setSelectedId((current) =>
          result.commands.some((command) => command.id === current)
            ? current
            : null
        );
      }, (error: unknown) => {
        rendererLog.error("catalog.search_failed", rendererErrorContext(error));
        if (active) setCatalog({ status: "error", message: errorMessage(error, t("error.catalogSearch")) });
      });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, catalogRefresh]);

  const discoverPath = (refresh: boolean) => {
    setDiscovery({ status: "loading" });
    window.commandIde.catalog.discover(5000, refresh).then((result) => {
      setDiscovery({ status: "ready", result });
    }, (error: unknown) => {
      rendererLog.error("catalog.discovery_failed", rendererErrorContext(error));
      setDiscovery({ status: "error", message: errorMessage(error, t("error.pathDiscovery")) });
    });
  };

  useEffect(() => {
    discoverPath(false);
  }, []);

  useEffect(() => {
    let active = true;
    window.commandIde.catalog.search("", 100).then((result) => {
      if (active) setLanguageCommands(result.commands);
    }, (error: unknown) => {
      rendererLog.error("editor.catalog_failed", rendererErrorContext(error));
    });
    return () => { active = false; };
  }, []);

  const selected = useMemo(() =>
    catalog.status === "ready"
      ? catalog.result.commands.find((command) => command.id === selectedId) ?? null
      : null,
  [catalog, selectedId]);

  useEffect(() => {
    if (selected === null) {
      setManual({ status: "idle" });
      return;
    }
    let active = true;
    setManual({ status: "loading" });
    window.commandIde.manual.get(selected.id).then((result) => {
      if (active) setManual({ status: "ready", result });
    }, (error: unknown) => {
      rendererLog.error("manual.load_failed", rendererErrorContext(error));
      if (active) setManual({ status: "error", message: errorMessage(error, t("error.manualRetrieval")) });
    });
    return () => { active = false; };
  }, [selected]);

  const terminalRunning = executionState.status === "starting" || executionState.status === "running";
  const currentSaveState = draftSaveState(loadedProject?.program ?? null, executionDraft?.program ?? null);
  const risk = executionDraft?.assessment.level ?? null;
  useEffect(() => {
    rendererLog.info("execution.state_changed", {
      status: executionState.status,
      sessionId,
      riskLevel: risk ?? "none"
    });
  }, [executionState.status, sessionId, risk]);
  const criticalPolicy = criticalExecutionPolicy(
    risk,
    mode,
    executionDraft?.assessment.reviewHash ?? null,
    typedConfirmation
  );
  const reviewReady = executionDraft !== null
    && workingDirectory !== null
    && !criticalPolicy.blocked
    && criticalPolicy.ready;

  const mayReplaceCurrentDraft = (): boolean => {
    if (terminalRunning) {
      window.alert(t("project.cancelBeforeReplace"));
      return false;
    }
    if (currentSaveState !== "unsaved" && currentSaveState !== "changed") return true;
    return window.confirm(t("project.confirmDiscard"));
  };

  const selectCommand = (id: string) => {
    if (id === selectedId) {
      setCommandView("manual");
      setWorkspace("command");
      if (layoutBand === "compact") closeSidebar();
      return;
    }
    if (!mayReplaceCurrentDraft()) return;
    rendererLog.info("command.selection_requested", { commandId: id, interfaceMode: mode.toLowerCase() });
    setExecutionDraft(null);
    setLoadedProject(null);
    setWorkingDirectory(null);
    setExecutionState({ status: "idle" });
    setSessionId(null);
    setSelectedId(id);
    setCommandView("manual");
    setWorkspace("command");
    if (layoutBand === "compact") closeSidebar();
  };

  const openGuidedFromManual = () => {
    setMode("Guided");
    setCommandView(buildCommandView());
    setWorkspace("command");
    focusAfterLayout(() => workspaceContent.current?.focus());
  };

  const openProject = (project: ScriptProject) => {
    const firstCommand = findCommand(project.program);
    const nextMode = firstCommand === undefined ? "Compact" : "Guided";
    rendererLog.info("project.opened", {
      projectId: project.projectId,
      interfaceMode: nextMode.toLowerCase(),
      hasRecognizedCommand: firstCommand !== undefined
    });
    setExecutionDraft(null);
    setLoadedProject(project);
    setWorkingDirectory(null);
    setSelectedId(firstCommand?.commandId ?? "ls");
    setMode(nextMode);
    setCommandView(interfaceModeView(nextMode));
    setExecutionState({ status: "idle" });
    setSessionId(null);
    setWorkspace("command");
  };

  const chooseDirectory = () => {
    void window.commandIde.execution.chooseWorkingDirectory().then((result) => {
      if (result.status === "selected") {
        rendererLog.info("execution.directory_selected", { status: result.status });
        setWorkingDirectory({ token: result.token, label: result.label });
      }
    }, (error: unknown) => {
      rendererLog.error("execution.directory_failed", rendererErrorContext(error));
      setExecutionState({ status: "error", message: errorMessage(error, t("error.directorySelection")) });
    });
  };

  const runExecution = () => {
    if (!reviewReady || executionDraft === null || workingDirectory === null) return;
    rendererLog.info("execution.start_requested", {
      riskLevel: risk ?? "none",
      interfaceMode: mode.toLowerCase(),
      columns: terminalSize.columns,
      rows: terminalSize.rows
    });
    setExecutionState({ status: "starting" });
    setTerminalExpanded(true);
    void window.commandIde.execution.start({
      program: executionDraft.program,
      reviewedScript: executionDraft.assessment.script,
      reviewHash: executionDraft.assessment.reviewHash,
      interfaceMode: mode.toLowerCase() as "guided" | "compact",
      confirmed: true,
      typedConfirmation: risk === "critical" ? typedConfirmation : null,
      workingDirectoryToken: workingDirectory.token,
      columns: terminalSize.columns,
      rows: terminalSize.rows
    }).then((result) => {
      rendererLog.info("execution.started", { sessionId: result.sessionId });
      setSessionId(result.sessionId);
      setExecutionState({ status: "running" });
    }, (error: unknown) => {
      rendererLog.error("execution.start_failed", rendererErrorContext(error));
      setExecutionState({ status: "error", message: errorMessage(error, t("error.executionRejected")) });
    });
  };

  const cancelExecution = () => {
    if (sessionId === null) return;
    rendererLog.info("execution.cancel_requested", { sessionId });
    void window.commandIde.execution.cancel(sessionId).catch((error: unknown) => {
      rendererLog.error("execution.cancel_failed", {
        sessionId,
        ...rendererErrorContext(error)
      });
      setExecutionState({ status: "error", message: errorMessage(error, t("error.cancellation")) });
    });
  };

  const commandContext = workspace === "home" || workspace === "command";

  return (
    <main
      className={`app-shell layout-${layoutBand}${sidebarOpen ? " sidebar-open" : " sidebar-closed"}${inspectorOpen ? " inspector-open" : " inspector-closed"}`}
      data-layout={layoutBand}
      data-active-workspace={workspace}
      ref={appShell}
      style={{
        "--sidebar-width": `${paneSizes.sidebar}px`,
        "--inspector-width": `${paneSizes.inspector}px`,
        "--terminal-height": `${paneSizes.terminal}px`,
        "--terminal-min-height": `${paneBounds.terminal.min}px`
      } as CSSProperties}
    >
      <a className="skip-link" href="#main-workspace">{t("app.skipToWorkspace")}</a>
      <button
        className="drawer-scrim"
        type="button"
        aria-label={t("app.closePanels")}
        tabIndex={-1}
        onClick={() => {
          if (layoutBand === "compact") closeSidebar();
          closeInspector();
        }}
      />
      <nav className="navigation-rail" aria-label={t("app.primaryWorkspaces")}>
        <div className="brand-mark" aria-label={t("app.name")}>&gt;_</div>
        {workspaces.map((workspaceEntry, index) => {
          const workspaceName = t(workspaceEntry.messageId);
          return (
          <button
            className={workspaceEntry.id === workspace ? "rail-button active" : "rail-button"}
            key={workspaceEntry.id}
            type="button"
            data-label={workspaceName}
            data-workspace-id={workspaceEntry.id}
            aria-label={workspaceName}
            aria-current={workspaceEntry.id === workspace ? "page" : undefined}
            aria-keyshortcuts={`Alt+${index + 1}`}
            title={t("app.shortcutTitle", { name: workspaceName, number: index + 1 })}
            onClick={() => {
              if (workspaceEntry.id === "command" && selected === null) {
                setWorkspace("home");
                setSidebarOpen(true);
                focusAfterLayout(() => searchInput.current?.focus());
                return;
              }
              setWorkspace(workspaceEntry.id);
              if (layoutBand === "compact") closeSidebar();
              workspaceContent.current?.focus();
            }}
          >
            <WorkspaceIcon name={workspaceEntry.id} />
          </button>
          );
        })}
      </nav>

      <aside
        className="command-sidebar"
        id="contextual-sidebar"
        ref={sidebar}
        aria-label={t("app.commandCatalog")}
        tabIndex={-1}
      >
        {commandContext ? (
        <>
        <div className="sidebar-chrome">
        <header className="sidebar-heading">
          <div>
            <h1>{t("app.commandCatalog")}</h1>
            <p className="eyebrow">{t("app.findCommand")}</p>
          </div>
          <button
            className="drawer-close"
            type="button"
            aria-label={t("app.hideSidebar")}
            title={t("app.hideSidebar")}
            onClick={() => closeSidebar(true)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </header>
        <label className="search-label">
          <span className="visually-hidden">{t("app.findCommand")}</span>
          <span className="search-control">
            <input
              ref={searchInput}
              type="search"
              aria-keyshortcuts="Control+K Meta+K"
              aria-controls="catalog-results"
              placeholder={t("app.searchPlaceholder")}
              value={query}
              maxLength={200}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  // Search results arrive asynchronously and may finish a React
                  // layout commit in the same frame as this keyboard event. Move
                  // focus after that commit so the latest result node receives it.
                  focusAfterLayout(() => {
                    document.querySelector<HTMLButtonElement>("#catalog-results .command-result")?.focus();
                  });
                } else if (event.key === "Escape" && query.length > 0) {
                  event.stopPropagation();
                  setQuery("");
                }
              }}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query.length > 0 && (
              <button
                type="button"
                data-clear-catalog-search
                aria-label={t("catalog.clearSearch")}
                title={t("catalog.clearSearch")}
                onClick={() => {
                  setQuery("");
                  searchInput.current?.focus();
                }}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            )}
          </span>
        </label>
        </div>
        <div className="pane-scroll-content catalog-scroll">
        <CatalogList
          state={catalog}
          selectedId={selectedId}
          onRetry={() => setCatalogRefresh((value) => value + 1)}
          onSelect={selectCommand}
        />
        <PathDiscovery state={discovery} onRefresh={() => discoverPath(true)} />
        </div>
        </>
        ) : (
          <div className="pane-scroll-content">
          <WorkspaceContextSidebar
            workspace={workspace}
            onFocusWorkspace={() => workspaceContent.current?.focus()}
          />
          </div>
        )}
        <PaneResizeHandle
          label={t("app.resizeSidebar")}
          orientation="vertical"
          value={paneSizes.sidebar}
          min={paneBounds.sidebar.min}
          max={paneBounds.sidebar.max}
          cssVariable="--sidebar-width"
          rootRef={appShell}
          onCommit={(value) => commitPaneSize("sidebar", value)}
        />
      </aside>

      <section className={`workspace${terminalExpanded ? "" : " terminal-collapsed"}`}>
        <header className="workspace-tabs">
          <button
            className="panel-toggle sidebar-toggle"
            ref={sidebarToggle}
            type="button"
            aria-label={sidebarOpen ? t("app.hideSidebar") : t("app.showSidebar")}
            aria-controls="contextual-sidebar"
            aria-expanded={sidebarOpen}
            title={sidebarOpen ? t("app.hideSidebar") : t("app.showSidebar")}
            onClick={() => sidebarOpen ? closeSidebar() : openSidebar()}
          >
            <PanelIcon side="left" />
          </button>
          <div className="workspace-title">
            <h2
              className="tab active"
              id="workspace-heading"
              title={t(workspaces.find((entry) => entry.id === workspace)?.messageId ?? "workspace.home")}
            >
              {t(workspaces.find((entry) => entry.id === workspace)?.messageId ?? "workspace.home")}
            </h2>
            {workspace === "command" && selected !== null && (
              <span className={`mode-context ${mode.toLowerCase()}`} id="mode-context">
                {mode === "Guided" ? t("mode.guidedSummary") : t("mode.compactSummary")}
              </span>
            )}
          </div>
          <div className="workspace-toolbar">
            {workspace === "command" && selected !== null && (
              <div className="command-view-switch" role="tablist" aria-label={t("command.tabsLabel")}>
                {(["manual", "guided", "editor", "review"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={commandView === view}
                    aria-controls="command-workspace-panel"
                    className={commandView === view ? "selected" : ""}
                    aria-keyshortcuts={view === "guided" ? "Alt+G" : view === "editor" ? "Alt+C" : undefined}
                    onClick={() => {
                      setCommandView(view);
                      if (view === "guided") setMode("Guided");
                      if (view === "editor") setMode("Compact");
                      workspaceContent.current?.focus();
                    }}
                  >
                    {t(view === "manual"
                      ? "command.tab.manual"
                      : view === "guided"
                        ? "command.tab.guided"
                        : view === "editor"
                          ? "command.tab.editor"
                          : "command.tab.review")}
                  </button>
                ))}
              </div>
            )}
            {workspace === "command" && selected !== null && commandView === "manual" && (
              <div className="primary-actions" aria-label={t("app.primaryActions")}>
                <button
                  className="build-command"
                  type="button"
                  aria-label={t("command.build")}
                  title={t("command.build")}
                  onClick={openGuidedFromManual}
                >
                  <PrimaryActionIcon name="build" />
                  <span>{t("command.build")}</span>
                </button>
              </div>
            )}
            {workspace === "command" && selected !== null && (commandView === "guided" || commandView === "editor") && (
              <div className="primary-actions" aria-label={t("app.primaryActions")}>
                <button
                  className="build-command"
                  type="button"
                  aria-label={t("app.reviewRun")}
                  title={t("app.reviewRun")}
                  disabled={executionDraft === null}
                  onClick={() => {
                    setCommandView("review");
                    focusAfterLayout(() => workspaceContent.current?.focus());
                  }}
                >
                  <PrimaryActionIcon name="review-run" />
                  <span>{t("app.reviewRun")}</span>
                </button>
              </div>
            )}
          </div>
          <button
            className="panel-toggle inspector-toggle"
            ref={inspectorToggle}
            type="button"
            aria-label={inspectorOpen ? t("app.hideInspector") : t("app.showInspector")}
            aria-controls="command-inspector"
            aria-expanded={inspectorOpen}
            title={inspectorOpen ? t("app.hideInspector") : t("app.showInspector")}
            onClick={() => inspectorOpen ? closeInspector() : openInspector()}
          >
            <PanelIcon side="right" />
          </button>
        </header>

        <div
          className="workspace-content"
          id="main-workspace"
          ref={workspaceContent}
          role="region"
          aria-labelledby="workspace-heading"
          tabIndex={-1}
        >
          {workspace === "command" && (
          <SessionContext
            system={system}
            selectedCommand={selected}
            project={loadedProject}
            draft={executionDraft}
          />
          )}
          {workspace === "home" && (
            <div className="home-workspace">
              <CatalogWelcome
                catalog={catalog}
                onboardingVisible={onboardingVisible}
                onChooseMode={(nextMode) => {
                  setMode(nextMode);
                  setCommandView(interfaceModeView(nextMode));
                  setOnboardingVisible(false);
                  try {
                    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_STORAGE_VALUE);
                  } catch {
                    // First-run guidance can complete in memory when storage is unavailable.
                  }
                  setSidebarOpen(true);
                  focusAfterLayout(() => searchInput.current?.focus());
                }}
              />
              <WorkflowGuide
                hasCommand={selected !== null}
                hasValidatedDraft={executionDraft !== null}
                reviewReady={reviewReady}
                hasRun={executionState.status === "exited"}
              />
              <div className="home-secondary">
              <section className="home-projects" aria-labelledby="home-projects-title">
                <div className="home-section-heading">
                  <div>
                    <p className="eyebrow">{t("project.localEyebrow")}</p>
                    <h2 id="home-projects-title">{t("project.homeTitle")}</h2>
                  </div>
                  <button
                    type="button"
                    disabled={projectImport.status === "working"}
                    onClick={() => {
                      if (!mayReplaceCurrentDraft()) return;
                      setProjectImport({ status: "working", message: t("project.opening") });
                      void window.commandIde.files.importProject().then((result) => {
                        if (result.status === "canceled") {
                          setProjectImport({ status: "idle" });
                          return;
                        }
                        openProject(result.project);
                        setProjectImport({
                          status: "success",
                          message: t("project.imported", { fileName: result.fileName })
                        });
                      }, (error: unknown) => {
                        setProjectImport({ status: "error", message: errorMessage(error, t("error.projectImport")) });
                      });
                    }}
                  >
                    {projectImport.status === "working" ? t("project.importing") : t("project.import")}
                  </button>
                </div>
                {(projectImport.status === "success" || projectImport.status === "error") && (
                  <span className={projectImport.status === "error" ? "error-text" : ""}>{projectImport.message}</span>
                )}
                <RecentProjects
                  state={projects}
                  onRetry={() => setProjectRefresh((value) => value + 1)}
                  onOpen={(projectId) => {
                    if (!mayReplaceCurrentDraft()) return;
                    void window.commandIde.projects.get(projectId).then((result) => {
                      if (result.project !== null) openProject(result.project);
                    }, (error: unknown) => {
                      setProjects({ status: "error", message: errorMessage(error, t("error.projectOpen")) });
                    });
                  }}
                />
              </section>
              <HealthCard
                state={health}
                system={system}
                onRetry={() => {
                  setHealth({ status: "checking" });
                  setSystem({ status: "checking" });
                  setHealthRefresh((value) => value + 1);
                }}
              />
              </div>
            </div>
          )}
          {workspace === "history" && (
            <HistoryView refresh={historyRefresh} />
          )}
          {workspace === "bookmarks" && (
            <BookmarksView
              draft={executionDraft}
              parameters={loadedProject?.parameters ?? []}
              onUse={(bookmark) => {
                if (!mayReplaceCurrentDraft()) return;
                const now = new Date().toISOString();
                const profile = system.status === "ready" ? system.result : null;
                const project: ScriptProject = {
                  schemaVersion: "1.4.0",
                  projectId: crypto.randomUUID(),
                  name: bookmark.name,
                  createdAt: now,
                  updatedAt: now,
                  catalogVersion: catalog.status === "ready" ? catalog.result.catalogVersion : "1.2.0",
                  target: {
                    operatingSystem: profile?.operatingSystem === "linux"
                      || profile?.operatingSystem === "macos"
                      || profile?.operatingSystem === "windows"
                      ? profile.operatingSystem
                      : "linux",
                    architecture: profile?.architecture ?? "x86_64",
                    shellDialect: "bash",
                    distroFamily: profile?.distro?.family ?? null,
                    distroVersion: profile?.distro?.versionId ?? null
                  },
                  program: bookmark.program,
                  layout: { nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
                  parameters: bookmark.parameters
                };
                openProject(project);
              }}
            />
          )}
          {workspace === "ai-assistant" && (
            <AiAssistantView
              currentSource={executionDraft?.assessment.script ?? null}
              onApply={(proposal: AiProposal) => {
                if (!mayReplaceCurrentDraft()) return;
                const now = new Date().toISOString();
                const profile = system.status === "ready" ? system.result : null;
                const project: ScriptProject = {
                  schemaVersion: "1.4.0",
                  projectId: crypto.randomUUID(),
                  name: t("project.aiProposalName", { operation: proposal.operation }),
                  createdAt: now,
                  updatedAt: now,
                  catalogVersion: catalog.status === "ready" ? catalog.result.catalogVersion : "1.2.0",
                  target: {
                    operatingSystem: profile?.operatingSystem === "linux"
                      || profile?.operatingSystem === "macos"
                      || profile?.operatingSystem === "windows"
                      ? profile.operatingSystem
                      : "linux",
                    architecture: profile?.architecture ?? "x86_64",
                    shellDialect: "bash",
                    distroFamily: profile?.distro?.family ?? null,
                    distroVersion: profile?.distro?.versionId ?? null
                  },
                  program: proposal.program,
                  layout: { nodes: [], viewport: { x: 0, y: 0, zoom: 1 } },
                  parameters: []
                };
                openProject(project);
                setExecutionDraft({ program: proposal.program, assessment: proposal.assessment });
                setMode("Compact");
                setCommandView("editor");
              }}
            />
          )}
          {workspace === "settings" && (
            <SettingsView
              desktopEnvironment={desktopEnvironment}
              onShowOnboarding={() => {
                try {
                  window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                } catch {
                  // The walkthrough remains available for this session.
                }
                setOnboardingVisible(true);
                setWorkspace("home");
                setSidebarOpen(true);
                focusAfterLayout(() => document.querySelector<HTMLButtonElement>(".onboarding-actions button")?.focus());
              }}
            />
          )}
          {workspace === "command" && selected === null && (
            <CatalogWelcome
              catalog={catalog}
              onboardingVisible={false}
              onChooseMode={(nextMode) => {
                setMode(nextMode);
                setCommandView(interfaceModeView(nextMode));
                setWorkspace("home");
                setSidebarOpen(true);
                focusAfterLayout(() => searchInput.current?.focus());
              }}
            />
          )}
          {selected !== null && (
            <section
              className="command-workspace-panel"
              id="command-workspace-panel"
              role="tabpanel"
              hidden={workspace !== "command"}
            >
              <div hidden={commandView === "review"}>
                <CommandManual
                  command={selected}
                  view={commandView === "guided"
                    ? "builder"
                    : commandView === "editor"
                      ? "editor"
                      : commandView === "manual"
                        ? "manual"
                        : mode === "Guided" ? "builder" : "editor"}
                  state={manual}
                  system={system}
                  catalogVersion={catalog.status === "ready" ? catalog.result.catalogVersion : "1.2.0"}
                  availableCommands={languageCommands.length > 0
                    ? languageCommands
                    : catalog.status === "ready" ? catalog.result.commands : [selected]}
                  initialProject={loadedProject}
                  onProjectSaved={(project) => {
                    setLoadedProject(project);
                    setProjectRefresh((value) => value + 1);
                  }}
                  onExecutionDraftChange={setExecutionDraft}
                  onBuildCommand={openGuidedFromManual}
                />
              </div>
              {commandView === "review" && (
                <ExecutionReview
                  draft={executionDraft}
                  mode={mode}
                  directory={workingDirectory}
                  state={executionState}
                  typedConfirmation={typedConfirmation}
                  criticalPhrase={criticalPolicy.phrase}
                  criticalBlocked={criticalPolicy.blocked}
                  criticalReady={criticalPolicy.ready}
                  onChooseDirectory={chooseDirectory}
                  onTypedConfirmationChange={setTypedConfirmation}
                  onRun={runExecution}
                  onCancel={cancelExecution}
                  onReturnToEditor={() => setCommandView(interfaceModeView(mode))}
                />
              )}
            </section>
          )}
        </div>

        <TerminalPanel
          draft={executionDraft}
          expanded={terminalExpanded}
          paneRootRef={appShell}
          height={paneSizes.terminal}
          minimumHeight={paneBounds.terminal.min}
          maximumHeight={paneBounds.terminal.max}
          onHeightChange={(value) => commitPaneSize("terminal", value)}
          onToggle={() => setTerminalExpanded((value) => !value)}
          sessionId={sessionId}
          state={executionState}
          onDimensions={(columns, rows) => setTerminalSize({ columns, rows })}
          onExit={(exitStatus) => {
            setExecutionState({ status: "exited", exitStatus });
            setHistoryRefresh((value) => value + 1);
          }}
        />
      </section>

      <aside
        className="inspector"
        id="command-inspector"
        ref={inspector}
        aria-label={t("app.commandInspector")}
        tabIndex={-1}
      >
        <PaneResizeHandle
          label={t("app.resizeInspector")}
          orientation="vertical"
          invert
          value={paneSizes.inspector}
          min={paneBounds.inspector.min}
          max={paneBounds.inspector.max}
          cssVariable="--inspector-width"
          rootRef={appShell}
          onCommit={(value) => commitPaneSize("inspector", value)}
        />
        <div className="pane-scroll-content">
        <div className="inspector-heading">
          <p className="eyebrow">{t("app.inspector")}</p>
          <button
            className="drawer-close"
            type="button"
            aria-label={t("app.hideInspector")}
            title={t("app.hideInspector")}
            onClick={() => closeInspector(true)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <h2>{workspace === "command" ? selected?.displayName ?? t("app.environment") : t("app.environment")}</h2>
        {workspace !== "command" || selected === null ? (
          <EnvironmentDetails health={health} system={system} mode={mode} />
        ) : (
          <>
            <dl>
              <dt>{t("inspector.availability")}</dt><dd className={`availability ${selected.availability}`}>{selected.availability}</dd>
              <dt>{t("inspector.compatibility")}</dt><dd className={`compatibility ${selected.compatibility.status}`}>{selected.compatibility.status}</dd>
              <dt>{t("inspector.target")}</dt><dd>{selected.compatibility.target}</dd>
              <dt>{t("inspector.category")}</dt><dd>{selected.category}</dd>
              <dt>{t("inspector.executable")}</dt><dd>{selected.executable}</dd>
              <dt>{t("inspector.distros")}</dt><dd>{selected.distroFamilies.join(", ") || t("common.any")}</dd>
              <dt>{t("inspector.riskTags")}</dt><dd>{selected.riskTags.join(", ") || t("common.none")}</dd>
              <dt>{t("inspector.options")}</dt><dd>{selected.options.length}</dd>
              <dt>{t("inspector.flagPolicy")}</dt><dd>{selected.shortOptionPolicy}</dd>
              <dt>{t("inspector.catalog")}</dt><dd>{t("inspector.bundled")}</dd>
            </dl>
            <p className="compatibility-note">{selected.compatibility.note}</p>
            <VersionProbe key={selected.id} command={selected} />
          </>
        )}
        </div>
      </aside>
    </main>
  );
}

function PrimaryActionIcon({ name }: { name: "review-run" | "build" }) {
  if (name === "build") {
    return (
      <svg className="primary-action-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4.5 5.5h11v3.5h-11zM4.5 11h11v3.5h-11zM7 7.25h6M7 12.75h4" />
      </svg>
    );
  }
  return (
    <svg className="primary-action-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m3.5 10 2.5 2.5 4-5M12 6.5l5 3.5-5 3.5z" />
    </svg>
  );
}

function WorkspaceContextSidebar({
  workspace,
  onFocusWorkspace
}: {
  workspace: WorkspaceId;
  onFocusWorkspace: () => void;
}) {
  const { t } = useI18n();
  const context = workspace === "ai-assistant"
    ? {
        eyebrow: t("contextSidebar.ai.eyebrow"),
        title: t("contextSidebar.ai.title"),
        description: t("contextSidebar.ai.description"),
        items: [t("contextSidebar.ai.provider"), t("contextSidebar.ai.review"), t("contextSidebar.ai.execute")]
      }
    : workspace === "bookmarks"
      ? {
          eyebrow: t("contextSidebar.bookmarks.eyebrow"),
          title: t("contextSidebar.bookmarks.title"),
          description: t("contextSidebar.bookmarks.description"),
          items: [t("contextSidebar.bookmarks.structured"), t("contextSidebar.bookmarks.parameters"), t("contextSidebar.bookmarks.open")]
        }
      : workspace === "history"
        ? {
            eyebrow: t("contextSidebar.history.eyebrow"),
            title: t("contextSidebar.history.title"),
            description: t("contextSidebar.history.description"),
            items: [t("contextSidebar.history.local"), t("contextSidebar.history.redacted"), t("contextSidebar.history.evidence")]
          }
        : {
            eyebrow: t("contextSidebar.settings.eyebrow"),
            title: t("contextSidebar.settings.title"),
            description: t("contextSidebar.settings.description"),
            items: [t("contextSidebar.settings.appearance"), t("contextSidebar.settings.tools"), t("contextSidebar.settings.legal")]
          };

  return (
    <section className="workspace-context-sidebar">
      <header className="sidebar-heading">
        <div>
          <p className="eyebrow">{context.eyebrow}</p>
          <h1>{context.title}</h1>
        </div>
      </header>
      <p>{context.description}</p>
      <ul>{context.items.map((item) => <li key={item}>{item}</li>)}</ul>
      <button type="button" onClick={onFocusWorkspace}>{t("contextSidebar.focusWorkspace")}</button>
    </section>
  );
}

function PathDiscovery({ state, onRefresh }: {
  state: DiscoveryState;
  onRefresh: () => void;
}) {
  const { formatNumber, plural, t } = useI18n();
  if (state.status === "loading") {
    return <section className="path-discovery"><h2>{t("path.title")}</h2><span>{t("path.scanning")}</span></section>;
  }
  if (state.status === "error") {
    return (
      <section className="path-discovery">
        <h2>{t("path.title")}</h2>
        <span className="error-text">{state.message}</span>
        <button type="button" onClick={onRefresh}>{t("path.retry")}</button>
      </section>
    );
  }
  const enriched = state.result.executables.filter((entry) => entry.catalogCommandId !== null).length;
  const preview = state.result.executables.slice(0, 40);
  return (
    <details className="path-discovery">
      <summary className="path-discovery-heading">
        <h2>{t("path.title")}</h2>
      </summary>
      <div className="path-discovery-body">
      <div className="path-discovery-actions">
        <button type="button" onClick={onRefresh}>{t("common.refresh")}</button>
      </div>
      <p className="path-discovery-stats">{plural(
        { one: "path.unique.one", other: "path.unique.other" },
        state.result.total,
        { count: formatNumber(state.result.total), enriched: formatNumber(enriched) }
      )}</p>
      {state.result.truncated && <p className="warning-text">{t("path.truncated")}</p>}
      {state.result.shadowedCount > 0 && <p>{plural(
        { one: "path.shadowed.one", other: "path.shadowed.other" },
        state.result.shadowedCount,
        { count: formatNumber(state.result.shadowedCount) }
      )}</p>}
      {state.result.skippedUnsafeNames > 0 && <p>{plural(
        { one: "path.unsafe.one", other: "path.unsafe.other" },
        state.result.skippedUnsafeNames,
        { count: formatNumber(state.result.skippedUnsafeNames) }
      )}</p>}
      <details>
        <summary>{t("path.browse")}</summary>
        <ul>
          {preview.map((entry) => (
            <li key={`${entry.executable}:${entry.path}`} title={entry.path}>
              <code>{entry.executable}</code>{entry.catalogCommandId === null ? "" : ` · ${entry.category}`}
            </li>
          ))}
        </ul>
        {state.result.executables.length > preview.length && (
          <small>{t("path.showing", { count: formatNumber(state.result.executables.length) })}</small>
        )}
      </details>
      <small>{state.result.cached ? t("path.cached") : t("path.scanned")}</small>
      </div>
    </details>
  );
}

function VersionProbe({ command }: { command: CommandSpec }) {
  const { t } = useI18n();
  const [state, setState] = useState<VersionState>({ status: "idle" });

  const probe = () => {
    const force = state.status === "ready";
    setState({ status: "loading" });
    window.commandIde.catalog.probeVersion(command.id, force).then((result) => {
      setState({ status: "ready", result });
    }, (error: unknown) => {
      setState({ status: "error", message: errorMessage(error, t("error.versionProbe")) });
    });
  };

  return (
    <section className="version-probe">
      <button type="button" onClick={probe} disabled={state.status === "loading"}>
        {state.status === "ready" ? t("version.refresh") : state.status === "loading" ? t("version.probing") : t("version.probe")}
      </button>
      {state.status === "ready" && (
        <span title={state.result.version ?? state.result.status}>
          {state.result.cached
            ? t("version.cached", { version: state.result.version ?? state.result.status })
            : state.result.version ?? state.result.status}
        </span>
      )}
      {state.status === "error" && <span className="error-text">{state.message}</span>}
      <small>{t("version.safety")}</small>
    </section>
  );
}

function CatalogList({ state, selectedId, onSelect, onRetry }: {
  state: CatalogState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const { formatNumber, plural, t } = useI18n();
  if (state.status === "loading") return <div className="empty-state">{t("catalog.searching")}</div>;
  if (state.status === "error") return (
    <div className="empty-state recovery-state error-text" role="alert">
      <span>{state.message}</span>
      <button type="button" onClick={onRetry}>{t("catalog.retry")}</button>
    </div>
  );
  if (state.result.commands.length === 0) return <div className="empty-state">{t("catalog.noMatches")}</div>;
  return (
    <div className="catalog-results" id="catalog-results" aria-live="polite">
      <span className="result-count">{plural(
        { one: "catalog.count.one", other: "catalog.count.other" },
        state.result.total,
        { count: formatNumber(state.result.total) }
      )}</span>
      {state.result.commands.map((command) => (
        <button
          key={command.id}
          type="button"
          className={selectedId === command.id ? "command-result selected" : "command-result"}
          data-command-id={command.id}
          title={`${command.displayName}: ${command.summary}`}
          onClick={() => onSelect(command.id)}
        >
          <span className={`status-dot ${command.availability}`} aria-hidden="true" />
          <span><strong>{command.displayName}</strong><small>{command.summary}</small></span>
        </button>
      ))}
    </div>
  );
}

function RecentProjects({ state, onOpen, onRetry }: {
  state: ProjectListState;
  onOpen: (projectId: string) => void;
  onRetry: () => void;
}) {
  const { formatDateTime, t } = useI18n();
  if (state.status === "loading") return <section className="recent-projects"><h2>{t("project.recent")}</h2><span>{t("common.loading")}</span></section>;
  if (state.status === "error") return (
    <section className="recent-projects recovery-state" role="alert">
      <h2>{t("project.recent")}</h2>
      <span className="error-text">{state.message}</span>
      <button type="button" onClick={onRetry}>{t("project.retryList")}</button>
    </section>
  );
  if (state.projects.length === 0) return <section className="recent-projects"><h2>{t("project.recent")}</h2><span>{t("project.none")}</span></section>;
  return (
    <section className="recent-projects">
      <h2>{t("project.recent")}</h2>
      {state.projects.map((project) => (
        <button type="button" key={project.projectId} onClick={() => onOpen(project.projectId)}>
          <strong>{project.name}</strong>
          <small>{formatDateTime(project.updatedAt)}</small>
        </button>
      ))}
    </section>
  );
}

function ManualSectionBody({ body }: { body: string }) {
  const { t } = useI18n();
  const blocks = splitManualBlocks(body);
  if (blocks.length === 1 && blocks[0]?.kind === "text") {
    return <pre className="manual-section-body">{blocks[0].body}</pre>;
  }
  const groups: Array<{ kind: "text"; body: string } | { kind: "entries"; items: Array<{ term: string; description: string }> }> = [];
  for (const block of blocks) {
    if (block.kind === "text") {
      groups.push(block);
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.kind === "entries") {
      last.items.push(block);
    } else {
      groups.push({ kind: "entries", items: [block] });
    }
  }
  return (
    <div className="manual-section-stack">
      {groups.map((group, index) => {
        if (group.kind === "text") {
          return <pre className="manual-section-body" key={`text-${index}`}>{group.body}</pre>;
        }
        return (
          <div className="option-list" key={`entries-${index}`}>
            {group.items.map((item, itemIndex) => {
              const formatted = formatOptionDescription(item.description);
              return (
              <div className="option-row" key={`${item.term}:${itemIndex}`}>
                <code>{item.term}</code>
                <div className="option-copy">
                  {formatted.text.length > 0 && <span>{formatted.text}</span>}
                  {formatted.values.length > 0 && (
                    <>
                      <span className="option-values-label">{t("manual.possibleValues")}</span>
                      <ul className="option-values">
                        {formatted.values.map((value) => <li key={value}>{value}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function CommandManual({
  command,
  view,
  state,
  system,
  catalogVersion,
  availableCommands,
  initialProject,
  onProjectSaved,
  onExecutionDraftChange,
  onBuildCommand
}: {
  command: CommandSpec;
  view: "builder" | "editor" | "manual";
  state: ManualState;
  system: SystemState;
  catalogVersion: string;
  availableCommands: CommandSpec[];
  initialProject: ScriptProject | null;
  onProjectSaved: (project: ScriptProject) => void;
  onExecutionDraftChange: (draft: ExecutionDraft | null) => void;
  onBuildCommand: () => void;
}) {
  const { t } = useI18n();
  const manual = state.status === "ready" ? state.result.manual : command.manual;
  const source = state.status === "ready" ? state.result.source : "bundled";
  const guidedCommand = useMemo(() => ({
    ...command,
    options: mergeCommandOptions(command.options, optionsFromManual(manual.sections))
  }), [command, manual]);
  const [draft, setDraft] = useState<{ program: ShellProgram; source: string } | null>(null);
  const [projectId, setProjectId] = useState(() => initialProject?.projectId ?? crypto.randomUUID());
  const [createdAt, setCreatedAt] = useState(() => initialProject?.createdAt ?? new Date().toISOString());
  const [layout, setLayout] = useState<ProjectLayout>(() => initialProject?.layout ?? ({
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  }));
  const [catalogCommandId, setCatalogCommandId] = useState(command.id);
  const [visualAction, setVisualAction] = useState<ProjectActionState>({ status: "idle" });

  useEffect(() => {
    setDraft(null);
    setProjectId(initialProject?.projectId ?? crypto.randomUUID());
    setCreatedAt(initialProject?.createdAt ?? new Date().toISOString());
    setLayout(initialProject?.layout ?? { nodes: [], viewport: { x: 0, y: 0, zoom: 1 } });
    setCatalogCommandId(command.id);
    setVisualAction({ status: "idle" });
    onExecutionDraftChange(null);
  }, [command.id, initialProject?.projectId, initialProject?.updatedAt]);

  const project = useMemo<ScriptProject | null>(() => {
    if (draft === null || system.status !== "ready" || system.result.operatingSystem === "other") return null;
    return {
      schemaVersion: "1.4.0",
      projectId,
      name: initialProject?.name ?? t("manual.projectName", { name: command.displayName }),
      createdAt,
      updatedAt: new Date().toISOString(),
      catalogVersion,
      target: {
        operatingSystem: system.result.operatingSystem,
        architecture: system.result.architecture,
        shellDialect: "bash",
        distroFamily: system.result.distro?.family ?? null,
        distroVersion: system.result.distro?.versionId ?? null
      },
      program: draft.program,
      layout,
      parameters: initialProject?.parameters ?? []
    };
  }, [catalogVersion, command.displayName, createdAt, draft, initialProject, layout, projectId, system, t]);

  return (
    <article className="command-manual">
      <p className="eyebrow">{t("manual.sourceHeading", {
        category: command.category,
        source
      })}</p>
      <h2>{command.displayName}</h2>
      <p className="lede">{command.summary}</p>
      {view === "builder" && (
        <GuidedCommandBuilder
          key={`${command.id}:${initialProject?.projectId ?? "new"}:${initialProject?.updatedAt ?? ""}`}
          command={guidedCommand}
          initialProject={initialProject}
          draftProgram={draft?.program ?? null}
          onDraftChange={(program, draftSource) => setDraft({ program, source: draftSource })}
          onExecutionDraftChange={(program, assessment) => onExecutionDraftChange({ program, assessment })}
        />
      )}
      {view === "editor" && (
        <CompactScriptEditor
          key={`${command.id}:${initialProject?.projectId ?? "new"}:${initialProject?.updatedAt ?? ""}`}
          command={command}
          availableCommands={availableCommands}
          initialProject={initialProject}
          initialSource={draft?.source}
          onDraftChange={(draftSource, program) => setDraft({ program, source: draftSource })}
          onExecutionDraftChange={(program, assessment) => onExecutionDraftChange({ program, assessment })}
        />
      )}
      {view !== "manual" && (
      <>
      <section className="visual-catalog-actions" aria-label={t("manual.addCatalogProgram")}>
        <label>
          {t("manual.addCatalogExample")}
          <select value={catalogCommandId} onChange={(event) => setCatalogCommandId(event.currentTarget.value)}>
            {availableCommands.map((candidate) => (
              <option value={candidate.id} key={candidate.id}>{candidate.displayName}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={draft === null || visualAction.status === "working"}
          onClick={() => {
            const candidate = availableCommands.find((item) => item.id === catalogCommandId);
            if (candidate === undefined || draft === null) return;
            setVisualAction({
              status: "working",
              message: t("manual.adding", { name: candidate.displayName })
            });
            void (async () => {
              try {
                const parsed = await window.commandIde.shell.parse(candidate.examples[0] ?? candidate.executable);
                const program = appendProgram(
                  draft.program,
                  parsed.program,
                  () => `visual-${crypto.randomUUID()}`,
                  t
                );
                const generated = await window.commandIde.shell.generate(program);
                setDraft({ program, source: generated.script });
                setVisualAction({
                  status: "success",
                  message: t("manual.added", {
                    name: candidate.displayName,
                    raw: parsed.preservedRaw ? t("manual.rawSuffix") : ""
                  })
                });
              } catch (error: unknown) {
                setVisualAction({ status: "error", message: errorMessage(error, t("error.catalogInsert")) });
              }
            })();
          }}
        >
          {t("manual.addToProgram")}
        </button>
        {visualAction.status !== "idle" && (
          <span className={visualAction.status === "error" ? "error-text" : ""}>{visualAction.message}</span>
        )}
      </section>
      <ProjectActions
        project={project}
        unavailableMessage={system.status === "error"
          ? system.message
          : system.status !== "ready"
            ? t("project.waitingProfile")
            : system.result.operatingSystem === "other"
              ? t("project.unsupportedOs")
              : t("project.waitingDraft")}
        onProjectSaved={onProjectSaved}
      />
      </>
      )}
      {view === "manual" && (
      <div className="manual-documentation">
      {state.status === "loading" && <p className="manual-status">{t("manual.checkingInstalled")}</p>}
      {state.status === "error" && <p className="manual-status error-text">{t("manual.nativeUnavailable", {
        message: state.message
      })}</p>}
      {state.status === "ready" && state.result.truncated && <p className="manual-status">{t("manual.outputTruncated")}</p>}
      <code className="synopsis">{manual.synopsis}</code>
      {manual.sections.filter((section) => {
        const heading = section.heading.toLowerCase();
        return heading !== "name" && heading !== "synopsis";
      }).map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          <ManualSectionBody body={section.body} />
        </section>
      ))}
      {command.arguments.length > 0 && (
        <section>
          <h3>{t("manual.arguments")}</h3>
          <div className="option-list">
            {command.arguments.map((argument) => (
              <div className="option-row" key={argument.id}>
                <code>{argument.label}{argument.repeatable ? "…" : ""}</code>
                <span>{argument.description} {argument.required ? t("common.required") : t("common.optional")}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>{t("manual.catalogOptions")}</h3>
        <div className="option-list">
          {command.options.map((option) => (
            <div className="option-row" key={option.id}>
              <code>{option.flags.join(", ")}{option.valueName === null ? "" : ` ${option.valueName}`}</code>
              <span>
                {option.description}
                {option.conflictsWith.length > 0
                  ? t("manual.conflicts", { options: option.conflictsWith.join(", ") })
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section><h3>{t("manual.examples")}</h3>{command.examples.map((example) => <pre className="example" key={example}>{example}</pre>)}</section>
      {state.status === "ready" && state.result.tldr !== null && (
        <section className="tldr-supplement">
          <h3>{t("manual.communityExamples")}</h3>
          {state.result.tldr.examples.map((example) => (
            <div className="tldr-example" key={`${example.description}:${example.command}`}>
              <p>{example.description}</p>
              <pre className="example">{example.command}</pre>
            </div>
          ))}
          <div className="tldr-attribution">
            <strong>{state.result.tldr.attribution.source} · {state.result.tldr.attribution.license}</strong>
            <span>{state.result.tldr.attribution.copyright}</span>
            <span>{t("common.source", { source: state.result.tldr.attribution.pageUrl })}</span>
            <span>{t("common.license", { license: state.result.tldr.attribution.licenseUrl })}</span>
            <span>{t("common.revision", {
              revision: state.result.tldr.attribution.sourceRevision,
              date: state.result.tldr.attribution.retrievedAt
            })}</span>
          </div>
        </section>
      )}
      <p className="manual-next">{t("manual.buildHint")}</p>
      <button className="manual-build" type="button" onClick={onBuildCommand}>
        {t("command.build")}
      </button>
      </div>
      )}
    </article>
  );
}

function GuidedCommandBuilder({
  command,
  initialProject,
  draftProgram,
  onDraftChange,
  onExecutionDraftChange
}: {
  command: CommandSpec;
  initialProject: ScriptProject | null;
  draftProgram: ShellProgram | null;
  onDraftChange: (program: ShellProgram, source: string) => void;
  onExecutionDraftChange: (program: ShellProgram, assessment: RiskAssessment) => void;
}) {
  const { t } = useI18n();
  const baseProgram = draftProgram ?? initialProject?.program ?? null;
  const restoredNode = baseProgram === null ? undefined : findCommand(baseProgram, command.id);
  const initialOptions = restoredNode?.options.map((option) => option.optionId)
    ?? (command.id === "ls"
      ? command.options.filter((option) => option.id === "all" || option.id === "long").map((option) => option.id)
      : []);
  const [selectedOptions, setSelectedOptions] = useState<string[]>(initialOptions);
  const [optionValues, setOptionValues] = useState<Record<string, string>>(
    Object.fromEntries(restoredNode?.options.flatMap((option) =>
      option.value === null ? [] : [[option.optionId, option.value]]) ?? [])
  );
  const [argumentValues, setArgumentValues] = useState<Record<string, string>>(
    restoredNode === undefined
      ? (command.id === "ls" ? { files: "." } : {})
      : Object.fromEntries(restoredNode.arguments.map((argument) => [argument.argumentId, argument.value]))
  );
  const [generation, setGeneration] = useState<GenerationState>({
    status: "idle",
    message: t("guided.completeFields")
  });
  const [visualError, setVisualError] = useState<string | null>(null);
  const suppressInitialDraftUpdate = useRef(draftProgram !== null);

  useEffect(() => {
    const selected = command.options.filter((option) => selectedOptions.includes(option.id));
    const missingOptionValue = selected.some((option) =>
      option.takesValue && (optionValues[option.id]?.length ?? 0) === 0);
    const missingArgument = command.arguments.some((argument) =>
      argument.required && (argumentValues[argument.id]?.length ?? 0) === 0);
    if (missingOptionValue || missingArgument) {
      setGeneration({ status: "idle", message: t("guided.completeValues") });
      return;
    }

    const editedCommand: ShellCommandNode = {
      type: "command",
      nodeId: restoredNode?.nodeId ?? `guided-${command.id}`,
      commandId: command.id,
      options: selected.map((option) => ({
          optionId: option.id,
          spelling: option.flags[0] ?? "",
          value: option.takesValue ? (optionValues[option.id] ?? "") : null,
          valueKind: option.takesValue ? "literal" : null
      })),
      arguments: command.arguments.flatMap((argument) => {
        const value = argumentValues[argument.id];
        return value === undefined || value.length === 0
          ? []
          : [{ argumentId: argument.id, value, valueKind: "literal" as const }];
      })
    };
    const program: ShellProgram = baseProgram === null || restoredNode === undefined
      ? { schemaVersion: "1.4.0", dialect: "bash", statements: [editedCommand] }
      : replaceCommandNode(baseProgram, restoredNode.nodeId, editedCommand, t);

    let active = true;
    setGeneration({ status: "loading" });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.commandIde.shell.generate(program);
          const parsed = await window.commandIde.shell.parse(result.script);
          if (parsed.preservedRaw) throw new Error(t("error.generatedRoundTrip"));
          const assessment = await window.commandIde.risk.assess(program);
          if (active) {
            setGeneration({ status: "ready", result, assessment, program });
            onExecutionDraftChange(program, assessment);
            if (suppressInitialDraftUpdate.current) {
              suppressInitialDraftUpdate.current = false;
            } else {
              onDraftChange(program, result.script);
            }
          }
        } catch (error: unknown) {
          if (active) setGeneration({ status: "error", message: errorMessage(error, t("error.generation")) });
        }
      })();
    }, 100);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [argumentValues, command, optionValues, selectedOptions]);

  useEffect(() => {
    if (draftProgram === null || generation.status !== "ready" || generation.program === draftProgram) return;
    let active = true;
    void (async () => {
      try {
        const result = await window.commandIde.shell.generate(draftProgram);
        const [parsed, assessment] = await Promise.all([
          window.commandIde.shell.parse(result.script),
          window.commandIde.risk.assess(draftProgram)
        ]);
        if (parsed.preservedRaw) throw new Error(t("error.visualRoundTrip"));
        if (active) {
          setGeneration({ status: "ready", result, assessment, program: draftProgram });
          onExecutionDraftChange(draftProgram, assessment);
          setVisualError(null);
        }
      } catch (error: unknown) {
        if (active) setVisualError(errorMessage(error, t("error.visualValidation")));
      }
    })();
    return () => { active = false; };
  }, [draftProgram]);

  const toggleOption = (optionId: string, checked: boolean) => {
    setSelectedOptions((current) => checked
      ? [...current, optionId]
      : current.filter((id) => id !== optionId));
  };

  return (
    <section className="guided-builder" aria-label={t("guided.builderLabel", {
      name: command.displayName
    })}>
      <div className="builder-heading"><h3>{t("guided.title")}</h3><span>{t("guided.deterministic")}</span></div>
      <div className={`generated-preview ${generation.status}`}>
        {generation.status === "loading" && <span>{t("guided.generating")}</span>}
        {generation.status === "idle" && <span>{generation.message}</span>}
        {generation.status === "error" && <span role="alert">{generation.message}</span>}
        {generation.status === "ready" && (
          <>
            <code>$ {generation.result.script}</code>
            <span className={`risk-badge ${generation.assessment.level}`} title={t("common.reviewHash", {
              hash: generation.assessment.reviewHash
            })}>
              {t("common.risk", { level: generation.assessment.level })} · {
                generation.result.compacted ? t("guided.flagsCompacted") : t("guided.flagsSeparate")
              }
            </span>
          </>
        )}
      </div>
      {generation.status === "ready" && generation.result.warnings.length > 0 && (
        <ul className="generation-warnings">
          {generation.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      <div className="builder-fields">
        {command.options.map((option) => {
          const checked = selectedOptions.includes(option.id);
          return (
            <div className="builder-option" key={option.id}>
              <label>
                <input type="checkbox" checked={checked} onChange={(event) => toggleOption(option.id, event.currentTarget.checked)} />
                <code>{option.flags.join(", ")}</code>
                <span>{option.description}</span>
              </label>
              {checked && option.takesValue && (
                <input
                  aria-label={t("guided.optionValue", { option: option.id })}
                  value={optionValues[option.id] ?? ""}
                  placeholder={option.valueName ?? t("common.value")}
                  onChange={(event) => setOptionValues((current) => ({ ...current, [option.id]: event.currentTarget.value }))}
                />
              )}
            </div>
          );
        })}
        {command.arguments.map((argument) => (
          <label className="builder-argument" key={argument.id}>
            <span>{argument.label}{argument.required ? " *" : ""}</span>
            <input
              value={argumentValues[argument.id] ?? ""}
              placeholder={argument.description}
              onChange={(event) => setArgumentValues((current) => ({ ...current, [argument.id]: event.currentTarget.value }))}
            />
          </label>
        ))}
      </div>
      {visualError !== null && <p className="visual-edit-error error-text" role="alert">{visualError}</p>}
    </section>
  );
}

function ProjectActions({ project, unavailableMessage, onProjectSaved }: {
  project: ScriptProject | null;
  unavailableMessage: string;
  onProjectSaved: (project: ScriptProject) => void;
}) {
  const { formatNumber, formatTime, plural, t } = useI18n();
  const [state, setState] = useState<ProjectActionState>({ status: "idle" });
  const [strictMode, setStrictMode] = useState(true);
  const [includeSourceComments, setIncludeSourceComments] = useState(true);

  const save = async () => {
    if (project === null) return;
    setState({ status: "working", message: t("project.saving") });
    try {
      const saved = await window.commandIde.projects.save({ ...project, updatedAt: new Date().toISOString() });
      setState({
        status: "success",
        message: t("project.savedAt", { time: formatTime(saved.updatedAt) })
      });
      onProjectSaved(saved);
    } catch (error: unknown) {
      setState({ status: "error", message: errorMessage(error, t("error.projectSave")) });
    }
  };

  const copyCommand = async () => {
    if (project === null) return;
    setState({ status: "working", message: t("project.preparingCopy") });
    try {
      const result = await window.commandIde.clipboard.copyCommand(project.program);
      setState({
        status: "success",
        message: plural(
          { one: "project.copied.one", other: "project.copied.other" },
          result.characters,
          { count: formatNumber(result.characters) }
        )
      });
    } catch (error: unknown) {
      setState({ status: "error", message: errorMessage(error, t("error.commandCopy")) });
    }
  };

  const exportFile = async (format: "project" | "bash" | "markdown") => {
    if (project === null) return;
    const label = format === "project"
      ? t("project.exportLabel.project")
      : format === "bash"
        ? t("project.exportLabel.bash")
        : t("project.exportLabel.markdown");
    setState({ status: "working", message: t("project.preparingExport", { label }) });
    try {
      const result = await window.commandIde.files.export({
        project: { ...project, updatedAt: new Date().toISOString() },
        format,
        strictMode,
        includeSourceComments
      });
      if (result.status === "canceled") {
        setState({ status: "idle" });
        return;
      }
      const syntax = result.syntaxValidation === "passed" ? t("project.syntaxValidated") : "";
      const warnings = result.warnings.length === 0 ? "" : plural(
        { one: "project.warning.one", other: "project.warning.other" },
        result.warnings.length,
        { count: formatNumber(result.warnings.length) }
      );
      setState({
        status: "success",
        message: t("project.savedFile", {
          fileName: result.fileName,
          bytes: formatNumber(result.bytes),
          suffix: `${syntax}${warnings}`
        })
      });
    } catch (error: unknown) {
      setState({
        status: "error",
        message: errorMessage(error, t("project.exportFailed", { label }))
      });
    }
  };

  return (
    <section className="project-actions" aria-label={t("project.actions")}>
      <div className="project-action-buttons">
        <button
          type="button"
          data-primary-project-save
          disabled={project === null || state.status === "working"}
          onClick={() => void save()}
        >
          {t("project.saveLocally")}
        </button>
        <button
          type="button"
          aria-label={t("project.copyExact")}
          disabled={project === null || state.status === "working"}
          onClick={() => void copyCommand()}
        >
          {t("project.copy")}
        </button>
        <button type="button" disabled={project === null || state.status === "working"} onClick={() => void exportFile("project")}>
          {t("project.exportProject")}
        </button>
        <button type="button" disabled={project === null || state.status === "working"} onClick={() => void exportFile("bash")}>
          {t("project.exportBash")}
        </button>
        <button type="button" disabled={project === null || state.status === "working"} onClick={() => void exportFile("markdown")}>
          {t("project.exportRecipe")}
        </button>
      </div>
      <div className="export-options">
        <label><input type="checkbox" checked={strictMode} onChange={(event) => setStrictMode(event.currentTarget.checked)} /> {t("project.strictMode")}</label>
        <label><input type="checkbox" checked={includeSourceComments} onChange={(event) => setIncludeSourceComments(event.currentTarget.checked)} /> {t("project.sourceComments")}</label>
      </div>
      {project === null && <span>{unavailableMessage}</span>}
      {state.status === "working" && <span>{state.message}</span>}
      {state.status === "success" && <span role="status">{state.message}</span>}
      {state.status === "error" && <span className="error-text" role="alert">{state.message}</span>}
    </section>
  );
}

function CompactScriptEditor({
  command,
  availableCommands,
  initialProject,
  initialSource,
  onDraftChange,
  onExecutionDraftChange
}: {
  command: CommandSpec;
  availableCommands: CommandSpec[];
  initialProject: ScriptProject | null;
  initialSource: string | undefined;
  onDraftChange: (source: string, program: ShellProgram) => void;
  onExecutionDraftChange: (program: ShellProgram, assessment: RiskAssessment) => void;
}) {
  const { formatNumber, plural, t } = useI18n();
  const [source, setSource] = useState(initialSource ?? command.examples[0] ?? command.executable);
  const [state, setState] = useState<ParseState>({
    status: "idle",
    message: t("compact.empty")
  });
  useEffect(() => {
    if (initialSource !== undefined) {
      setSource((current) => current === initialSource ? current : initialSource);
    }
  }, [initialSource]);

  useEffect(() => {
    if (initialProject === null || initialSource !== undefined) return;
    let active = true;
    window.commandIde.shell.generate(initialProject.program).then((result) => {
      if (active) setSource(result.script);
    }, (error: unknown) => {
      if (active) setState({ status: "error", message: errorMessage(error, t("error.projectGeneration")) });
    });
    return () => { active = false; };
  }, [initialProject, initialSource]);

  useEffect(() => {
    if (source.length === 0) {
      setState({ status: "idle", message: t("compact.empty") });
      return;
    }
    let active = true;
    setState({ status: "loading" });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.commandIde.shell.parse(source);
          const [canonical, assessment] = await Promise.all([
            window.commandIde.shell.generate(result.program),
            window.commandIde.risk.assess(result.program)
          ]);
          if (active) {
            setState({ status: "ready", result, canonical, assessment });
            onDraftChange(source, result.program);
            onExecutionDraftChange(result.program, assessment);
          }
        } catch (error: unknown) {
          if (active) setState({ status: "error", message: errorMessage(error, t("error.parsing")) });
        }
      })();
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [source]);

  return (
    <section className="compact-editor" aria-label={t("compact.label")}>
      <div className="builder-heading">
        <h3>{t("compact.title")}</h3>
        <span>{t("compact.offline")}</span>
      </div>
      <Suspense fallback={<div className="monaco-bash-editor"><span>{t("compact.loadingEditor")}</span></div>}>
        <MonacoBashEditor
          value={source}
          onChange={setSource}
          commands={availableCommands}
          diagnostics={state.status === "ready" ? state.result.diagnostics : []}
        />
      </Suspense>
      <div className={`parse-summary ${state.status}`} aria-live="polite">
        {state.status === "idle" && <span>{state.message}</span>}
        {state.status === "loading" && <span>{t("compact.parsing")}</span>}
        {state.status === "error" && <span role="alert">{state.message}</span>}
        {state.status === "ready" && (
          <>
            <span>{plural(
              { one: "compact.mapped.one", other: "compact.mapped.other" },
              state.result.sourceSpans.length,
              {
                count: formatNumber(state.result.sourceSpans.length),
                structure: state.result.preservedRaw ? t("compact.raw") : t("compact.structured")
              }
            )}</span>
            <span className={`risk-badge ${state.assessment.level}`} title={t("common.reviewHash", {
              hash: state.assessment.reviewHash
            })}>
              {t("common.risk", { level: state.assessment.level })}
            </span>
          </>
        )}
      </div>
      {state.status === "ready" && state.result.diagnostics.length > 0 && (
        <ul className="parse-diagnostics">
          {state.result.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.startOffset}:${diagnostic.code}:${index}`}>
              <code>{diagnostic.code}</code> {diagnostic.message}
            </li>
          ))}
        </ul>
      )}
      {state.status === "ready" && state.canonical.script !== source && (
        <div className="canonical-preview">
          <span>{t("compact.canonical")}</span>
          <code>{state.canonical.script}</code>
        </div>
      )}
    </section>
  );
}

function ExecutionReview({
  draft,
  mode,
  directory,
  state,
  typedConfirmation,
  criticalPhrase,
  criticalBlocked,
  criticalReady,
  onChooseDirectory,
  onTypedConfirmationChange,
  onRun,
  onCancel,
  onReturnToEditor
}: {
  draft: ExecutionDraft | null;
  mode: "Guided" | "Compact";
  directory: WorkingDirectory | null;
  state: ExecutionState;
  typedConfirmation: string;
  criticalPhrase: string;
  criticalBlocked: boolean;
  criticalReady: boolean;
  onChooseDirectory: () => void;
  onTypedConfirmationChange: (value: string) => void;
  onRun: () => void;
  onCancel: () => void;
  onReturnToEditor: () => void;
}) {
  const { t } = useI18n();
  const running = state.status === "starting" || state.status === "running";
  const risk = draft?.assessment.level ?? null;
  return (
    <article className="execution-review-workspace" aria-labelledby="execution-review-title">
      <header className="review-heading">
        <div>
          <p className="eyebrow">{t("review.eyebrow")}</p>
          <h2 id="execution-review-title">{t("review.title")}</h2>
          <p>{t("review.description")}</p>
        </div>
        <span className={`risk-badge ${risk ?? "none"}`}>
          {risk === null ? t("review.notReady") : t("common.risk", { level: risk })}
        </span>
      </header>
      {draft === null ? (
        <section className="review-empty">
          <p>{t("review.noDraft")}</p>
          <button type="button" onClick={onReturnToEditor}>{t("review.returnToEditor")}</button>
        </section>
      ) : (
        <>
          <dl className="review-summary">
            <div><dt>{t("review.interface")}</dt><dd>{mode === "Guided" ? t("mode.guided") : t("mode.compact")}</dd></div>
            <div><dt>{t("review.risk")}</dt><dd>{t("common.risk", { level: draft.assessment.level })}</dd></div>
            <div title={directory?.label}><dt>{t("review.directory")}</dt><dd>{directory?.label ?? t("review.directoryMissing")}</dd></div>
            <div title={draft.assessment.reviewHash}><dt>{t("review.hash")}</dt><dd><code>{draft.assessment.reviewHash.slice(0, 16)}</code></dd></div>
          </dl>
          <section className="review-script" aria-labelledby="review-script-title">
            <h3 id="review-script-title">{t("review.exactScript")}</h3>
            <pre>{draft.assessment.script}</pre>
          </section>
          <section className="review-evidence" aria-labelledby="review-evidence-title">
            <h3 id="review-evidence-title">{t("review.evidence")}</h3>
            {draft.assessment.evidence.length === 0
              ? <p>{t("review.noEvidence")}</p>
              : (
                <ul>
                  {draft.assessment.evidence.map((evidence) => (
                    <li key={`${evidence.ruleId}:${evidence.nodeId}`}>{evidence.message}</li>
                  ))}
                </ul>
              )}
          </section>
          <section className="review-confirmation" aria-labelledby="review-confirmation-title">
            <h3 id="review-confirmation-title">{t("review.confirmation")}</h3>
            <button type="button" onClick={onChooseDirectory} disabled={running} title={directory?.label}>
              {directory === null
                ? t("terminal.chooseDirectory")
                : t("terminal.directory", { directory: directory.label })}
            </button>
            {criticalBlocked && <p className="error-text">{t("terminal.criticalGuidedBlocked")}</p>}
            {risk === "critical" && mode === "Compact" && (
              <label className="typed-confirmation">
                {t("terminal.typeConfirmation", { phrase: criticalPhrase })}
                <input
                  value={typedConfirmation}
                  onChange={(event) => onTypedConfirmationChange(event.currentTarget.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            )}
          </section>
          <div className="review-actions">
            <button type="button" onClick={onReturnToEditor} disabled={running}>{t("review.returnToEditor")}</button>
            <button
              className="review-run"
              type="button"
              data-primary-run
              onClick={onRun}
              disabled={directory === null || running || criticalBlocked || !criticalReady}
            >
              {state.status === "starting"
                ? t("terminal.starting")
                : risk === "low"
                  ? t("terminal.run")
                  : risk === "critical"
                    ? t("terminal.runCritical")
                    : t("terminal.confirmRun")}
            </button>
            <button type="button" data-primary-cancel onClick={onCancel} disabled={state.status !== "running"}>
              {t("common.cancel")}
            </button>
          </div>
          {state.status === "exited" && <p className="review-status">{t("terminal.exited", { status: state.exitStatus })}</p>}
          {state.status === "error" && <p className="error-text" role="alert">{state.message}</p>}
        </>
      )}
    </article>
  );
}

function TerminalPanel({
  draft,
  expanded,
  paneRootRef,
  height,
  minimumHeight,
  maximumHeight,
  onHeightChange,
  onToggle,
  sessionId,
  state,
  onDimensions,
  onExit
}: {
  draft: ExecutionDraft | null;
  expanded: boolean;
  paneRootRef: RefObject<HTMLElement | null>;
  height: number;
  minimumHeight: number;
  maximumHeight: number;
  onHeightChange: (value: number) => void;
  onToggle: () => void;
  sessionId: string | null;
  state: ExecutionState;
  onDimensions: (columns: number, rows: number) => void;
  onExit: (exitStatus: number) => void;
}) {
  const { t } = useI18n();
  const risk = draft?.assessment.level ?? null;

  return (
    <section className={`terminal-panel${expanded ? "" : " collapsed"}`} aria-label={t("terminal.label")}>
      {expanded && (
        <PaneResizeHandle
          label={t("app.resizeTerminal")}
          orientation="horizontal"
          invert
          value={height}
          min={minimumHeight}
          max={maximumHeight}
          cssVariable="--terminal-height"
          rootRef={paneRootRef}
          onCommit={onHeightChange}
        />
      )}
      <header>
        <button
          className="terminal-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls="local-terminal-content"
          aria-keyshortcuts="Alt+T"
          title={expanded ? t("terminal.collapseTitle") : t("terminal.expandTitle")}
          onClick={onToggle}
        >
          <span aria-hidden="true">{expanded ? "▾" : "▴"}</span>
          {t("terminal.local")}
        </button>
        <span className={`terminal-status ${risk ?? ""}`}>
          {risk === null ? t("terminal.noScript") : t("terminal.riskHash", {
            level: risk,
            hash: draft?.assessment.reviewHash.slice(0, 12) ?? ""
          })}
        </span>
      </header>
      <div className="terminal-workspace" id="local-terminal-content" hidden={!expanded}>
        {sessionId === null && <div className="terminal-empty">{t("terminal.awaitingRun")}</div>}
        <Suspense fallback={<div className="xterm-terminal loading">{t("terminal.loading")}</div>}>
          <XtermTerminal
            sessionId={sessionId}
            onDimensions={onDimensions}
            onExit={onExit}
            onError={(message) => rendererLog.error("terminal.error", { errorMessageCharacters: message.length })}
          />
        </Suspense>
        {state.status === "exited" && <span className="terminal-result">{t("terminal.exited", { status: state.exitStatus })}</span>}
        {state.status === "error" && <span className="terminal-result error-text" role="alert">{state.message}</span>}
      </div>
    </section>
  );
}

function HistoryView({ refresh }: { refresh: number }) {
  const { formatDateTime, t } = useI18n();
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [manualRefresh, setManualRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    window.commandIde.history.list(50).then((result) => {
      if (active) setState({ status: "ready", entries: result.entries });
    }, (error: unknown) => {
      if (active) setState({ status: "error", message: errorMessage(error, t("error.historyRetrieval")) });
    });
    return () => { active = false; };
  }, [refresh, manualRefresh]);

  return (
    <article className="history-view">
      <p className="eyebrow">{t("history.eyebrow")}</p>
      <h2>{t("history.title")}</h2>
      <p className="lede">{t("history.description")}</p>
      {state.status === "loading" && <p>{t("history.loading")}</p>}
      {state.status === "error" && (
        <div className="inline-recovery recovery-state" role="alert">
          <span className="error-text">{state.message}</span>
          <button type="button" onClick={() => setManualRefresh((value) => value + 1)}>
            {t("history.retry")}
          </button>
        </div>
      )}
      {state.status === "ready" && state.entries.length === 0 && <p>{t("history.empty")}</p>}
      {state.status === "ready" && state.entries.length > 0 && (
        <div className="history-list">
          {state.entries.map((entry) => (
            <section key={entry.executionId}>
              <header>
                <strong className={`risk-badge ${entry.riskLevel}`}>{t("common.risk", {
                  level: entry.riskLevel
                })}</strong>
                <span>{formatDateTime(entry.startedAt)}</span>
                <span>{entry.exitStatus === null
                  ? t("history.running")
                  : t("history.exit", { status: entry.exitStatus })}</span>
              </header>
              <pre>{entry.redactedCommandText}</pre>
              <small>{t("history.workingDirectory", {
                directory: entry.workingDirectory
              })}</small>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function BookmarksView({ draft, parameters, onUse }: {
  draft: ExecutionDraft | null;
  parameters: ProjectParameter[];
  onUse: (bookmark: StructuredBookmark) => void;
}) {
  const { formatDateTime, formatNumber, plural, t } = useI18n();
  const [state, setState] = useState<BookmarkState>({ status: "loading" });
  const [name, setName] = useState("");
  const [action, setAction] = useState<ProjectActionState>({ status: "idle" });
  const [refresh, setRefresh] = useState(0);
  const bookmarkParameters = useMemo(
    () => draft === null ? parameters : mergeBookmarkParameters(draft.program, parameters),
    [draft, parameters]
  );

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    window.commandIde.bookmarks.list(100).then((result) => {
      if (active) setState({ status: "ready", bookmarks: result.bookmarks });
    }, (error: unknown) => {
      if (active) setState({ status: "error", message: errorMessage(error, t("error.bookmarkList")) });
    });
    return () => { active = false; };
  }, [refresh]);

  const save = () => {
    if (draft === null || name.trim().length === 0) return;
    setAction({ status: "working", message: t("bookmarks.saving") });
    void window.commandIde.bookmarks.save({
      bookmarkId: null,
      name: name.trim(),
      program: draft.program,
      parameters: bookmarkParameters
    }).then((bookmark) => {
      setName("");
      setAction({ status: "success", message: t("bookmarks.saved", { name: bookmark.name }) });
      setRefresh((value) => value + 1);
    }, (error: unknown) => {
      setAction({ status: "error", message: errorMessage(error, t("error.bookmarkSave")) });
    });
  };

  return (
    <article className="bookmarks-view">
      <p className="eyebrow">{t("bookmarks.eyebrow")}</p>
      <h2>{t("bookmarks.title")}</h2>
      <p className="lede">{t("bookmarks.description")}</p>
      <section className="bookmark-create">
        <label>
          {t("bookmarks.name")}
          <input
            value={name}
            maxLength={120}
            placeholder={t("bookmarks.placeholder")}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          disabled={draft === null || name.trim().length === 0 || action.status === "working"}
          onClick={save}
        >
          {t("bookmarks.saveCurrent")}
        </button>
        {draft === null && <small>{t("bookmarks.openFirst")}</small>}
        {draft !== null && bookmarkParameters.length > 0 && (
          <small>{plural(
            { one: "bookmarks.preserve.one", other: "bookmarks.preserve.other" },
            bookmarkParameters.length,
            { count: formatNumber(bookmarkParameters.length) }
          )}</small>
        )}
        {(action.status === "success" || action.status === "error") && (
          <span className={action.status === "error" ? "error-text" : ""}>{action.message}</span>
        )}
      </section>
      {state.status === "loading" && <p>{t("bookmarks.loading")}</p>}
      {state.status === "error" && (
        <div className="inline-recovery recovery-state" role="alert">
          <span className="error-text">{state.message}</span>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            {t("bookmarks.retry")}
          </button>
        </div>
      )}
      {state.status === "ready" && state.bookmarks.length === 0 && <p>{t("bookmarks.empty")}</p>}
      {state.status === "ready" && state.bookmarks.length > 0 && (
        <div className="bookmark-list">
          {state.bookmarks.map((bookmark) => (
            <section key={bookmark.bookmarkId}>
              <header>
                <strong>{bookmark.name}</strong>
                <span>{formatDateTime(bookmark.updatedAt)}</span>
              </header>
              <p>
                {plural(
                  { one: "bookmarks.nodes.one", other: "bookmarks.nodes.other" },
                  bookmark.program.statements.length,
                  { count: formatNumber(bookmark.program.statements.length) }
                )}
                {" / "}
                {plural(
                  { one: "bookmarks.parameters.one", other: "bookmarks.parameters.other" },
                  bookmark.parameters.length,
                  { count: formatNumber(bookmark.parameters.length) }
                )}
              </p>
              {bookmark.parameters.length > 0 && (
                <div className="bookmark-parameters" aria-label={t("bookmarks.parameterPlaceholders")}>
                  {bookmark.parameters.map((parameter) => (
                    <code key={parameter.name}>
                      ${parameter.name}{parameter.sensitive ? t("bookmarks.sensitive") : ""}
                    </code>
                  ))}
                </div>
              )}
              <div className="bookmark-actions">
                <button type="button" onClick={() => onUse(bookmark)}>{t("bookmarks.openVisual")}</button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    if (!window.confirm(t("bookmarks.confirmDelete", { name: bookmark.name }))) return;
                    void window.commandIde.bookmarks.delete(bookmark.bookmarkId).then(() => {
                      setRefresh((value) => value + 1);
                    }, (error: unknown) => {
                      setAction({ status: "error", message: errorMessage(error, t("error.bookmarkDelete")) });
                    });
                  }}
                >
                  {t("common.delete")}
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}

function SettingsView({ desktopEnvironment, onShowOnboarding }: {
  desktopEnvironment: DesktopEnvironmentState;
  onShowOnboarding: () => void;
}) {
  const { t } = useI18n();
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [state, setState] = useState<ToolingState>({ status: "loading" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    window.commandIde.tooling.detect().then((profile) => {
      if (active) setState({ status: "ready", profile });
    }, (error: unknown) => {
      if (active) setState({ status: "error", message: errorMessage(error, t("error.toolDetection")) });
    });
    return () => { active = false; };
  }, [refresh]);

  return (
    <article className="settings-view">
      <p className="eyebrow">{t("settings.eyebrow")}</p>
      <h2>{t("settings.title")}</h2>
      <p className="lede">{t("settings.description")}</p>
      <section className="appearance-panel" aria-labelledby="appearance-panel-title">
        <div>
          <h3 id="appearance-panel-title">{t("settings.appearance.title")}</h3>
          <p>{t("settings.appearance.description")}</p>
        </div>
        <div className="theme-picker" role="radiogroup" aria-label={t("settings.appearance.themeLabel")}>
          {(["system", "light", "dark"] as const satisfies readonly ThemePreference[]).map((option) => (
            <button
              key={option}
              type="button"
              className={preference === option ? "selected" : ""}
              role="radio"
              aria-checked={preference === option}
              data-theme-option={option}
              onClick={() => setPreference(option)}
            >
              <span className={`theme-swatch ${option}`} aria-hidden="true" />
              {t(`settings.appearance.${option}`)}
            </button>
          ))}
        </div>
        <p className="appearance-status" role="status">
          {t("settings.appearance.active", { theme: t(`settings.appearance.${resolvedTheme}`) })}
        </p>
        <small>{t("settings.appearance.local")}</small>
      </section>
      <section className="desktop-environment-panel" aria-labelledby="desktop-environment-title">
        <div>
          <h3 id="desktop-environment-title">{t("settings.linux.title")}</h3>
          <p>{t("settings.linux.description")}</p>
        </div>
        {desktopEnvironment.status === "loading" && <p>{t("common.loading")}</p>}
        {desktopEnvironment.status === "error" && (
          <p className="error-text" role="alert">{desktopEnvironment.message}</p>
        )}
        {desktopEnvironment.status === "ready" && (
          <dl>
            <dt>{t("settings.linux.platform")}</dt>
            <dd>{desktopEnvironment.profile.platform}</dd>
            <dt>{t("settings.linux.session")}</dt>
            <dd>{desktopEnvironment.profile.sessionType}</dd>
            <dt>{t("settings.linux.desktop")}</dt>
            <dd title={desktopEnvironment.profile.desktop ?? undefined}>
              {desktopEnvironment.profile.desktop ?? t("common.none")}
            </dd>
            <dt>{t("settings.linux.virtualization")}</dt>
            <dd>{desktopEnvironment.profile.virtualization}</dd>
            <dt>{t("settings.linux.graphics")}</dt>
            <dd>{desktopEnvironment.profile.graphicsMode}</dd>
            <dt>{t("settings.linux.transparency")}</dt>
            <dd>{desktopEnvironment.profile.nativeTransparency ? t("common.yes") : t("common.no")}</dd>
          </dl>
        )}
        {desktopEnvironment.status === "ready" && desktopEnvironment.profile.appliedWorkarounds.length > 0 && (
          <p className="startup-workarounds">
            {t("settings.linux.workarounds", {
              values: desktopEnvironment.profile.appliedWorkarounds.join(", ")
            })}
          </p>
        )}
        <small>{t("settings.linux.help")}</small>
      </section>
      <section className="onboarding-settings-panel" aria-labelledby="onboarding-settings-title">
        <div>
          <h3 id="onboarding-settings-title">{t("settings.onboarding.title")}</h3>
          <p>{t("settings.onboarding.description")}</p>
        </div>
        <button type="button" onClick={onShowOnboarding}>{t("settings.onboarding.show")}</button>
      </section>
      <button type="button" onClick={() => setRefresh((value) => value + 1)}>
        {t("settings.refreshTools")}
      </button>
      {state.status === "loading" && <p>{t("settings.inspectingPath")}</p>}
      {state.status === "error" && <p className="error-text" role="alert">{state.message}</p>}
      {state.status === "ready" && (
        <div className="tooling-list">
          {state.profile.tools.map((tool) => (
            <section key={tool.id}>
              <header>
                <strong>{toolDisplayName(tool, t)}</strong>
                <span className={`tool-status ${tool.source}`}>{t(`settings.source.${tool.source}`)}</span>
              </header>
              {tool.executablePath !== null && <code>{tool.executablePath}</code>}
              <p>{toolGuidance(tool, t)}</p>
            </section>
          ))}
        </div>
      )}
      <section className="legal-panel" aria-labelledby="legal-panel-title">
        <h3 id="legal-panel-title">{t("settings.legal.title")}</h3>
        <p>{t("settings.legal.description")}</p>
        <dl>
          <dt>{t("settings.legal.version")}</dt>
          <dd><code>{__COMMAND_IDE_VERSION__}</code></dd>
          <dt>{t("settings.legal.copyrightLabel")}</dt>
          <dd>{t("settings.legal.copyright")}</dd>
          <dt>{t("settings.legal.licenseLabel")}</dt>
          <dd>{t("settings.legal.license")}</dd>
          <dt>{t("settings.legal.source")}</dt>
          <dd><code>{__COMMAND_IDE_SOURCE_REPOSITORY__}</code></dd>
        </dl>
        <p>{t("settings.legal.resources")}</p>
        <p>{t("settings.legal.trademark")}</p>
      </section>
    </article>
  );
}

function WorkflowGuide({ hasCommand, hasValidatedDraft, reviewReady, hasRun }: {
  hasCommand: boolean;
  hasValidatedDraft: boolean;
  reviewReady: boolean;
  hasRun: boolean;
}) {
  const { t } = useI18n();
  const states = workflowProgress(hasCommand, hasValidatedDraft, reviewReady, hasRun);
  const steps = [
    { title: "workflow.choose.title", description: "workflow.choose.description" },
    { title: "workflow.build.title", description: "workflow.build.description" },
    { title: "workflow.review.title", description: "workflow.review.description" },
    { title: "workflow.run.title", description: "workflow.run.description" }
  ] as const satisfies ReadonlyArray<{ title: MessageId; description: MessageId }>;
  return (
    <section className="workflow-guide" aria-label={t("workflow.label")}>
      <header>
        <span>{t("workflow.label")}</span>
        <small>{t("workflow.offline")}</small>
      </header>
      <ol>
        {steps.map((step, index) => {
          const state: WorkflowStepState = states[index] ?? "upcoming";
          return (
            <li className={state} key={step.title}>
              <span className="workflow-step-number" aria-hidden="true">{state === "complete" ? "✓" : index + 1}</span>
              <span>
                <strong>{t(step.title)}</strong>
                <small>{t(step.description)}</small>
              </span>
              <span className="workflow-step-state">
                {t(state === "complete"
                  ? "workflow.state.complete"
                  : state === "active"
                    ? "workflow.state.current"
                    : "workflow.state.next")}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SessionContext({ system, selectedCommand, project, draft }: {
  system: SystemState;
  selectedCommand: CommandSpec | null;
  project: ScriptProject | null;
  draft: ExecutionDraft | null;
}) {
  const { t } = useI18n();
  const saveState: DraftSaveState = draftSaveState(project?.program ?? null, draft?.program ?? null);
  const target = system.status === "ready"
    ? [
        system.result.distro?.prettyName ?? system.result.operatingSystem,
        system.result.architecture,
        system.result.shell.dialect
      ].filter((value) => value !== null && value !== undefined && value !== "").join(" · ")
    : system.status === "error"
      ? t("context.targetUnavailable")
      : t("context.targetDetecting");
  const projectLabel = project?.name
    ?? (selectedCommand === null ? t("context.noSelection") : t("context.newCommand", {
      name: selectedCommand.displayName
    }));
  const saveStateMessage: MessageId = saveState === "none"
    ? "context.draft.none"
    : saveState === "unsaved"
      ? "context.draft.unsaved"
      : saveState === "changed"
        ? "context.draft.changed"
        : "context.draft.saved";
  return (
    <section className="session-context" aria-label={t("context.label")} aria-live="polite">
      <span><strong>{t("context.target")}</strong>{target}</span>
      <span><strong>{t("context.project")}</strong>{projectLabel}</span>
      <span className={`draft-state ${saveState}`}><strong>{t("context.draft")}</strong>{t(saveStateMessage)}</span>
      <span className={`context-risk ${draft?.assessment.level ?? "none"}`}>
        <strong>{t("context.risk")}</strong>
        {draft === null ? t("common.none") : t("common.risk", { level: draft.assessment.level })}
      </span>
      <span className="local-only">{t("context.localOnly")}</span>
    </section>
  );
}

function CatalogWelcome({ catalog, onboardingVisible, onChooseMode }: {
  catalog: CatalogState;
  onboardingVisible: boolean;
  onChooseMode: (mode: "Guided" | "Compact") => void;
}) {
  const { t } = useI18n();
  const heading = catalog.status === "loading"
    ? t("welcome.loadingCatalog")
    : onboardingVisible
      ? t("onboarding.title")
      : t("welcome.chooseCommand");
  return (
    <section className="home-hero">
      <p className="eyebrow">{onboardingVisible ? t("onboarding.eyebrow") : t("welcome.eyebrow")}</p>
      <h2 id={onboardingVisible ? "onboarding-title" : undefined}>{heading}</h2>
      <p className="lede">{onboardingVisible ? t("onboarding.description") : t("welcome.description")}</p>
      {onboardingVisible && (
        <section className="onboarding-panel" aria-labelledby="onboarding-title">
          <div className="onboarding-actions">
            <button type="button" autoFocus onClick={() => onChooseMode("Guided")}>
              <strong>{t("onboarding.guided")}</strong>
              <small>{t("mode.guidedDescription")}</small>
            </button>
            <button type="button" onClick={() => onChooseMode("Compact")}>
              <strong>{t("onboarding.compact")}</strong>
              <small>{t("mode.compactDescription")}</small>
            </button>
          </div>
          <p className="onboarding-privacy">{t("onboarding.privacy")}</p>
        </section>
      )}
    </section>
  );
}

function EnvironmentDetails({ health, system, mode }: { health: HealthState; system: SystemState; mode: string }) {
  const { t } = useI18n();
  return (
    <dl>
      <dt>{t("environment.rendererSandbox")}</dt><dd>{t("environment.enabled")}</dd>
      <dt>{t("environment.worker")}</dt><dd>{health.status}</dd>
      <dt>{t("environment.system")}</dt><dd>{system.status}</dd>
      <dt>{t("environment.networkNeeded")}</dt><dd>{t("common.no")}</dd>
      <dt>{t("environment.interface")}</dt><dd>{mode === "Guided" ? t("mode.guided") : t("mode.compact")}</dd>
    </dl>
  );
}

function HealthCard({ state, system, onRetry }: {
  state: HealthState;
  system: SystemState;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (state.status === "checking") return <section className="health-card checking">{t("health.checking")}</section>;
  if (state.status === "error") return (
    <section className="health-card error" role="alert">
      <strong>{t("error.workerUnavailable")}</strong>
      <span>{state.message}</span>
      <span>{t("health.workerRecovery")}</span>
      <button type="button" onClick={onRetry}>{t("health.retryWorker")}</button>
    </section>
  );
  return (
    <section className="health-card ready">
      <strong>{t("health.ready")}</strong>
      <span>{t("health.protocol", { version: state.result.protocolVersion })}</span>
      <span>{t("health.java", { version: state.result.javaVersion })}</span>
      {system.status === "checking" && <span>{t("health.detecting")}</span>}
      {system.status === "error" && <span>{t("health.environmentError", {
        message: system.message
      })}</span>}
      {system.status === "ready" && <span>{system.result.operatingSystem} / {system.result.architecture} / {system.result.shell.dialect}</span>}
    </section>
  );
}

function toolDisplayName(tool: ToolStatus, t: Translator["t"]): string {
  const key: MessageId = tool.id === "bash-language-server"
    ? "settings.tool.bashLanguageServer"
    : tool.id === "shellcheck"
      ? "settings.tool.shellcheck"
      : "settings.tool.shfmt";
  return t(key);
}

function toolGuidance(tool: ToolStatus, t: Translator["t"]): string {
  if (tool.id === "bash-language-server") {
    return t(tool.source === "bundled"
      ? "settings.guidance.blsBundled"
      : tool.source === "system"
        ? "settings.guidance.blsSystem"
        : "settings.guidance.blsMissing");
  }
  return t(tool.source === "system"
    ? "settings.guidance.optionalSystem"
    : "settings.guidance.optionalMissing");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isCommandNode(node: ShellProgram["statements"][number]): node is ShellCommandNode {
  return node.type === "command";
}

function findCommand(program: ShellProgram, commandId?: string): ShellCommandNode | undefined {
  const visit = (node: ShellProgram["statements"][number]): ShellCommandNode | undefined => {
    if (isCommandNode(node)) return commandId === undefined || node.commandId === commandId ? node : undefined;
    if (node.type === "redirect") return visit(node.subject);
    if (node.type === "pipeline") {
      for (const stage of node.stages) {
        const found = visit(stage);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "boolean-chain") return visit(node.left) ?? visit(node.right);
    if (node.type === "sequence") {
      for (const item of node.items) {
        const found = visit(item);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "block") {
      for (const statement of node.statements) {
        const found = visit(statement);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "function") {
      for (const statement of node.body) {
        const found = visit(statement);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "if") {
      for (const branch of node.branches) {
        const condition = visit(branch.condition);
        if (condition !== undefined) return condition;
        for (const statement of branch.body) {
          const found = visit(statement);
          if (found !== undefined) return found;
        }
      }
      for (const statement of node.elseBody ?? []) {
        const found = visit(statement);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "loop") {
      const condition = visit(node.condition);
      if (condition !== undefined) return condition;
      for (const statement of node.body) {
        const found = visit(statement);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "for") {
      for (const statement of node.body) {
        const found = visit(statement);
        if (found !== undefined) return found;
      }
    }
    if (node.type === "case") {
      for (const arm of node.arms) {
        for (const statement of arm.body) {
          const found = visit(statement);
          if (found !== undefined) return found;
        }
      }
    }
    return undefined;
  };
  for (const statement of program.statements) {
    const found = visit(statement);
    if (found !== undefined) return found;
  }
  return undefined;
}
