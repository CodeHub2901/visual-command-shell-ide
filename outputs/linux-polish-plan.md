# Linux polish and release gate

The Linux product is the only active release track. macOS/Zsh and
Windows/PowerShell remain deferred until every required Linux gate below has
current evidence for the exact release revision.

## Supported release target

- Ubuntu 24.04 LTS x86-64
- Ubuntu 26.04 LTS x86-64
- Fedora 44 x86-64
- AppImage, Debian package, and RPM package
- Fully offline catalog, manuals, visual/script editing, validation, export,
  execution, projects, bookmarks, and history
- Optional OpenAI and installed-Ollama proposal workflows

## Gate L1: first-run and workflow polish

Acceptance criteria:

1. A new user can identify Catalog, Visual Builder, Script Editor, Bookmarks,
   History, AI, and Settings without decoding abbreviations.
2. Guided mode explains its safe default workflow and Compact mode explains
   its additional control and confirmation responsibilities.
3. Loading, empty, offline, missing-tool, worker-failure, validation-failure,
   and recovery states state what happened and provide the next safe action.
4. Unsaved source, selected project, target distribution, working directory,
   risk level, and execution state remain visible wherever they affect an
   action.
5. The primary catalog-to-build-to-review-to-run-to-history flow succeeds from
   a fresh profile without external AI or a system JDK.

Evidence:

- Electron end-to-end coverage for both modes and the fresh-profile path
- Focused renderer tests for every new state or navigation rule
- Maintainer-reviewed screenshots from Ubuntu and Fedora at the release
  resolution

Current implementation:

- A fresh local profile shows an offline/privacy and review-boundary walkthrough
  with explicit Guided and Compact entry points.
- Settings can reopen the walkthrough and reports the active Linux display,
  virtualization, graphics, native-transparency, and startup-workaround state.
- Wayland selects Electron's automatic Ozone backend; VMware guests use a
  documented software-rendering fallback with explicit environment overrides.

## Gate L2: visual consistency and accessibility

Acceptance criteria:

1. Navigation uses recognizable labels/icons and exposes the full name through
   accessible text and tooltips.
2. Spacing, typography, buttons, fields, alerts, risk colors, and empty states
   use shared design tokens and consistent interaction states.
3. System, Light, and Dark appearances use readable compositor-safe frosted
   materials; the selection persists locally and unsupported blur/native
   transparency configurations fall back to an opaque material.
4. The application remains usable at the documented minimum window size and
   does not hide required controls when the inspector collapses.
5. All workflows are keyboard reachable with a visible focus indicator;
   screen-reader names, reduced motion, forced colors, and contrast are
   verified.
6. Long commands, paths, diagnostics, manual content, and terminal output do
   not break the layout.

Evidence:

- Automated keyboard, focus, forced-color, overflow, and minimum-size checks
- A manual visual review checklist with Ubuntu and Fedora screenshots
- The 144-capture size/scaling/workspace matrix and review record in
  `outputs/responsive-verification.md`

## Gate L3: Linux reliability and safety

Acceptance criteria:

1. Worker startup, restart, corrupt-database recovery, project migration, and
   cancellation leave user projects recoverable.
2. The exact reviewed script and working directory are revalidated immediately
   before execution; confirmation cannot be reused after a change.
3. PTY output, resize, stdin, nonzero exit, cancellation, process-tree cleanup,
   and sudo-secret non-retention pass from installed packages.
4. AppImage, deb, and rpm launch without a system JDK on every supported target.
5. Uninstalling never removes user projects, bookmarks, settings, or history.

Evidence:

- Unit/integration verification plus revision-bound native acceptance records
  for all three supported distributions

## Gate L4: packaging and permanent download

Acceptance criteria:

1. A version tag builds the exact AppImage, deb, and rpm candidates that pass
   the native acceptance matrix.
2. SHA-256 checksums, CycloneDX SBOMs, license/notice files, runtime-module
   inventory, source revision, and native acceptance records are published
   with the packages.
3. GitHub Releases provides a permanent, obvious AppImage download; users do
   not need to find an expiring Actions artifact.
4. Release notes contain installation, upgrade, uninstall, FUSE compatibility,
   sandbox troubleshooting, known limitations, and support/security links.
5. The maintainer-selected Linux signing or provenance policy is applied and
   documented before publication.

Evidence:

- A non-draft GitHub prerelease for the approved tag
- Clean downloads reverified against the published checksum manifest

## Gate L5: beta acceptance

Acceptance criteria:

1. No open release-blocking defect or unresolved high/critical dependency or
   code-scanning finding exists for the release revision.
2. The complete `pnpm verify` gate and Linux native matrix pass without waived
   jobs.
3. At least one clean-profile Guided workflow and one Compact workflow are
   manually accepted from a published package.
4. Known limitations are documented and do not contradict the Linux MVP
   specification.

## Work order

1. Polish navigation, first-run guidance, mode guidance, state feedback, and
   visual consistency.
2. Exercise fresh-profile workflows and repair reliability or recovery defects.
3. Complete accessibility and minimum-window visual review.
4. Add a maintainer-controlled tag-to-prerelease publication path.
5. Run the exact-revision native matrix, approve, and publish the Linux beta.
6. Collect beta feedback and close release-blocking Linux issues.
7. Only then begin the macOS/Zsh track; Windows/PowerShell remains later.

## Current candidate evidence — 2026-08-04

- The exact working-tree snapshot passed `CI=1 GITHUB_ACTIONS=1 pnpm verify` in
  an isolated Ubuntu 24.04 environment: security policies, TypeScript checks,
  150 Maven tests with native PTY coverage, bundled jlink runtime, Electron
  workflows, performance budgets, 144 screenshots, and 96 additional scaling
  states.
- System/Light/Dark semantic text colors now have an automated WCAG AA 4.5:1
  contrast floor. Focus-visible, reduced-motion, and forced-color rules are
  regression-tested.
- `pnpm dist:linux` generated AppImage, deb, and rpm candidates; 47 checksummed
  package/metadata files, three CycloneDX 1.6 SBOMs, 32 Java license files,
  package headers, notices, and runtime modules passed verification.
- The unpacked candidate, AppImage, and installed Ubuntu 24.04 deb completed the
  bundled-runtime Electron smoke. The installed deb PTY path sustained 8.78
  MiB/s, uninstall removed application binaries, and the user-data sentinel
  remained unchanged.
- This evidence is pre-commit and is not revision-bound release approval. The
  feature branch must still be committed, pushed, reviewed, and pass GitHub's
  exact-revision Ubuntu/Fedora matrix before publication.
