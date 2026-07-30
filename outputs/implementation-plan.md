# Cross-Platform Visual Command & Shell IDE — Implementation Plan

## 1. Goal and release strategy

Build the specified offline-first desktop IDE with a secure Electron renderer and a bundled Java 21 worker. Deliver Linux x86-64 first for Ubuntu 24.04/26.04 LTS and Fedora 44, then add native macOS/Zsh and Windows/PowerShell tracks.

The Linux MVP includes both Guided and Compact modes, the catalog and manuals, visual/script editing, local PTY execution, projects, bookmarks, history, export, deterministic safety analysis, OpenAI, and installed-Ollama support. AI remains optional; the core product must work without a network connection.

Current checkpoint (2026-07-29): Phases 0-2 are verified using the Maven worker build. Phase 3 has a usable vertical slice with catalog schema 1.2.0, a strictly validated three-pack index, 37 curated commands across all 12 product categories, explicit Ubuntu 24.04/26.04 and Fedora 44 overlays for package, procps-ng, util-linux, iputils, and Git entries, bounded offline search, passive availability checks, and a refreshable full-PATH inventory that preserves PATH precedence, deduplicates executable names, reports shadowing/truncation, filters unsafe names, enriches catalog matches, caches results, and never launches discovered binaries. Overlay schema 1.1 adds validated machine-readable unavailable option IDs; the first source-backed difference removes util-linux 2.40+ `lsblk --filter` from Ubuntu 24.04's 2.39-series command model while retaining it for the 2.41-series Ubuntu 26.04 and Fedora 44 targets. Explicit cached version probes, `man`/`--help`/bundled semantic manuals, sanitized React rendering, and six revision-pinned TLDR supplements with visible page-level CC-BY 4.0 attribution are also verified. Broader command-family and version-specific option coverage remains open. The Phase 4/5/7 vertical path is also verified: ShellProgram 1.4 models commands, redirects, pipelines, Boolean chains, sequences, assignments/exports, whole-word variable references, recursively nested groups/subshells, function definitions, `if`/`elif`/`else`, `for`, `while`, `until`, typed `case` arms, comments, and exact raw blocks; `v1.shell.parse` supplies source spans and loss-preserving diagnostics; 1.0/1.1/1.2/1.3 projects migrate to 1.4; generated structured and raw programs are property-tested over 750 cases per Maven run; nested projects are rendered as a recursive React Flow graph and Guided edits replace a selected command without flattening siblings or control flow; draggable layout is persisted; Compact mode uses a locally bundled, lazy-loaded Monaco Shell editor; unsaved Guided generation and Compact parsing synchronize through shared in-memory draft state; deterministic risk evidence and an exact-script SHA-256 review hash are produced; and secret-checked projects are stored/reopened without persisting approval. Migration-aware `.cmdbuilder.json` import, canonical project/Markdown/Bash artifact generation, shared save/export actions in both editor modes, native Electron dialogs, bounded regular-file reads, and same-directory atomic writes are implemented. Exact Bash artifacts are withheld unless an absolute discovered Bash accepts their bytes with `--noprofile --norc -n`. React Flow now performs validated catalog-example/comment insertion, top-level sequence/pipeline/boolean connections, and safe recursive deletion; the Electron smoke proves a semantic visual mutation survives the Guided-to-Compact transition. PTY execution remains open.

The reviewed-execution Phase 7 vertical slice is now also implemented. It uses
Maven-managed Pty4J, an opaque Electron-owned working-directory choice,
independent Java regeneration/risk/hash validation, mode-specific confirmation,
bounded PTY streaming/input/resize/cancel/exit handling, process-tree cleanup,
lazy xterm rendering with streaming OSC removal, and redacted SQLite history.
Native Pty4J integration tests run on Linux and are skipped on the current
Windows development host. The earlier “PTY execution remains open” sentence in
the checkpoint above is superseded by this paragraph.

The structured-bookmark portion of Phase 5 is implemented as well: versioned
bookmark contracts preserve the full ShellProgram plus parameter records,
derive missing metadata from typed placeholders, reject embedded credentials
and secret defaults in Java, and provide local save/list/reopen/delete workflows
with worker and Electron integration coverage.

