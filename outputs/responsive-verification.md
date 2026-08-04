<!--
SPDX-FileCopyrightText: 2026 Divyang S Mistry
SPDX-License-Identifier: Apache-2.0
-->

# Responsive desktop verification

Linux responsive polish is a release-blocking gate. macOS and Windows product
work remains deferred until this gate and the native Linux acceptance matrix
pass for the same revision.

## Required matrix

The automated Electron capture gate exercises all eight primary workspaces:
Catalog, Visual Builder, Script Editor, Manual, AI Assistant, Bookmarks,
History, and Settings.

| Outer window | 100% | 150% | 200% |
| --- | --- | --- | --- |
| 980×640 | 8 workspaces | 8 workspaces | 8 workspaces |
| 1024×768 | 8 workspaces | 8 workspaces | 8 workspaces |
| 1366×768 | 8 workspaces | 8 workspaces | 8 workspaces |
| 1440×900 | 8 workspaces | 8 workspaces | 8 workspaces |
| 1920×1080 | 8 workspaces | 8 workspaces | 8 workspaces |
| 2560×1440 | 8 workspaces | 8 workspaces | 8 workspaces |

This produces 144 screenshots. `pnpm test:responsive` writes the images and
machine-readable `responsive-report.json` to `work/responsive-screenshots/`.
CI and the Linux release workflow retain that directory as the
`responsive-linux-screenshots` artifact.

The same gate additionally runs the complete 8-workspace × 6-size assertion
matrix at 125% and 175% without duplicating screenshots. Together, the gate
checks 240 responsive states across all required Ubuntu scaling levels.

## Automated assertions per capture

- The requested Electron outer-window dimensions are applied exactly.
- The layout band matches the renderer width: compact below 1100 px, medium
  from 1100 through 1439 px, and wide from 1440 px.
- `html` and `body` are fixed and have no horizontal or vertical overflow.
- Sidebar, workspace, and inspector retain independent vertical scrolling.
- The active workspace, top application bar, terminal control, and
  Guided/Compact safety mode are visible.
- Visual Builder and Script Editor keep Save, Review & Run, and Cancel visible
  in the fixed application bar, using labelled compact icons when space is
  constrained.
- Every capture is non-empty and the run contains no ResizeObserver-loop
  diagnostics.

The Electron smoke gate separately performs live resizing while Monaco,
React Flow, and xterm are active. It verifies that their DOM instances, draft,
canvas node and viewport transform, terminal instance, and workspace scroll
state survive. It also opens compact drawers from the keyboard, closes them
with Escape, and checks focus restoration.

## Visual review record — 2026-08-04

The complete 144-image local matrix was reviewed through one 18-state contact
sheet per workspace. Navigation, typography, workspace hierarchy, terminal
containment, panel transitions, compact icon actions, medium overlays, wide
inspector layout, and long-content containment were visually consistent.

The first review found that Settings fell below the navigation rail at
980×640 and 200% scaling. A short-viewport density rule now preserves all eight
navigation items; the full 144-image gate passed after the correction.

The post-onboarding review then found that the terminal's static CSS minimum
could override its viewport-aware pane clamp at 980×640 and 200% scaling. The
grid now consumes the same dynamic terminal minimum used by the persisted pane
model, preserving usable workspace height at the most constrained supported
state. The full 144-image local matrix passed again after that correction.

An isolated Ubuntu 24.04 environment subsequently passed the exact complete
`pnpm verify` command, including native PTY tests, real Electron/Xvfb smoke,
144 Linux screenshots, and the 96 additional scaling assertions. All eight
Linux contact sheets were visually reviewed in the system-selected Light
appearance with no clipping or overflow blocker found.

After adding first-run guidance, Settings display diagnostics, catalog keyboard
search polish, Wayland Ozone selection, and VMware graphics fallback, a fresh
Ubuntu 24.04 validator again passed the exact complete `CI=1
GITHUB_ACTIONS=1 pnpm verify` command. This included 150 Maven tests with native
PTY coverage, Electron workflow and focus smoke, React Flow performance, 144
Linux screenshots, and all 96 additional scaling assertions.

This is strong native implementation evidence, but not permission to publish
the beta. The repository GitHub Actions run and its retained artifact must also
pass for the eventual commit before the responsive release gate is marked
complete.
