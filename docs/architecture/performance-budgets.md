# Performance budgets

These are regression ceilings, not aspirational averages. Native release CI
records the observed values so slower target images are visible before beta.

| Path | Automated ceiling |
| --- | ---: |
| Bundled worker process to first health response | 8,000 ms |
| Warm catalog search, p95 of 30 requests | 250 ms |
| `ls` manual retrieval and semantic normalization | 3,000 ms |
| Parse a generated 2,000-line Bash script | 5,000 ms |
| Deterministically risk-assess that parsed script | 5,000 ms |
| Project a 1,000-node `ShellProgram` into React Flow nodes/edges, p95 of 20 runs | 250 ms |
| Stateful OSC filtering across 20,000,000 terminal input characters | 5,000 ms |
| Materialize 1,000 real React Flow nodes in the Electron renderer | 15,000 ms |
| Zoom the materialized 1,000-node React Flow canvas, p95 of 20 interactions | 500 ms |
| Stream 4 MiB from a real PTY through framed JSON-RPC | 15,000 ms |
| Electron renderer-to-worker workflow plus large-canvas probe | 40,000 ms |
| Unpacked native app with bundled-runtime workflow plus large-canvas probe | 50,000 ms |
| Installed native app with bundled-runtime workflow plus large-canvas probe | 60,000 ms |

The generous CI ceilings account for shared runners. A ceiling breach fails
verification and requires either a measured fix or an explicitly reviewed
budget change. The renderer keeps Monaco and xterm in lazy chunks; the
production build reports chunk sizes so unexpected eager loading remains
visible. The renderer helper budgets invoke the production graph projector and
chunk-aware terminal sanitizer directly and use deliberately irregular output
chunks. The Electron smoke then opens an isolated performance route backed by
the production `ShellProgramCanvas`, waits for all 1,000 DOM nodes, dispatches
20 real React Flow zoom interactions, and reports render time and p95 latency.
The route is never loaded during normal application startup.

On Linux, `tests/integration/pty-throughput.mjs` executes the canonically
generated read-only pipeline
`head -c 4194304 /dev/zero | tr '\000' x`. The timer spans execution startup,
Pty4J output, JSON serialization, framed stdio transport, parsing, and the exit
event. The test requires at least 4 MiB, a successful exit, no terminal error,
and completion below the ceiling. Native release jobs run it against the
checked-in build and again against each deb/rpm package's bundled jlink runtime
and worker. Installed AppImage, deb, and rpm smoke jobs report the real canvas
measurement under Xvfb. These measurements complement, rather than get
inferred from, the deterministic production-helper budgets.