The catalog now contains 62 commands in four strictly validated indexed packs;
the earlier 37- and 38-command checkpoint counts are superseded. The
source-checked 24-command expansion covers common Coreutils, Findutils,
procps-ng, systemd, util-linux, Wget, XZ, and GNU Make workflows, with offline
manuals and conservative risk tags. It intentionally adds no overlay override
where behavior does not differ across the tested targets. `sudo` remains
modeled explicitly as High-risk privilege elevation, with authentication
confined to non-retained PTY input.

The TLDR supplement now contains 18 revision-pinned pages; the earlier
six-page checkpoint is superseded. Twelve source-verified additions cover
`cut`, `uniq`, `tee`, `xargs`, `pgrep`, `pkill`, `top`, `findmnt`, `umount`,
`wget`, `xz`, and `make`, each with immutable page URLs, retrieval dates,
copyright notice, and visible CC-BY 4.0 metadata.

The deterministic Phase 7 risk policy was refined on 2026-07-30. Ordinary
deletion and permission/ownership changes are High; recursive destructive
changes, mount mutations, unmounts, persistent system configuration, broad
wildcard deletion, and unsupported raw code are Critical. Read-only control
client and mount inspection operations remain Low. Package queries and
simulation/no transactions are Medium, while real package transactions are
High. Download-to-shell pipelines receive explicit High-risk evidence. Focused
worker, JSON-RPC, execution, parser, and renderer policy tests verify the same
Guided/Compact confirmation contract.

The Phase 5 copy-command action is complete. Both editor modes share a project
action that sends only a validated ShellProgram through preload. Electron main
asks Java to regenerate canonical Bash before owning the bounded plain-text
clipboard write; the renderer provides accessible success/error feedback.
Contract, main-process boundary, and Electron smoke tests cover the path.

The Phase 6 editor-assistance slice is implemented: Monaco uses the full
offline catalog for command completions, metadata-derived option snippets,
compatibility/risk hovers, and inline parser markers. A versioned tooling
profile and Settings view report the bundled Bash Language Server separately
from passively detected optional ShellCheck/shfmt executables. The exact
`bash-language-server@5.6.0` production dependency runs through Electron's
embedded Node runtime with no global installation. The Java worker validates
and owns the process and bounded LSP transport,
including initialization, document lifecycle/versioning, completion, hover,
diagnostics, timeouts, a safe server-request subset, and graceful shutdown.
Electron exposes normalized records only; Monaco merges them with the catalog
fallback and degrades visibly if the bundled server fails. Server-internal
ShellCheck, shfmt, and background-workspace subprocesses are disabled so only
the explicit Java-owned optional-tool actions can run them.
Document symbols and same-document references are connected to Monaco without
exposing server file URIs. ShellCheck and shfmt run only after explicit actions
with fixed arguments, bounded stdin/output, deadlines, and a secret-free
allowlisted environment. ShellCheck markers are deduplicated against equivalent
server diagnostics; shfmt output is a preview until the user applies it. The
specified Phase 6 feature surface is therefore implemented; further
multi-document workspace navigation and richer parser/catalog diagnostic
coalescing remain post-MVP refinements.

The recommended delivery strategy is:

1. Establish security, protocol, and packaging constraints.
2. Build one narrow end-to-end vertical slice.
3. Expand shell semantics and command coverage behind stable contracts.
4. Add optional AI only after deterministic parsing, validation, and risk analysis are authoritative.
5. Harden, package, and smoke-test on clean native Linux targets.

## 2. Architecture baseline

```text
Sandboxed React renderer
        |
        | narrow validated preload API
        v
Electron main process
        |
        | framed JSON-RPC over stdin/stdout
        v
Bundled Java 21 worker
        |
        +-- system detection and catalog
        +-- manuals and TLDR attribution
        +-- ShellProgram parser/generator/validator
        +-- risk engine and export
        +-- SQLite repositories
        +-- PTY/process execution
        +-- OpenAI and Ollama adapters
```

Core decisions to record as ADRs before broad implementation:

- Electron main owns the Java worker lifecycle. The renderer never spawns processes or accesses Node APIs.
- Use length-prefixed UTF-8 JSON-RPC frames (for example, `Content-Length` framing) so scripts and terminal data can safely contain newlines.
- Namespace public methods by major version, such as `v1.system.detect` and `v1.execution.start`.
- Keep protocol schemas in a dedicated `contracts` module. Generate or validate compatible TypeScript and Java representations from the same versioned JSON schemas.
- Validate at both trust boundaries: Electron main/preload and Java request dispatch.
- Standard output is protocol-only. Logs use standard error and rotating files.
- AI adapters can return only `AiProposal`; the execution service accepts only a separate, explicit `ExecutionRequest` initiated by the user.
- Persist ordinary data in SQLite. Credential-store access sits behind a platform abstraction and never falls back to SQLite or plaintext files.

