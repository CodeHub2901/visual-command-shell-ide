# Initial Threat Model

This document is intentionally concise during foundation work and will expand before Linux beta.

## Assets

- User files, working directories, command history, credentials, terminal secrets, AI prompts/responses, and local process authority.

## Trust boundaries

1. Untrusted catalog/manual/terminal content entering the renderer.
2. Renderer requests crossing preload IPC into Electron main.
3. JSON-RPC crossing from Electron main to Java.
4. Java interactions with PATH executables, manuals, PTYs, SQLite, credential stores, and optional network providers.

## Initial abuse cases and controls

| Abuse case | Required control |
| --- | --- |
| Manual HTML executes script or navigation | Treat source as text, sanitize with an allowlist, enforce CSP, block navigation/window creation. |
| Renderer compromise spawns a process | Sandbox, no Node integration, narrow preload, Java-owned execution. |
| Protocol payload bypasses validation | Validate in Electron and Java; reject invalid/unknown methods. |
| Worker log corrupts framing | Reserve stdout for protocol; log to stderr/files only. |
| PATH hijacking changes reviewed execution | Resolve and display executable context; execute immutable reviewed content; record evidence. |
| Passive catalog browsing executes a hostile PATH entry | Availability uses filesystem inspection only; version probing is a separate explicit action with catalog-controlled arguments. |
| Tool detection launches a hostile PATH entry or installs software | Prefer the exact bundled Bash Language Server; detect optional ShellCheck/shfmt and the development-only language-server fallback by regular/executable file inspection only; expose guidance but no installer. |
| A language server receives secrets, starts optional tools, scans the workspace, emits oversized data, or asks the client to mutate files | Start it only after an editor session opens, pass an allowlisted environment with ShellCheck/shfmt/background analysis disabled, cap LSP frames/requests/documents, normalize all renderer-visible results, deny workspace edits, and support only a small safe server-request set. |
| ShellCheck or shfmt reads secrets, hangs, floods output, or silently rewrites the reviewed script | Run only an absolute detected executable after an explicit action, use fixed arguments and bounded stdin/output/deadlines with an allowlisted environment, normalize diagnostics, and require a separate Apply action for formatting. |
| `man` or `--help` hangs, floods output, or emits terminal controls | Absolute executable allowlist, 2.5 second deadline, process-tree cleanup, 512 KB cap, ANSI/control stripping, semantic text-only rendering. |
| Script changes after confirmation | Bind approval to content hash and target context. |
| Renderer reuses a stale or fabricated execution approval | Java regenerates and reassesses at PTY start, exact-compares reviewed script/hash, and enforces confirmation policy independently of the UI. |
| Renderer selects an arbitrary execution path | Electron main owns the native chooser and accepts only bounded opaque directory tokens from the renderer. |
| Renderer copies unvalidated or alternate-format clipboard content | Preload accepts only a strict `ShellProgram`; Electron main regenerates it through Java, validates the bounded result, and writes plain text only after an explicit copy action. |
| PTY output changes titles, creates hostile links, or carries clipboard controls | Strip all OSC forms with a bounded streaming parser before xterm; leave xterm window manipulation disabled. |
| PTY floods output or starts too many processes | Bound sessions and output, stream fixed-size chunks, terminate on overflow, and clean process trees on cancel/shutdown. |
| Project persistence carries secrets or stale approval | Regenerate before save, compare central redaction output, forbid sensitive defaults, and never persist review hashes/approval. |
| Bookmark flattens placeholders or persists a credential | Store the typed AST and parameter records, derive only typed variable placeholders, regenerate in Java, reject embedded credentials and secret-bearing defaults. |
| AI proposal executes automatically or fabricates approval | No execution capability/reference in `AiProvider` or `AiService`; strict `AiProposalResult` rejects execution fields; applying creates only an unsaved draft and requires the separate normal review workflow. |
| Ollama integration downloads a model or sends local data remotely without consent | Use only `/api/tags` and `/api/chat`, require an installed selected model, default to loopback, reject non-HTTPS remote origins, and require explicit remote confirmation. |
| Renderer compromise reads or persists an OpenAI key | Expose store/delete/status only, return metadata rather than secret values, keep OS-vault access in Java, forbid SQLite/plaintext fallback, and zero session-memory copies at lease and worker shutdown boundaries. |
| OpenAI configuration redirects prompts or retains provider responses unexpectedly | Fix the adapter to the official HTTPS API endpoint, disable response storage, use bounded requests with zero retries, and require an explicit provider selection. |
| AI output bypasses syntax/risk validation or leaks an embedded credential | Validate the structured envelope, centrally reject detected secrets, reparse and canonicalize, require local `bash -n`, run deterministic risk assessment, and fail closed on malformed output. |
| Sudo/API secret reaches logs/history/AI | PTY secret non-capture, central redaction, write-only credentials, adversarial tests. |
