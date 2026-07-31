# Visual Command & Shell IDE

An offline-first desktop application for discovering, composing, reviewing, and running shell commands through equally supported Guided and Compact interfaces.

The first release targets Bash on Ubuntu 24.04/26.04 LTS and Fedora 44 x86-64. The renderer is a sandboxed Electron/React application. Privileged local capabilities live in a bundled Java 21 worker connected to Electron main through framed JSON-RPC over standard input/output; the application does not open a localhost server.

## Current status

Phases 0-10 of the Linux MVP are implemented and verified. The complete native
acceptance matrix passed on Ubuntu 24.04, Ubuntu 26.04, and Fedora 44 for
revision `fc34ff45cf2f17806f3c3d160c5207e0cd99de25`; public beta publication
remains a separate maintainer-controlled action. The Phase 3-5 foundation provides a
schema-versioned searchable catalog, bounded refreshable discovery of all safe
executable names on PATH with precedence-aware deduplication and catalog
enrichment, passive availability checks, opt-in cached version probes, semantic
`man`/`--help`/bundled manuals, a Guided `ShellProgram` generator, and a Compact
Bash parser through the secure Electron-to-Java boundary.

The indexed catalog now merges four validated packs containing 62 curated
commands across every product category: Files, Text, Search, Processes, System,
Networking, Storage, Packages, Permissions, Users, Development, and Other. The
24-command expansion adds source-checked Coreutils, Findutils, procps-ng,
systemd, util-linux, Wget, XZ, and GNU Make workflows, including offline
semantic manuals and conservative risk tags. Exact overlays cover Ubuntu 24.04
LTS, Ubuntu 26.04 LTS, and Fedora 44 (including a visible DNF5 limitation).
Machine-readable option filtering prevents the util-linux 2.40+
`lsblk --filter` option from being offered on Ubuntu 24.04's 2.39 series;
unknown distro versions are never silently treated as compatible. Additional
command families and version-specific option evidence remain incremental
catalog work. The offline TLDR supplement now covers 18 commands, with every
page tied to an immutable upstream revision and exposed CC-BY 4.0 attribution.

The Guided `ls` form proves metadata-authorized option selection, literal Bash quoting, conflict/value validation, and deterministic `-a -l` to `-al` compaction. A real React Flow canvas renders the complete recursive AST, preserves draggable node positions, and keeps non-selected nodes intact when a reopened project command is edited. Compact mode now uses a locally bundled, lazy-loaded Monaco ESM editor with Shell highlighting and an inline local worker. Guided generation and Monaco parsing share unsaved program/source state across mode switches; unsupported input remains a visible raw node. The shared project actions can copy the exact canonical generated command with accessible success/error feedback. Preload accepts only a validated `ShellProgram`; Electron main asks Java to regenerate it and writes the bounded plain-text result, while the sandboxed renderer receives no native clipboard or Node API. ShellProgram 1.4 adds commands, redirects, pipelines, Boolean chains, sequences, assignments/exports, whole-word variable references, recursively nested groups and subshells, function definitions, `if`/`elif`/`else`, `for`, `while`, `until`, typed `case` arms, comments, and raw-code nodes. The conservative parser attaches source spans to structured nodes and preserves unsupported fall-through case modes, parameterized expansions, command substitution, heredocs, and ambiguous input verbatim with diagnostics. Maven property tests exercise 550 generated structured round trips and 200 exact raw-block preservation cases per run.

Deterministic risk evidence and exact-script SHA-256 review hashing are now active in the preview. Risk rules use the selected operation rather than only command-wide tags: package queries and simulations are Medium; ordinary deletion, permission/ownership changes, package changes, privilege elevation, and downloads piped to a shell are High; recursive destructive changes, mount changes, unmounts, persistent system configuration, broad wildcard deletion, and unsupported raw code are Critical. Read-only system-control queries remain Low. Critical execution is disabled in Guided mode and requires an exact hash-bound phrase in Compact mode; Java independently applies the same policy immediately before PTY startup. Structured projects can be saved to SQLite, reopened, imported from migration-aware `.cmdbuilder.json` files, and exported from either editor mode; reopening always regenerates and reassesses the AST, and approval hashes are never persisted. Electron main owns native open/save dialogs, bounded regular-file reads, and same-directory atomic writes, so the renderer never receives a path-taking filesystem API. Java owns canonical project JSON, Markdown recipes, and executable Bash artifacts. A `.sh` artifact is returned only after the exact generated UTF-8 content passes an absolute discovered `bash --noprofile --norc -n`; export is blocked when Bash is absent or broken. The React Flow canvas now supports catalog-example insertion with fresh recursive IDs, comment insertion, top-level sequence/pipeline/boolean connections, and safe recursive deletion with normalization; every edit regenerates through Java and synchronizes to both editor modes.

Reviewed local execution is implemented through a Maven-managed Pty4J adapter and a lazy xterm terminal. Java independently regenerates and reassesses the program at start time, rejects stale script/hash pairs, applies mode-specific confirmation policy, resolves an absolute discovered Bash, bounds concurrent sessions and output, streams stdin/output/resize/cancel/exit events, and cleans up process trees. Electron main converts a native directory choice into an opaque token, so renderer requests still cannot supply arbitrary filesystem paths. Terminal OSC controls are removed with a chunk-aware filter before rendering, input is never retained, and SQLite history contains redacted command text rather than terminal data or approval state.