Suggested repository layout:

```text
/
  apps/
    desktop/             Electron, React, TypeScript, Vite
    worker/              Java 21 Maven module
  packages/
    contracts/           JSON schemas, TS types, fixtures
    ui/                  shared React components and themes
  catalog/
    core/                common command metadata
    overlays/            Ubuntu/Fedora/version overlays
    tldr/                attributed, licensed derived content
  tests/
    fixtures/
    e2e/
    integration/
  packaging/
    jlink/
    linux/
  docs/
    adr/
    architecture/
    security/
```

## 3. Phased implementation plan

### Phase 0 — Product boundaries and engineering foundation

Effort: Small. Dependency: none.

Deliverables:

- Convert the specification into acceptance criteria and an explicit v1/non-v1 scope matrix.
- Create ADRs for process boundaries, JSON-RPC framing, schema ownership, SQLite migrations, PTY abstraction, credential storage, and unsupported Bash preservation.
- Establish the monorepo, package manager, Maven wrapper, formatting, linting, unit-test frameworks, license headers, and CI skeleton.
- Add Apache-2.0 `LICENSE`, initial `NOTICE`, README, contribution and security stubs.
- Add dependency/license scanning and secret scanning from the first commit.

Exit gate:

- Desktop and Java modules build on a clean machine.
- CI runs TypeScript and Java checks.
- No product code depends on an HTTP server or open local port.

### Phase 1 — Secure desktop shell and Java protocol

Effort: Medium. Dependency: Phase 0.

Deliverables:

- Electron window with navigation rail, sidebar, tabbed workspace, inspector, and collapsible terminal placeholders.
- Guided/Compact mode preference with localization-ready strings and accessible keyboard navigation foundations.
- Renderer sandbox, context isolation, Node integration disabled, restrictive CSP, navigation/window-open blocking, and explicit external-link handling.
- Narrow preload API with runtime input validation.
- Java worker startup, readiness handshake, request/response correlation, cancellation, timeouts, crash recovery, clean shutdown, and protocol-version negotiation.
- Framing parser tests for partial frames, multiple frames, large payloads, Unicode, malformed JSON, and stdout contamination.

Exit gate:

- An end-to-end `v1.health.check` call succeeds from renderer through Electron to Java.
- Security tests prove the renderer cannot access Node, spawn processes, or navigate to arbitrary content.

### Phase 2 — Shared contracts, persistence, and system detection

Effort: Medium. Dependency: Phase 1.

Deliverables:

- Versioned contracts for `DistroTarget`, `ShellDialect`, `CommandSpec`, `OptionSpec`, `ShellProgram`, `ScriptProject`, `RiskAssessment`, `ExecutionRequest`, `ExecutionEvent`, and `AiProposal`.
- SQLite migrations and repositories for settings, projects, bookmarks, and history.
- Linux detector for `/etc/os-release`, architecture, active/default shell, PATH entries, installed executables, and command versions.
- Redaction utility used before history or logs are written.
- Fixture-based tests for Ubuntu and Fedora detection.

Exit gate:

- The UI displays a validated system profile from the Java worker.
- Database migration forward/rollback tests pass and no credential field exists in the schema.

### Phase 3 — Catalog, discovery, and manual viewer

Effort: Large. Dependency: Phase 2.

Deliverables:

- Catalog schema with metadata versioning, distro availability, arguments, options, conflicts, required values, risk tags, examples, and short-option policy.
- PATH command discovery with deduplication, executable checks, bounded version probing, caching, and refresh.
- Initial curated packs: GNU Coreutils plus a small representative set from procps, systemd, util-linux, iproute2, findutils, archive/network tools, apt/dnf.
- Category/search UI and availability/compatibility indicators.
- Manual pipeline: `man` semantic extraction, then `--help`, then bundled metadata.
- Sanitized rendering for Synopsis, Description, Options, Examples, Exit Codes, Files, and See Also.
- TLDR ingestion with per-page attribution and license notice preservation.

Exit gate:

- A clean target can discover installed commands, search the catalog, and render `ls`, `find`, `ps`, `systemctl`, `ip`, and the native package manager without network access.
- Malicious manual/help fixtures cannot inject scripts, navigation, or active content.

