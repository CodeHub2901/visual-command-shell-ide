<!-- SPDX-FileCopyrightText: 2026 Divyang S Mistry -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Repository agent instructions

## GitHub access

- Do not request or install GitHub CLI (`gh`) for this repository.
- Use the authenticated `origin` Git remote for fetch, branch, push, and other
  Git transport operations.
- Use the connected GitHub app for pull requests, Actions metadata, comments,
  and supported GitHub mutations.
- If either existing access path fails, report the exact failed operation. Do
  not present installing `gh` as the default solution.

## Git Flow

- Use `feature/*` branches for product work and merge them into `develop` by
  pull request.
- Use `release/*` branches from `develop` for version and publication
  preparation, with a pull request targeting `main`.
- Use `hotfix/*` branches from `main` only for urgent released-version fixes.
- Keep release pull requests in draft until their exact revision passes all
  required checks.

## Release safety

- Do not merge a release branch, create a version tag, sign artifacts, or
  publish a GitHub Release without explicit maintainer approval.
- Preserve Apache-2.0 headers, protected attribution, and DCO sign-offs for
  every repository-authored commit.
- Linux remains the active platform until its beta publication is approved;
  macOS and Windows remain deferred.

## Project structure

- **Monorepo** (pnpm workspaces) with three packages:
  - `packages/contracts` — versioned Zod schemas + JSON schemas for v1 protocol
  - `apps/desktop` — Electron + React renderer, main, preload (TypeScript/Vite)
  - `apps/worker` — Java 21 Maven module (authoritative local capabilities)
- Root `package.json` scripts delegate to workspace packages and Maven wrapper.
- No Gradle; Java uses checked-in Maven wrapper (`./mvnw`).

## Prerequisites

- Node.js 24, pnpm 11
- JDK 21 (auto-resolved via `java` on PATH or `CMD_IDE_JAVA_HOME`)

## Essential commands

```bash
# Install deps (frozen lockfile)
pnpm install --frozen-lockfile

# Full verification pipeline (run before PR)
pnpm verify

# Build everything (contracts → desktop → worker JAR → runtime image)
pnpm build

# Typecheck all TS packages
pnpm typecheck

# Run all tests (TS + Java)
pnpm test

# Run only TS tests
pnpm test:ts

# Run only Java worker tests
pnpm test:worker

# Integration tests (require built worker runtime)
pnpm test:integration

# Start dev app (after pnpm build)
pnpm start
```

## Build order matters

1. `pnpm build:contracts` (must run first — desktop/worker depend on it)
2. `pnpm build:desktop` (Vite + tsc for renderer/main/preload)
3. `pnpm build:worker` (Maven `package` — produces shaded JAR)
4. `pnpm build:runtime` (Maven `runtime-image` profile — produces `apps/worker/target/runtime` via `jlink`)

`pnpm build` runs all four in sequence.

## Test quirks

- Desktop tests: `vitest` — performance budgets excluded by default (`test:performance` runs them)
- Java tests: Maven Surefire via `run-maven.mjs` wrapper
- Integration tests launch real Electron + worker runtime; require `pnpm build` first
- `pnpm test:packaged` validates packaged AppImage/deb/rpm artifacts
- Security tests: `pnpm test:security` (secrets, DCO, attribution, licenses, OSV)

## Architecture constraints (non-obvious)

- **Three trust domains**: Sandboxed React renderer → Electron main (preload) → Java worker (framed JSON-RPC on stdio)
- **No localhost server**, no Node integration in renderer, no arbitrary renderer paths
- Java worker owns: catalog, SQLite, PTY, Bash LSP, risk assessment, export validation, credentials
- Electron main owns: native dialogs, opaque directory tokens, framed RPC to Java
- Contracts (`packages/contracts`) are the single source of truth for v1 protocol; both TypeScript and Java validate against them
- Renderer never receives raw paths — directory choices become opaque tokens
- Terminal input never stored; OSC sequences stripped before xterm render
- AI providers produce proposals only; Java revalidates parser/generator/risk before any execution

## Common pitfalls

- Forgetting `pnpm build:contracts` before typecheck/test in desktop/worker
- Running integration tests without `pnpm build` (worker runtime missing)
- Editing Java without rebuilding worker (`pnpm build:worker` or `pnpm build`)
- Modifying protocol schemas without regenerating both TS and Java bindings (contracts build handles TS; Java uses Jackson on same schemas)
- Adding deps without Apache-2.0 compatibility and third-party notice updates
- Unpackaged `pnpm start` on VMware GNOME Wayland can leave the window invisible;
  missing `java` on PATH leaves the catalog empty. See Linux troubleshooting in
  `docs/release/0.1.0-beta.md`. Local diagnosis launch:

  ```bash
  pnpm build:contracts && pnpm build:desktop
  DISPLAY=:0 GDK_BACKEND=x11 ELECTRON_OZONE_PLATFORM_HINT=x11 \
  CMD_IDE_JAVA="$(pwd)/apps/worker/target/runtime/bin/java" \
  pnpm --filter @cmd-ide/desktop exec electron . --no-sandbox --ozone-platform=x11
  ```

## Key docs for context

- `docs/architecture/README.md` — request/editor flows, data ownership
- `docs/adr/*.md` — trust boundaries, RPC framing, contracts, persistence, PTY, credentials, unsupported Bash
- `outputs/implementation-plan.md` — roadmap
- `outputs/specification-acceptance.md` — verified matrix
- `docs/release/building-linux.md` — reproducible Linux packaging