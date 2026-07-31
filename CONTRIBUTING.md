# Contributing

The project is in early foundation work. Before opening a change:

1. Read the relevant architecture decisions in `docs/adr`.
2. Keep renderer capabilities narrow and validated at both Electron and Java boundaries.
3. Add tests for protocol, parser, execution, persistence, or security behavior changed by the patch.
4. Run `pnpm verify` from the repository root.
5. Do not add telemetry, automatic package installation, remote execution, or AI-triggered execution.

New dependencies must be compatible with Apache-2.0 distribution and recorded for third-party notices and SBOM generation.

## Contribution provenance

Contributions use the [Developer Certificate of Origin 1.1](https://developercertificate.org/).
Sign off each commit to certify that you have the right to submit it under the
project's Apache License 2.0:

```bash
git commit --signoff
```

The sign-off must use your real name and an email address you control:

```text
Signed-off-by: Contributor Name <email@example.com>
```

Do not remove existing copyright, SPDX, license, attribution, or NOTICE
information. New original Java, TypeScript, JavaScript, and CSS source files
must carry both of these lines in the appropriate comment syntax:

```text
SPDX-FileCopyrightText: 2026 Divyang S Mistry
SPDX-License-Identifier: Apache-2.0
```