### Phase 4 — ShellProgram AST, Bash parser, generator, and validator

Effort: Extra large; highest semantic risk. Dependency: Phase 2; can overlap late Phase 3.

Deliverables:

- Versioned AST for commands, arguments, pipelines, redirects, sequences, boolean chains, variables, assignments, control flow, functions, comments, grouped blocks, subshells, and raw code.
- Bash lexer/parser with source spans and explicit supported-syntax boundaries.
- `RawCodeNode` preservation for heredocs, unusual expansion, extensions, and unsupported constructs.
- Canonical Bash generator that retains comments and raw blocks.
- Deterministic quoting, placeholders, validation, conflicts, redirects, command availability, and distro compatibility.
- Metadata-driven flag compaction. `ls -a -l` may become `ls -al`; value-taking, long, incompatible, or non-combinable flags remain separate.
- Property tests for supported AST → Bash → AST semantics and exact raw-block preservation.

Exit gate:

- The complete specified supported syntax passes semantic round-trip tests.
- Parser failures never discard source text; they produce a diagnostic and preserved raw node/project state.

### Phase 5 — Visual Builder, projects, bookmarks, and export

Effort: Large. Dependencies: Phases 3 and 4.

Deliverables:

- React Flow canvas with command, pipe, redirect, sequence/boolean, variable, control-flow, function, comment, group/subshell, and raw-code nodes.
- Catalog drag/add workflow and metadata-driven option/argument forms.
- Bidirectional Monaco/canvas synchronization with debouncing, conflict handling, and clear unsupported-node presentation.
- `.cmdbuilder.json` load/save/migrate support including AST, target, layout, parameters, and metadata references.
- Structured bookmarks and parameter placeholders.
- Copy command, executable Bash export, Markdown recipe export, optional strict mode, provenance/source comments, and mandatory `bash -n` validation before `.sh` save.

Exit gate:

- A project can be created visually, edited as Bash, reopened, changed again visually, and exported without semantic loss for supported constructs.
- Older fixture versions migrate deterministically or fail with a non-destructive explanation.

### Phase 6 — Bash IDE and language tooling

Effort: Medium to large. Dependencies: Phases 3 and 4.

Deliverables:

- Monaco Bash editor integration.
- Bash Language Server lifecycle and LSP transport.
- Completion, hover, symbols, references, and diagnostics.
- Catalog-aware command, option, distro, and availability completions.
- Optional ShellCheck/shfmt detection and installation guidance; never install automatically.
- Diagnostics merging/deduplication across parser, catalog, language server, and optional tools.

Exit gate:

- Editor features work offline and degrade cleanly if optional system tools are missing.
- No diagnostic source silently rewrites the reviewed script.

### Phase 7 — Deterministic risk engine, PTY execution, and history

Effort: Extra large; highest native/security risk. Dependencies: Phases 1, 2, and 4. Prototype PTY earlier during Phase 1.

Deliverables:

- Rule-based risk engine with evidence, level, matched nodes/tokens, and required confirmation action.
- Guided/Compact policy enforcement for Low, Medium, High, and Critical operations.
- Java PTY abstraction with pty4j evaluation/adapter, output streaming, stdin, resize, cancellation, exit status, working directory, and process-tree cleanup.
- Exact reviewed-script execution with immutable review hash/version checked at execution time.
- Sudo interaction entirely inside PTY; password data excluded from application events, logs, history, crash reports, and AI inputs.
- Local history with timestamps, working directory, status, and redacted command text.

Exit gate:

- Tests cover streaming, resize, stdin, cancellation, nonzero exits, worker crash, orphan cleanup, and sudo non-retention.
- No AI method can create an execution event, and no changed script can reuse approval for an older review hash.

Current implementation checkpoint (2026-07-30):

- Complete: evidence-bearing Low/Medium/High/Critical assessment over the
  complete ShellProgram tree, exact generated-script hashing, and independent
  reassessment at execution time.
- Complete: context-sensitive rules for read-only system inspection, ordinary
  versus recursive deletion and permission changes, mount mutations,
  persistent system configuration, privilege elevation, and downloaded content
  piped to a shell.
- Complete: Guided disables Critical execution; Compact requires the exact
  review-hash phrase. Java enforces both policies independently of the renderer.
