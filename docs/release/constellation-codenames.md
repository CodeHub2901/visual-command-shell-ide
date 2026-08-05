<!-- SPDX-FileCopyrightText: 2026 Divyang S Mistry -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Constellation release codenames

Command IDE uses constellation codenames as a secondary, human-readable way to
identify release trains. Numeric Semantic Versions, Git tags, package names and
checksums remain authoritative.

The canonical sequence is the NASA StarChild list of
[88 officially recognized constellations](https://starchild.gsfc.nasa.gov/docs/StarChild/questions/88constellations.html).
The machine-readable sequence and assignment ledger live in
[`constellation-codenames.json`](constellation-codenames.json).

## Naming rules

1. Assign one codename to a core `MAJOR.MINOR.PATCH` release train.
2. Keep that name for every beta, release candidate and final release in the
   train. For example, `0.1.0-beta.1`, `0.1.0-beta.2`, `0.1.0-rc.1` and `0.1.0`
   all use the same codename.
3. For a new release train, use the first unassigned constellation in the
   registry's source order. Do not reuse or silently skip names.
4. When opening a release branch, add or update its assignment, set
   `currentVersion`, and advance `nextCodename` to the following unused name.
5. Show the codename in release notes and the GitHub Release display title, but
   do not add it to tags or downloadable filenames.
6. Once a release train has been published, its codename is permanent. Record a
   deliberate exception in this document and in the assignment ledger.

## Release ledger

| Release train | Current version | Codename | Status |
| --- | --- | --- | --- |
| `0.1.0` | `0.1.0-beta.2` | **Andromeda** | Draft release candidate |

## Next name

**Antlia** is reserved for the next new release train. Another `0.1.0`
prerelease still uses **Andromeda**; Antlia is assigned only when work starts on
a different core version such as `0.1.1` or `0.2.0`.

The packaging regression check validates that the registry contains all 88
unique names, that the active version and release notes use the assigned name,
and that `nextCodename` immediately follows the last assigned constellation.
