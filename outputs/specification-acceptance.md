# Specification acceptance matrix

Audit date: 2026-07-30

This matrix maps the supplied 106-line product specification to repository
evidence. “Implemented” means the capability exists and has local automated
coverage. “External acceptance” means the implementation and workflow exist,
but a recorded run on the named native target is still required. Later
macOS/Zsh and Windows/PowerShell releases are intentionally outside the Linux
v1 completion gate.

| Spec lines | Requirement | Status | Repository evidence |
| --- | --- | --- | --- |
| 5, 80-82, 97, 105 | Ubuntu 24.04/26.04 and Fedora 44 x86-64 release first; native artifacts and clean-target tests | External acceptance | `apps/desktop/package.json`, `.github/workflows/linux-release.yml`, `tests/integration/installed-health.mjs`; recorded native workflow results and Fedora clean-VM evidence remain required. |
| 9-14 | Electron/React/TypeScript/Vite, Java 21, jlink, private framed stdio JSON-RPC, Apache-2.0, Guided and Compact modes | Implemented | Root/desktop/worker build files, Maven wrapper, `docs/adr/0001-process-boundaries.md`, `docs/adr/0002-framed-json-rpc.md`, `LICENSE`, Electron smoke. No Gradle or Spring Boot is present. |
| 20-22 | Navigation/sidebar/workspaces, React Flow, Monaco, xterm, collapsible terminal | Implemented | `apps/desktop/src/renderer/App.tsx`, `ShellProgramCanvas.tsx`, `MonacoBashEditor.tsx`, `XtermTerminal.tsx`, terminal layout tests and Electron smoke. |
| 23 | Sandboxed renderer, isolation, CSP, blocked navigation, narrow preload | Implemented | `apps/desktop/src/main/security.ts`, `security.test.ts`, renderer CSP, main navigation handlers, validated preload schemas. |
| 27 | Distro, shell, architecture, PATH, executable availability, explicit version probing | Implemented | `SystemDetectionService`, PATH discovery/version-probe services and tests, renderer version-probe action. Version execution is explicit rather than passive for safety. |
| 28-30 | Discover machine commands; enrich named command families; 12 categories; versioned option/risk metadata | Implemented | Four indexed packs with 62 curated commands, bounded full-PATH discovery, three exact distro overlays, catalog schema validation/tests. |
| 31-33 | Semantic man/help/catalog manuals, attributed TLDR, safe rendering | Implemented | `ManualService`, `ManualParser`, 18 revision-pinned TLDR pages and tests. Manuals are normalized to text/semantic records, React escapes values, CSP/navigation controls prevent active content. |
| 37-41 | Versioned ShellProgram, supported Bash parsing, exact raw preservation, canonical generation, safe flag compaction and validation | Implemented | ShellProgram 1.4, parser/generator, contract/unit/property tests (550 structured plus 200 raw cases per Maven run). |
| 42 | Versioned `.cmdbuilder.json` with AST, target, layout, parameters, metadata reference | Implemented | `ScriptProject` 1.4, migrations from 1.0-1.3, project service/repository, import/export and tests. |
| 43 | Copy command; executable Bash, Markdown, and project export; strict mode/comments/parameters; `bash -n` | Implemented | Shared project actions, strict ShellProgram-to-main clipboard path, `ExportService`, native dialogs/atomic writes, contract/main/worker/Electron tests. |
| 44 | Structured bookmarks and placeholders | Implemented | Bookmark contracts/service/repository/UI and worker/Electron tests. |
| 48-49 | Bash Language Server and catalog assistance; optional ShellCheck/shfmt guidance without installation | Implemented | Exact bundled `bash-language-server@5.6.0` runs through Electron's embedded Node runtime; Java validates/owns its isolated bounded LSP lifecycle, disables server-internal optional-tool/background subprocesses, and exposes normalized Monaco providers. Localized provenance, explicit ShellCheck/shfmt actions, Java tests, development Electron smoke, fresh packaged smoke, SBOM, and license-notice evidence are verified. |
| 50-51, 57-58 | Java PTY, xterm streaming/input/resize/cancel/exit/directory, exact reviewed execution, sudo non-retention, local redacted history | Implemented | Pty4J adapter, execution hash reassessment, opaque directory tokens, OSC filter, execution/history tests and integration smoke. Native Linux tests cover success, nonzero exit, input/resize, and process-tree cancellation. |
| 52-56 | Deterministic Low/Medium/High/Critical policy and mode-specific confirmation | Implemented | Context-sensitive risk service and evidence tests: read-only queries Low; writes/signals/network/package queries Medium; deletion/permissions/package changes/download-to-shell/privilege High; mount/system configuration/recursive/raw-wildcard cases Critical. Renderer and Java independently enforce Critical policy. |
| 62-69 | Full AiProvider operations, OpenAI Responses/Structured Outputs, installed Ollama, secure credentials, endpoint policy, typed proposals, no execution | Implemented | Provider interfaces/adapters/services, official OpenAI Java SDK, credential-store adapters, strict proposal contracts, provider/service/RPC/integration/Electron tests. No live key or model download is required by verification. |
| 73-76 | Versioned shared contracts, validation in Electron and Java, safe logs, SQLite without credentials/terminal secrets | Implemented | `v1.*` methods and schemas, strict preload/main/worker parsing, framed stdout with stderr diagnostics, SQLite schema/secret tests. |
| 83-84 | Checksums, SBOM, notices, release/reproducibility docs, open-source governance/templates | Implemented | Release metadata/finalization scripts, CycloneDX and license aggregation, `NOTICE`, README/architecture/security/governance/contribution documents and GitHub templates. Artifact publication still follows native acceptance. |
| 89-91 | Unit/property coverage for compaction, quoting, conflicts, parameters, risk, overlays, export, redaction | Implemented | Contract, Vitest, Maven unit/property suites and the full `pnpm verify` gate. |
| 92 | Catalog/manual/execution checks on all three Linux targets | External acceptance | Native Ubuntu 24.04/26.04 and Fedora 44 workflow jobs are authored; their recorded CI/VM results remain a release gate. |
| 93 | PTY streaming, resize, stdin, cancellation, nonzero exit, tree cleanup, sudo non-retention | Implemented; native Linux run required | Cross-platform service tests pass locally; Linux-only Pty4J tests are present and intentionally skipped on Windows. `tests/integration/pty-throughput.mjs` measures 4 MiB end-to-end through Pty4J and framed JSON-RPC from both source and installed deb/rpm runtimes. |
| 94-95 | Mocked AI failure matrix and no autonomous execution | Implemented | Ollama/OpenAI/provider/service/RPC tests and proposal schema invariant. |
| 96 | Electron E2E across primary workflows, accessibility, keyboard, isolation | Implemented with composite coverage | Electron smoke covers both modes, manuals, semantic visual editing, bookmarks, language tools, clipboard, terminal/history, AI, accessibility focus/shortcuts, and isolation; worker integration covers project reopen/export generation. Native file-dialog/installer behavior is covered by the Linux release workflow. |
| 101-102 | Complete focused Linux MVP and offline core; AI optional | Implemented, native release acceptance pending | Core verification runs with no API key, Ollama model, network service, or system Java runtime for the packaged runtime check. |
| 103 | English initially, localization-ready strings | Implemented | One typed shared English catalog serves React and Electron main; locale-neutral workspace IDs, locale fallback, interpolation, plurals, date/number formatting, native dialogs, graph/editor/terminal helper output, accessibility copy, and inline-string regression guards are verified by `i18n.test.ts`. |
| 104, 106 | No accounts/cloud/SSH/team/plugins/auto-install/telemetry; no Spring Boot | Implemented scope control | No such product capability or dependency exists. |
| 82 | Later signed/notarized macOS/Zsh and signed Windows/PowerShell tracks; WSL later | Post-v1 | Architecture remains adapter-oriented; these are Phases 11-12, not Linux v1 blockers. |

## Current release blockers

1. Record the native `linux-release` workflow on Ubuntu 24.04, Ubuntu 26.04,
   and Fedora 44, including install, launch, PTY execution, uninstall, data
   preservation, and no-system-JDK evidence.
2. Repeat Fedora acceptance on a clean VM if container evidence is not accepted
   for the release sign-off.
3. Complete artifact signing/publication approval.

## In-repository hardening backlog

1. Add support-bundle/log-rotation functionality only if beta operations
   require file-backed diagnostics; stderr already satisfies the protocol
   integrity requirement.
