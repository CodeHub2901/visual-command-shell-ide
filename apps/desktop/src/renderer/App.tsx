// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  CatalogSearchResult,
  CatalogDiscoveryResult,
  CatalogProbeVersionResult,
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
import { ShellProgramCanvas } from "./ShellProgramCanvas";
import { replaceCommandNode } from "./shell-graph";
import { appendProgram } from "./shell-mutations";
import { mergeBookmarkParameters } from "./bookmark-utils";
import { AiAssistantView } from "./AiAssistantView";
import { resolveAppShortcut } from "./app-shortcuts";
import {
  TERMINAL_LAYOUT_SESSION_KEY,
  terminalExpandedFromStorage,
  terminalStorageValue
} from "./terminal-layout";
import { criticalExecutionPolicy } from "./execution-policy";
import { useI18n, type MessageId, type Translator } from "./i18n";

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

const workspaces = [
  { id: "catalog", messageId: "workspace.catalog" },
  { id: "visual-builder", messageId: "workspace.visualBuilder" },
  { id: "script-editor", messageId: "workspace.scriptEditor" },
  { id: "ai-assistant", messageId: "workspace.aiAssistant" },
  { id: "bookmarks", messageId: "workspace.bookmarks" },
  { id: "history", messageId: "workspace.history" },
  { id: "settings", messageId: "workspace.settings" }
] as const satisfies ReadonlyArray<{ id: string; messageId: MessageId }>;

type WorkspaceId = (typeof workspaces)[number]["id"];

