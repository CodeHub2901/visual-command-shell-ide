# Catalog version evidence

This file records the primary-source evidence used for machine-readable
distro/version option overlays. It is a dated engineering snapshot, not a claim
that installed packages can never receive later patch updates. Runtime version
probing remains available for the exact host executable.

## `lsblk --filter`

Evidence checked on 2026-07-18:

| Target | Package evidence | Overlay result |
| --- | --- | --- |
| Ubuntu 24.04 LTS | [Ubuntu package index](https://packages.ubuntu.com/en/noble/util-linux) lists util-linux 2.39.3. | `filter` unavailable |
| Ubuntu 26.04 LTS | [Ubuntu package index](https://packages.ubuntu.com/resolute/util-linux) lists util-linux 2.41.3. | `filter` available |
| Fedora 44 | [Fedora package index](https://packages.fedoraproject.org/pkgs/util-linux/util-linux/) lists util-linux 2.41.x. | `filter` available |

The [upstream util-linux 2.40 release notes](https://www.kernel.org/pub/linux/utils/util-linux/v2.40/v2.40-ReleaseNotes)
identify filtering expressions as a new libsmartcols feature used by `lsblk` and
show `lsblk --filter`. Therefore the option is not offered for the 2.39-based
Ubuntu 24.04 target, while the 2.41-based targets retain it.

The catalog models both `-Q` and `--filter` as value-taking, non-combinable
spellings. Overlay validation ensures the unavailable ID references a real
catalog option; command enrichment removes it before validation or generation.