- Complete: bounded PTY execution, terminal streaming/input/resize/cancel,
  process-tree cleanup, OSC filtering, and redacted local history.

### Phase 8 — AI provider layer and proposal workflow

Effort: Large. Dependencies: Phases 4 and 7 safety contracts.

Deliverables:

- Provider-neutral `AiProvider` interface and settings UI.
- OpenAI Java adapter using the Responses API and typed Structured Outputs for `AiProposal`.
- Configurable OpenAI model default; preserve the specification's `gpt-5.6` family alias initially, while keeping the picker/config capable of explicit model IDs.
- OS credential-store adapter; session-memory fallback only when secure storage is unavailable.
- Ollama adapter with loopback-by-default endpoint validation, installed-model enumeration, structured-output probing, required model selection, timeouts, and missing-service handling.
- Schema validation, refusal/malformed-output handling, normal parser/syntax/risk passes, and visible assumptions/warnings.
- Stable privacy-preserving safety identifier for applicable OpenAI end-user requests.
- Provider contract tests with no live key required; optional quarantined live smoke tests.

Exit gate:

- Valid, malformed, refused, timed-out, offline, missing-Ollama, and unsupported-model cases are covered.
- AI output always lands in a reviewable proposal and cannot invoke execution.

Implementation note: the current official Java SDK documents Responses as its primary API and supports typed Structured Outputs through Java classes. Pin the SDK version through dependency management, but resolve the exact version during implementation rather than freezing a plan-time version.

Current implementation checkpoint (2026-07-30):

- Complete: provider-neutral Java proposal interfaces, strict shared/RPC
  contracts, normal secret/syntax/parser/generator/risk validation, installed
  Ollama enumeration, connection testing, structured-output probe, all five
  proposal operations, refusal/failure handling, remote endpoint safeguards,
  OpenAI Responses/typed-Structured-Outputs support, stable safety identifier,
  write-only credential RPC, Windows Credential Manager, macOS Keychain, Linux
  Secret Service and session-memory adapters, Electron bridge, and
  proposal review/apply-to-unsaved-editor UI.
- Verified: mocked success, refusal, malformed output, missing/offline service,
  timeout/failure, unsupported model/capability, official SDK schema derivation,
  strict structured-output decoding, credential metadata/fallback behavior,
  invalid RPC fields, and no-execution-reference invariants. Worker and Electron
  smoke tests require neither a live API key nor a model download.
- Release-matrix follow-up: exercise secure-store mutation tests on clean
  Windows, macOS, and Linux CI/VM images without exposing test credentials.

### Phase 9 — Product hardening and complete Linux MVP

Effort: Large. Dependencies: Phases 3–8.

Deliverables:

- Finish command packs and distro overlays for the specified command families.
- Accessibility review, keyboard navigation, focus behavior, contrast, reduced motion, and screen-reader labels.
- Electron E2E coverage for both interfaces and all primary workflows.
- Performance budgets for startup, catalog search, manual rendering, large scripts, canvas size, and terminal throughput.
- Threat model and abuse cases covering renderer compromise, protocol spoofing, manual injection, path hijacking, unsafe target expansion, credential leakage, and approval bypass.
- Crash recovery, corrupt-project/database handling, backups where appropriate, log rotation, and support bundle redaction.
- Documentation: architecture, schema, contribution, code of conduct, security, governance, attribution, third-party notices, and templates.

Current implementation checkpoint (2026-07-29):

- Complete: keyboard workspace/mode/search shortcuts, skip navigation, explicit
  focus movement and selection state, reduced-motion and forced-color CSS,
  screen-reader region labels, an Alt+T accessible terminal disclosure that
  preserves active PTY state, deterministic shortcut tests, and Electron focus
  smoke coverage.
- Complete: worker startup recovery for a corrupt SQLite file. The damaged
  database (and WAL/SHM companions when present) is preserved under a unique
  local backup name before a fresh schema is created.
- Complete: initial worker startup, warm-search, manual, 2,000-line parse, and
  risk performance ceilings with observed values emitted by verification.
- Complete: deterministic 1,000-node canvas projection and sustained
  20-million-character terminal-output filtering budgets exercise production
  renderer helpers and report observed values in the verification gate.
- Complete: a typed shared English message catalog now covers React,
  accessibility text, visual/editor/terminal helper output, asynchronous
  fallbacks, and Electron native dialogs. Locale-neutral workspace IDs,
  fallback, interpolation, plural, date/number formatting, and inline-copy
  regression guards make additional locales an additive catalog task.
