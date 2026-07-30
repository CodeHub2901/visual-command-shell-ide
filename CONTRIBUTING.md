# Contributing

The project is in early foundation work. Before opening a change:

1. Read the relevant architecture decisions in `docs/adr`.
2. Keep renderer capabilities narrow and validated at both Electron and Java boundaries.
3. Add tests for protocol, parser, execution, persistence, or security behavior changed by the patch.
4. Run `pnpm verify` from the repository root.
5. Do not add telemetry, automatic package installation, remote execution, or AI-triggered execution.

New dependencies must be compatible with Apache-2.0 distribution and recorded for third-party notices and SBOM generation.

