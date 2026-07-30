# Security Policy

## Supported versions

No public release is supported yet. Security fixes are applied to the active development branch.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, terminal transcripts, or user data. Contact the maintainers privately using the security contact published with the repository before the first beta.

Include the affected version, platform, reproduction steps, impact, and any proposed mitigation. Remove API keys, passwords, file contents, and identifying paths from reports.

## Security invariants

- The renderer cannot access Node.js or spawn processes.
- The Java protocol uses standard input/output only and exposes no listening port.
- Worker stdout contains protocol frames only.
- The exact reviewed script is the exact script executed.
- AI output never invokes execution without a separate user action.
- Sudo passwords and other PTY secrets are never logged or persisted.