- In progress: remaining interactive large-canvas/end-to-end PTY native
  measurements, complete command
  packs, log/support-bundle work, and the three-distribution acceptance matrix.

Exit gate:

- Linux MVP acceptance suite passes in Ubuntu 24.04, Ubuntu 26.04, and Fedora 44 environments.
- All known high/critical security findings are resolved or explicitly block release.

### Phase 10 — Linux packaging and beta release

Effort: Medium to large. Dependency: Phase 9.

Deliverables:

- Minimal Java runtime via `jlink` with reproducible module configuration.
- Native electron-builder AppImage, `.deb`, and `.rpm` pipelines.
- Native PTY libraries and language-server assets bundled and verified.
- SBOM, checksums, third-party notices, release notes, and reproducible build guide.
- Clean-VM installer/uninstaller and first-run smoke tests.
- Beta issue templates, diagnostic instructions, and release-blocker triage process.

Current implementation checkpoint (2026-07-29):

- Complete: Maven `runtime-image` profile with an explicit jlink module set,
  packaged Java executable resolution, Maven/runtime integration smoke, and an
  unpacked native Electron smoke that succeeds with system Java overrides
  cleared.
- Complete: electron-builder wiring for the runtime and shaded worker,
  AppImage/deb/rpm commands, reproducible Linux build instructions, draft beta
  notes, governance, bug/PR templates, and expanded notices.
- Complete: deterministic Maven and pnpm dependency inventories, Java/Node/
  combined CycloneDX 1.6 SBOMs, complete license-text aggregation, embedded
  release metadata, sorted SHA-256 manifests, tamper/package-format
  verification, and a native Linux build plus Ubuntu 24.04/26.04 and Fedora 44
  installer smoke workflow.
- Complete: an original repository-native SVG application mark, deterministic
  packaging-asset policy checks, and synchronized Linux desktop-name/WM_CLASS
  metadata. The packaged Windows executable confirms the generated icon path.
- Pending: recorded native workflow results, Fedora clean-VM evidence,
  artifact signing, and publication approval.

Exit gate:

- Each artifact installs and runs on a clean supported OS without a system JDK.
- Checksums/SBOM match published artifacts and uninstall does not delete user projects.

### Phase 11 — macOS/Zsh release track

Effort: Extra large. Dependency: stable Linux contracts.

- Add macOS system/credential/PTTY adapters, Zsh dialect/catalog/parser differences, ARM64/x86-64 packaging as selected, hardened runtime, signing, notarization, and DMG smoke tests.
- Reuse contracts and UI while keeping shell-specific parsing, completion, execution, and risk rules behind adapters.

### Phase 12 — Windows/PowerShell release track

Effort: Extra large. Dependency: stable Linux contracts.

- Add Windows detection, credential and ConPTY adapters, native PowerShell AST/catalog implementation, quoting/risk rules, code signing, NSIS packaging, and clean-VM tests.
- Treat WSL as a separate later environment rather than silently routing PowerShell work through WSL.

## 4. Critical path and parallel workstreams

Critical path:

```text
Foundation → secure protocol → contracts/system → ShellProgram semantics
           → visual/editor integration → risk/PTTY execution → hardening → packaging
```

After Phase 2, work can proceed in parallel:

- Catalog/manual workstream: command packs, discovery, docs extraction, attribution.
- Shell semantics workstream: AST, parser, generator, validation, property tests.
- Desktop UX workstream: shell layout, accessibility, mode behavior, tab/workspace model.
- Native execution spike: PTY streaming and process-tree cleanup on all three Linux targets.

AI starts only after proposal, parser, validator, risk, and execution boundaries are stable. Packaging experiments should begin early, but release packaging completes after hardening.

## 5. Recommended first vertical slice

Implement this before broad command or syntax coverage:

1. Detect distro, Bash, architecture, PATH, and the installed `ls` version.
2. Load curated `ls` metadata and render its manual/help fallback.
3. Build `ls -a -l <path>` in Guided mode.
4. Compact it deterministically to `ls -al <path>` when metadata allows.
5. Show validation and a Low risk assessment.
6. Execute the exact reviewed command in the Java PTY and stream it to xterm.js.
7. Save a redacted history entry and a structured bookmark.
8. Reopen it in Compact mode and export a `bash -n`-validated script.

