# Command pack schema

The bundled catalog is assembled from versioned JSON packs listed in
`apps/worker/src/main/resources/catalog/v1/index.json`. The original acceptance
pack remains in `commands.json`; focused additions live below `packs/`. Catalog
document version `1.2.0` is the first schema that carries enough semantics for
deterministic guided forms and short-option generation.

## Document fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Semantic schema version. Unsupported versions fail worker startup. |
| `commands` | Curated command records. Command IDs must be unique. |

Each command defines identity, executable and display names, summary, category,
supported operating systems and Linux distro families, positional arguments,
risk tags, short-option policy, allowlisted version-probe arguments, curated options, examples, and a bundled manual.
Runtime-only availability and executable paths are added by the worker and are
never trusted from the pack.

## Arguments and options

Arguments declare a stable ID, display label, description, whether they are
required, and whether they repeat. Options declare one or more spellings,
required-value metadata, repeatability, whether a single-character form is safe
to combine, and conflicts by stable option ID.

The loader rejects:

- duplicate command or option IDs;
- duplicate, blank, control-character, or non-option flag spellings;
- blank option descriptions;
- conflicts that reference missing options;
- value-taking options without a value name, or value names on boolean options;
- combinable options on commands whose policy is `never`;
- combinable options without an argument-free single-character spelling; and
- missing required collections or unsupported schema versions.

The index loader also rejects missing packs, traversal paths, unsupported index
versions, more than 100 packs, and duplicate command IDs across merged packs.

## Distro/version overlays

The same index lists separately validated overlays for Ubuntu 24.04 LTS,
Ubuntu 26.04 LTS, and Fedora 44. An overlay has a unique ID, distro family,
exact version list, and optional command-specific status/note overrides. Status
is one of `supported`, `limited`, or `unsupported`; a detected Linux version
without an exact overlay is reported as `unknown` rather than assumed safe.
An override may also list `unavailableOptionIds`. The loader rejects duplicate
or unknown option IDs, and the worker removes those options before the command
reaches generation or the Guided form. This makes exact target differences
enforceable rather than informational prose.

The worker merges overlay evidence at runtime into every `CommandSpec` as a
compatibility status, target label, and explanation. Missing executables and
non-supported or limited targets remain generatable for review, but canonical
generation returns visible warnings. This keeps offline authoring possible
without presenting an untested target as compatible.

The first machine-readable difference is `lsblk --filter`: it is absent from
the Ubuntu 24.04 overlay and available on Ubuntu 26.04 and Fedora 44. The
package and upstream release evidence is recorded in
`docs/architecture/catalog-version-evidence.md`.

The common-syntax sources used for the 24-command expansion are recorded in
`docs/architecture/catalog-source-evidence.md`.

`combine-boolean` permits compaction only for options individually marked
`combinable`. It never permits long options, value-taking options, conflicting
options, or nonstandard command syntaxes to be compacted.

## Trust boundary

Catalog files are application-controlled inputs, but the worker still validates
their invariants before serving them. Passive availability checks contribute
only normalized paths. The separate PATH inventory is bounded to 512
directories, 10,000 entries per directory, and 20,000 unique names; its public
response returns at most 5,000 entries. It preserves the first PATH match,
reports shadowed duplicates and truncation, skips control-character names, and
never launches or reads discovered binaries. Only exact executable-name matches
receive catalog metadata. Manual output obtained from the host is untrusted text
and must never become HTML or active links.
