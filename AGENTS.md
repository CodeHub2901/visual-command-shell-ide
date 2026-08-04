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