This slice proves the complete trust and data path without waiting for the full catalog or Bash grammar.

## 6. Test strategy by layer

- Contract tests: schema compatibility, unknown fields, version negotiation, invalid payload rejection.
- Unit tests: quoting, option compaction, conflicts, placeholders, risk rules, redaction, distro overlays, exports.
- Property tests: supported AST semantic round trips and exact raw-code preservation.
- Fixture tests: os-release, PATH discovery, command versions, `man`/`--help`, malformed manuals, catalog migrations.
- Integration tests: Java worker lifecycle, SQLite, PTY, process cleanup, language server, credential adapter.
- Electron E2E: Guided/Compact, catalog, visual/script editing, manuals, bookmarks, history, export, isolation, accessibility.
- Provider tests: mocked OpenAI/Ollama success and failure matrix; execution separation invariant.
- Packaging tests: install, launch, execute, update/migrate, uninstall, no-system-JDK verification.

Every phase should have a deterministic CI gate. Native PTY and installer checks run on native runners/VMs, not only containers.

## 7. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Bash is too broad for reliable exact round trips | Declare supported syntax precisely; preserve everything else with source spans in `RawCodeNode`; property-test invariants. |
| PTY/native packaging fails late | Build a native PTY spike in Phase 1 and exercise it on every target OS continuously. |
| Catalog becomes an unmaintainable hand-written database | Version the schema, separate common packs from distro overlays, generate/test where possible, and start with representative curated coverage. |
| Risk classification gives false confidence | Return evidence and matched rules, fail conservatively on unknown constructs, hash the reviewed script, and keep confirmation in policy/UI rather than AI. |
| Manual/help content compromises renderer | Parse as untrusted text, allowlist semantic markup, sanitize again before render, and block active links/navigation. |
| AI bypasses deterministic controls | Make `AiProposal` structurally incapable of execution; reparse, validate, and risk-score every proposal; require a separate user action. |
| Secrets leak through logs/history/errors | Central redaction, protocol event filtering, credential-store isolation, PTY secret non-capture, adversarial fixture tests. |
| Linux artifacts behave differently | Build on native runners, pin toolchains, test clean VMs, publish SBOM/checksums, and avoid cross-building native PTY binaries. |

## 8. Scope controls

Explicitly out of v1:

- Accounts, cloud sync, remote/SSH execution, team collaboration, plugins/marketplace, automatic package installation, telemetry, WSL, ARM64 release commitments, and non-English translations.
- Spring Boot, localhost HTTP services, or renderer-level Node/process access.
- AI-controlled execution or automatic execution after code generation.

Any request to add these items should be evaluated as a separate milestone so it does not destabilize the Linux MVP.

## 9. Milestone completion summary

| Milestone | User-visible outcome |
| --- | --- |
| M0–M1 | Secure app window and private Java protocol work. |
| M2–M3 | The machine is detected and commands/manuals are browsable offline. |
| M4–M5 | Bash and visual projects round-trip, validate, bookmark, and export. |
| M6–M7 | Full editor assistance and reviewed local PTY execution work safely. |
| M8 | OpenAI and installed Ollama produce validated reviewable proposals. |
| M9–M10 | Hardened Linux MVP ships as AppImage, deb, and rpm. |
| M11 | Signed/notarized macOS/Zsh release. |
| M12 | Signed Windows/PowerShell release. |

## 10. Immediate implementation backlog

The line-by-line status and evidence are maintained in
`outputs/specification-acceptance.md`. The next concrete batches close its
remaining specification and native-release acceptance gaps:

1. Audit the full specification line by line against implementation and tests;
   turn every remaining discrepancy into a bounded acceptance item.
2. Continue beyond the verified 62-command catalog or 18-page TLDR supplement
   only where exact source-backed coverage adds clear product value.
3. Extend parser/property coverage only without weakening exact raw preservation
   or literal/variable distinctions.
4. Add support-bundle/log-rotation hardening only if beta operations show that
   safe stderr diagnostics are insufficient.
5. Record native Ubuntu 24.04, Ubuntu 26.04, and Fedora 44 packaging/install/
   launch/execute/uninstall workflow results, with Fedora clean-VM evidence.
6. Resolve any findings, then complete signing and publication approval.

## Sources checked for the AI phase

- OpenAI model guidance: https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6
- Official OpenAI Java SDK: https://github.com/openai/openai-java
