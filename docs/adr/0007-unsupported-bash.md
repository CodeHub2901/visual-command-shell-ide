# ADR 0007: Preserve unsupported Bash exactly

- Status: Accepted
- Date: 2026-07-18

## Decision

`ShellProgram` has an explicit supported grammar. Unsupported constructs, heredocs, unusual expansions, and extensions are stored as `RawCodeNode` values with exact source text and spans. Visual edits may canonicalize supported syntax but never rewrite or discard raw text.

Parsing is non-destructive: a failure produces diagnostics plus recoverable source, not a blank or partially reconstructed program.

## Consequences

Property tests cover semantic round trips for supported nodes and byte-for-byte raw-node preservation. The canvas must present raw nodes clearly and restrict edits that would imply unsupported structural understanding.