export function App() {
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthState>({ status: "checking" });
  const [system, setSystem] = useState<SystemState>({ status: "checking" });
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
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
  const [workspace, setWorkspace] = useState<WorkspaceId>("catalog");
  const [terminalExpanded, setTerminalExpanded] = useState(() => {
    try {
      return terminalExpandedFromStorage(window.sessionStorage.getItem(TERMINAL_LAYOUT_SESSION_KEY));
    } catch {
      return true;
    }
  });
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [languageCommands, setLanguageCommands] = useState<CommandSpec[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const workspaceContent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = resolveAppShortcut(event);
      if (shortcut === null) return;
      event.preventDefault();
      if (shortcut.kind === "focus-search") {
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      if (shortcut.kind === "mode") {
        setMode(shortcut.mode);
        workspaceContent.current?.focus();
        return;
      }
      if (shortcut.kind === "toggle-terminal") {
        setTerminalExpanded((value) => !value);
        return;
      }
      const target = workspaces[shortcut.index];
      if (target === undefined) return;
      setWorkspace(target.id);
      if (target.id === "visual-builder") setMode("Guided");
      if (target.id === "script-editor") setMode("Compact");
      workspaceContent.current?.focus();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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
    let active = true;
    window.commandIde.health.check().then(async (result) => {
      if (!active) return;
      setHealth({ status: "ready", result });
      try {
        const profile = await window.commandIde.system.detect();
        if (active) setSystem({ status: "ready", result: profile });
      } catch (error: unknown) {
        console.error("System detection failed", error);
        if (active) setSystem({ status: "error", message: errorMessage(error, t("error.systemDetection")) });
      }
    }, (error: unknown) => {
      console.error("Worker health check failed", error);
      if (active) {
        setHealth({ status: "error", message: errorMessage(error, t("error.workerHealth")) });
        setSystem({ status: "error", message: t("error.workerUnavailable") });
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setProjects({ status: "loading" });
    window.commandIde.projects.list(8).then((result) => {
      if (active) setProjects({ status: "ready", projects: result.projects });
    }, (error: unknown) => {
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
            : (result.commands.find((command) => command.id === "ls")?.id ?? result.commands[0]?.id ?? null)
        );
      }, (error: unknown) => {
        console.error("Catalog search failed", error);
        if (active) setCatalog({ status: "error", message: errorMessage(error, t("error.catalogSearch")) });
      });
    }, 120);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const discoverPath = (refresh: boolean) => {
    setDiscovery({ status: "loading" });
    window.commandIde.catalog.discover(5000, refresh).then((result) => {
      setDiscovery({ status: "ready", result });
    }, (error: unknown) => {
      console.error("PATH discovery failed", error);
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
      console.error("Editor catalog loading failed", error);
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
      console.error("Manual retrieval failed", error);
      if (active) setManual({ status: "error", message: errorMessage(error, t("error.manualRetrieval")) });
    });
    return () => { active = false; };
  }, [selected]);

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-workspace">{t("app.skipToWorkspace")}</a>
      <nav className="navigation-rail" aria-label={t("app.primaryWorkspaces")}>
        <div className="brand-mark" aria-label={t("app.name")}>&gt;_</div>
        {workspaces.map((workspaceEntry, index) => {
          const workspaceName = t(workspaceEntry.messageId);
          return (
          <button
            className={workspaceEntry.id === workspace ? "rail-button active" : "rail-button"}
            key={workspaceEntry.id}
            type="button"
            aria-label={workspaceName}
            aria-current={workspaceEntry.id === workspace ? "page" : undefined}
            aria-keyshortcuts={`Alt+${index + 1}`}
            title={t("app.shortcutTitle", { name: workspaceName, number: index + 1 })}
            onClick={() => {
              setWorkspace(workspaceEntry.id);
              if (workspaceEntry.id === "visual-builder") setMode("Guided");
              if (workspaceEntry.id === "script-editor") setMode("Compact");
              workspaceContent.current?.focus();
            }}
          >
            {workspaceName.slice(0, 2).toUpperCase()}
          </button>
          );
        })}
      </nav>

      <aside className="command-sidebar" aria-label={t("app.commandCatalog")}>
        <header>
          <p className="eyebrow">{t("app.offlineWorkspace")}</p>
          <h1>{t("app.commandCatalog")}</h1>
        </header>
        <label className="search-label">
          <span>{t("app.findCommand")}</span>
          <input
            ref={searchInput}
            type="search"
            aria-keyshortcuts="Control+K Meta+K"
            placeholder={t("app.searchPlaceholder")}
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <CatalogList
          state={catalog}
          selectedId={selectedId}
          onSelect={(id) => { setLoadedProject(null); setSelectedId(id); }}
        />
        <PathDiscovery state={discovery} onRefresh={() => discoverPath(true)} />
        <section className="project-import">
          <button
            type="button"
            disabled={projectImport.status === "working"}
            onClick={() => {
              setProjectImport({ status: "working", message: t("project.opening") });
              void window.commandIde.files.importProject().then((result) => {
                if (result.status === "canceled") {
                  setProjectImport({ status: "idle" });
                  return;
                }
                setLoadedProject(result.project);
                const firstCommand = findCommand(result.project.program);
                setSelectedId(firstCommand?.commandId ?? "ls");
                setMode(firstCommand === undefined ? "Compact" : "Guided");
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
          {(projectImport.status === "success" || projectImport.status === "error") && (
            <span className={projectImport.status === "error" ? "error-text" : ""}>{projectImport.message}</span>
          )}
        </section>
        <RecentProjects
          state={projects}
          onOpen={(projectId) => {
            void window.commandIde.projects.get(projectId).then((result) => {
              if (result.project === null) return;
              setLoadedProject(result.project);
              const firstCommand = findCommand(result.project.program);
              setSelectedId(firstCommand?.commandId ?? null);
              setMode("Guided");
            }, (error: unknown) => {
              setProjects({ status: "error", message: errorMessage(error, t("error.projectOpen")) });
            });
          }}
        />
      </aside>

      <section className={`workspace${terminalExpanded ? "" : " terminal-collapsed"}`}>
        <header className="workspace-tabs">
          <h2 className="tab active" id="workspace-heading">
            {t(workspaces.find((entry) => entry.id === workspace)?.messageId ?? "workspace.catalog")}
          </h2>
          <div className="mode-switch" role="group" aria-label={t("app.interfaceMode")}>
            {(["Guided", "Compact"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? "selected" : ""}
                aria-pressed={mode === value}
                aria-keyshortcuts={value === "Guided" ? "Alt+G" : "Alt+C"}
                onClick={() => setMode(value)}
              >
                {value === "Guided" ? t("mode.guided") : t("mode.compact")}
              </button>
            ))}
          </div>
        </header>

        <div
          className="workspace-content"
          id="main-workspace"
          ref={workspaceContent}
          role="region"
          aria-labelledby="workspace-heading"
          tabIndex={-1}
        >
          {workspace === "history" ? (
            <HistoryView refresh={historyRefresh} />
          ) : workspace === "bookmarks" ? (
            <BookmarksView
              draft={executionDraft}
              parameters={loadedProject?.parameters ?? []}
              onUse={(bookmark) => {
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
                setLoadedProject(project);
                setExecutionDraft(null);
                setSelectedId(findCommand(bookmark.program)?.commandId ?? "ls");
                setMode("Guided");
                setWorkspace("visual-builder");
              }}
            />
          ) : workspace === "ai-assistant" ? (
            <AiAssistantView
              currentSource={executionDraft?.assessment.script ?? null}
              onApply={(proposal: AiProposal) => {
                const now = new Date().toISOString();
                const profile = system.status === "ready" ? system.result : null;
                setLoadedProject({
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
                });
                setExecutionDraft({ program: proposal.program, assessment: proposal.assessment });
                setSelectedId(findCommand(proposal.program)?.commandId ?? "ls");
                setMode("Compact");
                setWorkspace("script-editor");
              }}
            />
          ) : workspace === "settings" ? (
            <SettingsView />
          ) : selected === null ? (
            <CatalogWelcome catalog={catalog} health={health} system={system} />
          ) : (
            <CommandManual
              command={selected}
              mode={mode}
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
            />
          )}
        </div>

        <TerminalPanel
          draft={executionDraft}
          mode={mode}
          expanded={terminalExpanded}
          onToggle={() => setTerminalExpanded((value) => !value)}
          onExecutionFinished={() => setHistoryRefresh((value) => value + 1)}
        />
      </section>

      <aside className="inspector" aria-label={t("app.commandInspector")}>
        <p className="eyebrow">{t("app.inspector")}</p>
        <h2>{selected?.displayName ?? t("app.environment")}</h2>
        {selected === null ? (
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
      </aside>
    </main>
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
    <section className="path-discovery">
      <div className="path-discovery-heading">
        <h2>{t("path.title")}</h2>
        <button type="button" onClick={onRefresh}>{t("common.refresh")}</button>
      </div>
      <span>{plural(
        { one: "path.unique.one", other: "path.unique.other" },
        state.result.total,
        { count: formatNumber(state.result.total), enriched: formatNumber(enriched) }
      )}</span>
      {state.result.truncated && <small className="warning-text">{t("path.truncated")}</small>}
      {state.result.shadowedCount > 0 && <small>{plural(
        { one: "path.shadowed.one", other: "path.shadowed.other" },
        state.result.shadowedCount,
        { count: formatNumber(state.result.shadowedCount) }
      )}</small>}
      {state.result.skippedUnsafeNames > 0 && <small>{plural(
        { one: "path.unsafe.one", other: "path.unsafe.other" },
        state.result.skippedUnsafeNames,
        { count: formatNumber(state.result.skippedUnsafeNames) }
      )}</small>}
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
    </section>
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

function CatalogList({ state, selectedId, onSelect }: {
  state: CatalogState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { formatNumber, plural, t } = useI18n();
  if (state.status === "loading") return <div className="empty-state">{t("catalog.searching")}</div>;
  if (state.status === "error") return <div className="empty-state error-text">{state.message}</div>;
  if (state.result.commands.length === 0) return <div className="empty-state">{t("catalog.noMatches")}</div>;
  return (
    <div className="catalog-results" aria-live="polite">
      <span className="result-count">{plural(
        { one: "catalog.count.one", other: "catalog.count.other" },
        state.result.total,
        { count: formatNumber(state.result.total) }
      )}</span>
      {state.result.commands.map((command) => (
        <button key={command.id} type="button" className={selectedId === command.id ? "command-result selected" : "command-result"} onClick={() => onSelect(command.id)}>
          <span className={`status-dot ${command.availability}`} aria-hidden="true" />
          <span><strong>{command.displayName}</strong><small>{command.summary}</small></span>
        </button>
      ))}
    </div>
  );
}

function RecentProjects({ state, onOpen }: {
  state: ProjectListState;
  onOpen: (projectId: string) => void;
}) {
  const { formatDateTime, t } = useI18n();
  if (state.status === "loading") return <section className="recent-projects"><h2>{t("project.recent")}</h2><span>{t("common.loading")}</span></section>;
  if (state.status === "error") return <section className="recent-projects"><h2>{t("project.recent")}</h2><span className="error-text">{state.message}</span></section>;
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

function CommandManual({
  command,
  mode,
  state,
  system,
  catalogVersion,
  availableCommands,
  initialProject,
  onProjectSaved,
  onExecutionDraftChange
}: {
  command: CommandSpec;
  mode: "Guided" | "Compact";
  state: ManualState;
  system: SystemState;
  catalogVersion: string;
  availableCommands: CommandSpec[];
  initialProject: ScriptProject | null;
  onProjectSaved: (project: ScriptProject) => void;
  onExecutionDraftChange: (draft: ExecutionDraft | null) => void;
}) {
  const { t } = useI18n();
  const manual = state.status === "ready" ? state.result.manual : command.manual;
  const source = state.status === "ready" ? state.result.source : "bundled";
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
      {mode === "Guided" && (
        <GuidedCommandBuilder
          key={`${command.id}:${initialProject?.projectId ?? "new"}:${initialProject?.updatedAt ?? ""}`}
          command={command}
          initialProject={initialProject}
          draftProgram={draft?.program ?? null}
          layout={layout}
          onLayoutChange={setLayout}
          onDraftChange={(program, draftSource) => setDraft({ program, source: draftSource })}
          onExecutionDraftChange={(program, assessment) => onExecutionDraftChange({ program, assessment })}
        />
      )}
      {mode === "Compact" && (
        <CompactScriptEditor
          key={`${command.id}:${initialProject?.projectId ?? "new"}:${initialProject?.updatedAt ?? ""}`}
          command={command}
          availableCommands={availableCommands}
          initialProject={initialProject}
          initialSource={draft?.source}
          layout={layout}
          onLayoutChange={setLayout}
          onDraftChange={(draftSource, program) => setDraft({ program, source: draftSource })}
          onExecutionDraftChange={(program, assessment) => onExecutionDraftChange({ program, assessment })}
        />
      )}
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
      {state.status === "loading" && <p className="manual-status">{t("manual.checkingInstalled")}</p>}
      {state.status === "error" && <p className="manual-status error-text">{t("manual.nativeUnavailable", {
        message: state.message
      })}</p>}
      {state.status === "ready" && state.result.truncated && <p className="manual-status">{t("manual.outputTruncated")}</p>}
      <code className="synopsis">{manual.synopsis}</code>
      {manual.sections.map((section) => (
        <section key={section.heading}><h3>{section.heading}</h3><p>{section.body}</p></section>
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
        <h3>{t("manual.curatedOptions")}</h3>
        <div className="option-list">
          {command.options.map((option) => (
            <div className="option-row" key={option.id}>
              <code>{option.flags.join(", ")}{option.valueName === null ? "" : ` ${option.valueName}`}</code>
              {mode === "Guided" && (
                <span>
                  {option.description}
                  {option.conflictsWith.length > 0
                    ? t("manual.conflicts", { options: option.conflictsWith.join(", ") })
                    : ""}
                </span>
              )}
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
    </article>
  );
}

function GuidedCommandBuilder({
  command,
  initialProject,
  draftProgram,
  layout,
  onLayoutChange,
  onDraftChange,
  onExecutionDraftChange
}: {
  command: CommandSpec;
  initialProject: ScriptProject | null;
  draftProgram: ShellProgram | null;
  layout: ProjectLayout;
  onLayoutChange: (layout: ProjectLayout) => void;
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

  const applyVisualProgram = async (program: ShellProgram) => {
    setVisualError(null);
    try {
      const result = await window.commandIde.shell.generate(program);
      const parsed = await window.commandIde.shell.parse(result.script);
      if (parsed.preservedRaw) throw new Error(t("error.visualRoundTrip"));
      const assessment = await window.commandIde.risk.assess(program);
      setGeneration({ status: "ready", result, assessment, program });
      onDraftChange(program, result.script);
      onExecutionDraftChange(program, assessment);
    } catch (error: unknown) {
      setVisualError(errorMessage(error, t("error.visualValidation")));
    }
  };

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
      {generation.status === "ready" && (
        <ShellProgramCanvas
          program={draftProgram ?? generation.program}
          initialLayout={layout}
          onLayoutChange={onLayoutChange}
          onProgramChange={(program) => { void applyVisualProgram(program); }}
          onEditError={setVisualError}
        />
      )}
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
        <button type="button" disabled={project === null || state.status === "working"} onClick={() => void save()}>
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
  layout,
  onLayoutChange,
  onDraftChange,
  onExecutionDraftChange
}: {
  command: CommandSpec;
  availableCommands: CommandSpec[];
  initialProject: ScriptProject | null;
  initialSource: string | undefined;
  layout: ProjectLayout;
  onLayoutChange: (layout: ProjectLayout) => void;
  onDraftChange: (source: string, program: ShellProgram) => void;
  onExecutionDraftChange: (program: ShellProgram, assessment: RiskAssessment) => void;
}) {
  const { formatNumber, plural, t } = useI18n();
  const [source, setSource] = useState(initialSource ?? command.examples[0] ?? command.executable);
  const [state, setState] = useState<ParseState>({
    status: "idle",
    message: t("compact.empty")
  });
  const [visualError, setVisualError] = useState<string | null>(null);

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

  const applyVisualProgram = async (program: ShellProgram) => {
    setVisualError(null);
    try {
      const canonical = await window.commandIde.shell.generate(program);
      setSource(canonical.script);
    } catch (error: unknown) {
      setVisualError(errorMessage(error, t("error.visualValidation")));
    }
  };

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
      {state.status === "ready" && (
        <ShellProgramCanvas
          program={state.result.program}
          initialLayout={layout}
          onLayoutChange={onLayoutChange}
          onProgramChange={(program) => { void applyVisualProgram(program); }}
          onEditError={setVisualError}
        />
      )}
      {visualError !== null && <p className="visual-edit-error error-text" role="alert">{visualError}</p>}
      {state.status === "ready" && state.canonical.script !== source && (
        <div className="canonical-preview">
          <span>{t("compact.canonical")}</span>
          <code>{state.canonical.script}</code>
        </div>
      )}
    </section>
  );
}

function TerminalPanel({ draft, mode, expanded, onToggle, onExecutionFinished }: {
  draft: ExecutionDraft | null;
  mode: "Guided" | "Compact";
  expanded: boolean;
  onToggle: () => void;
  onExecutionFinished: () => void;
}) {
  const { t } = useI18n();
  const [directory, setDirectory] = useState<{ token: string; label: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({ columns: 80, rows: 24 });
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "starting" }
    | { status: "running" }
    | { status: "exited"; exitStatus: number }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    setTypedConfirmation("");
  }, [draft?.assessment.reviewHash]);

  const risk = draft?.assessment.level ?? null;
  const criticalPolicy = criticalExecutionPolicy(
    risk,
    mode,
    draft?.assessment.reviewHash ?? null,
    typedConfirmation
  );
  const criticalPhrase = criticalPolicy.phrase;
  const criticalBlocked = criticalPolicy.blocked;
  const criticalReady = criticalPolicy.ready;
  const running = state.status === "starting" || state.status === "running";

  const chooseDirectory = () => {
    void window.commandIde.execution.chooseWorkingDirectory().then((result) => {
      if (result.status === "selected") {
        setDirectory({ token: result.token, label: result.label });
      }
    }, (error: unknown) => {
      setState({ status: "error", message: errorMessage(error, t("error.directorySelection")) });
    });
  };

  const run = () => {
    if (draft === null || directory === null || criticalBlocked || !criticalReady) return;
    setState({ status: "starting" });
    void window.commandIde.execution.start({
      program: draft.program,
      reviewedScript: draft.assessment.script,
      reviewHash: draft.assessment.reviewHash,
      interfaceMode: mode.toLowerCase() as "guided" | "compact",
      confirmed: true,
      typedConfirmation: risk === "critical" ? typedConfirmation : null,
      workingDirectoryToken: directory.token,
      columns: terminalSize.columns,
      rows: terminalSize.rows
    }).then((result) => {
      setSessionId(result.sessionId);
      setState({ status: "running" });
    }, (error: unknown) => {
      setState({ status: "error", message: errorMessage(error, t("error.executionRejected")) });
    });
  };

  const cancel = () => {
    if (sessionId === null) return;
    void window.commandIde.execution.cancel(sessionId).catch((error: unknown) => {
      setState({ status: "error", message: errorMessage(error, t("error.cancellation")) });
    });
  };

  return (
    <section className={`terminal-panel${expanded ? "" : " collapsed"}`} aria-label={t("terminal.label")}>
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
        <div className="execution-review">
          <div className="execution-controls">
            <button type="button" onClick={chooseDirectory} disabled={running}>
              {directory === null
                ? t("terminal.chooseDirectory")
                : t("terminal.directory", { directory: directory.label })}
            </button>
            <button
              type="button"
              onClick={run}
              disabled={draft === null || directory === null || running || criticalBlocked || !criticalReady}
            >
              {state.status === "starting"
                ? t("terminal.starting")
                : risk === "low"
                  ? t("terminal.run")
                  : risk === "critical"
                    ? t("terminal.runCritical")
                    : t("terminal.confirmRun")}
            </button>
            <button type="button" onClick={cancel} disabled={state.status !== "running"}>{t("common.cancel")}</button>
          </div>
          {draft !== null && (
            <details open={risk === "high" || risk === "critical"}>
              <summary>{t("terminal.review")}</summary>
              <pre>{draft.assessment.script}</pre>
              <ul>
                {draft.assessment.evidence.map((evidence) => (
                  <li key={`${evidence.ruleId}:${evidence.nodeId}`}>{evidence.message}</li>
                ))}
              </ul>
            </details>
          )}
          {criticalBlocked && (
            <span className="error-text">{t("terminal.criticalGuidedBlocked")}</span>
          )}
          {risk === "critical" && mode === "Compact" && (
            <label className="typed-confirmation">
              {t("terminal.typeConfirmation", { phrase: criticalPhrase })}
              <input
                value={typedConfirmation}
                onChange={(event) => setTypedConfirmation(event.currentTarget.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          )}
          {state.status === "exited" && <span>{t("terminal.exited", {
            status: state.exitStatus
          })}</span>}
          {state.status === "error" && <span className="error-text" role="alert">{state.message}</span>}
        </div>
        <Suspense fallback={<div className="xterm-terminal loading">{t("terminal.loading")}</div>}>
          <XtermTerminal
            sessionId={sessionId}
            onDimensions={(columns, rows) => setTerminalSize({ columns, rows })}
            onExit={(exitStatus) => {
              setState({ status: "exited", exitStatus });
              setSessionId(null);
              onExecutionFinished();
            }}
            onError={(message) => setState({ status: "error", message })}
          />
        </Suspense>
      </div>
    </section>
  );
}

function HistoryView({ refresh }: { refresh: number }) {
  const { formatDateTime, t } = useI18n();
  const [state, setState] = useState<HistoryState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    window.commandIde.history.list(50).then((result) => {
      if (active) setState({ status: "ready", entries: result.entries });
    }, (error: unknown) => {
      if (active) setState({ status: "error", message: errorMessage(error, t("error.historyRetrieval")) });
    });
    return () => { active = false; };
  }, [refresh]);

  return (
    <article className="history-view">
      <p className="eyebrow">{t("history.eyebrow")}</p>
      <h2>{t("history.title")}</h2>
      <p className="lede">{t("history.description")}</p>
      {state.status === "loading" && <p>{t("history.loading")}</p>}
      {state.status === "error" && <p className="error-text" role="alert">{state.message}</p>}
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
      {state.status === "error" && <p className="error-text" role="alert">{state.message}</p>}
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

function SettingsView() {
  const { t } = useI18n();
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

function CatalogWelcome({ catalog, health, system }: { catalog: CatalogState; health: HealthState; system: SystemState }) {
  const { t } = useI18n();
  return (
    <>
      <p className="eyebrow">{t("welcome.eyebrow")}</p>
      <h2>{catalog.status === "loading" ? t("welcome.loadingCatalog") : t("welcome.chooseCommand")}</h2>
      <p className="lede">{t("welcome.description")}</p>
      <HealthCard state={health} system={system} />
    </>
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

function HealthCard({ state, system }: { state: HealthState; system: SystemState }) {
  const { t } = useI18n();
  if (state.status === "checking") return <section className="health-card checking">{t("health.checking")}</section>;
  if (state.status === "error") return <section className="health-card error" role="alert"><strong>{t("error.workerUnavailable")}</strong><span>{state.message}</span></section>;
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