The terminal region is collapsible without stopping an active PTY. Its
accessible disclosure state is available through the button or Alt+T and is
restored for the current desktop session.

English is the initial UI language. Renderer text, accessibility labels,
visual-graph and editor helper messages, terminal notices, and Electron native
dialogs use one typed shared message catalog. Locale-neutral workspace IDs,
English fallback, named interpolation, plural rules, and locale-aware
date/number formatting are covered by regression tests. See the
[localization boundary](docs/architecture/localization.md).

The local Bookmarks workspace stores reusable `ShellProgram` selections rather
than flattened command strings. Variable and redirect placeholders are retained
as typed AST values, missing parameter metadata is derived locally, sensitive
names receive no default, and saved bookmarks can be reopened in the Visual
Builder or explicitly deleted. Java regenerates and secret-checks every bookmark
before SQLite persistence.

`sudo` is explicitly cataloged as High-risk privilege elevation. Its exact
reviewed command is confirmation-gated, while authentication remains entirely
inside the PTY and is excluded from application state and persistence.

Compact mode now provides offline catalog-aware command completion, option
snippets, compatibility/risk hover details, and inline parser diagnostics in
Monaco. Bash Language Server 5.6.0 is an exact production dependency and runs
through Electron's bundled Node runtime, so users do not need a global Node or
language-server installation. Settings reports that bundled provenance and
passively detects the optional ShellCheck and shfmt executables by inspecting
PATH entries without launching them; missing optional tools receive guidance
and are never installed automatically.

Java exclusively owns the bundled Bash Language Server process, sanitized
environment, LSP framing,
initialization, document versions, request deadlines, and shutdown. Monaco
receives only normalized completion, hover, and diagnostic records through
validated APIs. Document symbols and same-document references feed Monaco's
native navigation providers without exposing server-supplied file URIs.
The server's internal ShellCheck, shfmt, and background-workspace subprocesses
are disabled. ShellCheck runs only after an explicit editor action and
contributes normalized, deduplicated markers. shfmt returns a read-only preview
that changes the draft only after the user selects Apply. A failed language
server leaves the deterministic catalog helpers active, and no diagnostic
source silently rewrites source.

Phase 8 now has a provider-neutral, proposal-only Ollama and OpenAI workflow.
The AI Assistant enumerates only models already present in Ollama, defaults to
loopback, requires explicit confirmation for a remote HTTPS endpoint, and never
downloads software. OpenAI uses the official Responses endpoint, typed
Structured Outputs, a curated model picker, disabled response storage, and a
stable privacy-preserving safety identifier. API keys are write-only to the
renderer and live in Windows Credential Manager, macOS Keychain, or Linux Secret
Service, with a disclosed worker-session memory fallback when secure storage is
unavailable. Java reparses, syntax-checks, canonicalizes, secret-checks, and
deterministically risk-scores every provider response. Applying a proposal
creates an unsaved Script Editor draft; it never starts an execution.

See [the implementation roadmap](outputs/implementation-plan.md), [specification acceptance matrix](outputs/specification-acceptance.md), and [architecture decisions](docs/adr/README.md).

## Prerequisites for development

- Node.js 24
- pnpm 11
- JDK 21

No global Maven installation is required; use the checked-in Maven wrapper. The
Java worker is Maven-only; the repository contains no Gradle build.

## Build and test

```powershell
pnpm install --frozen-lockfile
pnpm verify
```

The build creates the Java worker with Maven and invokes the Maven
`runtime-image` profile to create `apps/worker/target/runtime`. Verification
launches the worker from that runtime, so the bundled path is tested separately
from the developer's system Java.

To launch the compiled development application after building the worker:

```powershell
pnpm build
pnpm start
```

Native packaging must run on the target operating system:

```powershell
pnpm pack:dir
pnpm test:packaged
```

Linux release hosts build AppImage, deb, and rpm candidates with
`pnpm dist:linux`. See [the reproducible Linux build guide](docs/release/building-linux.md).
That command also generates and verifies CycloneDX SBOMs, complete third-party
notices, the bundled runtime module list, and SHA-256 checksums for every
candidate and release metadata file.

## Security posture

- Renderer sandboxing and context isolation are mandatory.
- Node integration is disabled.
- Renderer calls pass through a narrow validated preload API.
- Java worker stdout is reserved exclusively for framed protocol messages.
- Exact reviewed scripts and confirmation policy are revalidated by Java before PTY start.
- Terminal input is never stored, and untrusted OSC controls are stripped before xterm rendering.
- AI providers can create reviewable proposals but cannot execute commands.
- Credentials and terminal secrets are never stored in SQLite.

Please report vulnerabilities according to [SECURITY.md](SECURITY.md).

See the [architecture guide](docs/architecture/README.md) for the implemented request and trust paths.

## License

Copyright 2026 Divyang S Mistry.

Apache License 2.0. See [LICENSE](LICENSE).

Copyright ownership is recorded in [COPYRIGHT](COPYRIGHT). Third-party licenses
and attribution are recorded in [NOTICE](NOTICE) and in the generated release
metadata. Project names and branding are addressed by the
[trademark policy](TRADEMARKS.md).
