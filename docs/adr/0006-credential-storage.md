# ADR 0006: Credential storage

- Status: Accepted
- Date: 2026-07-18

## Decision

Provider credentials use an operating-system credential-store abstraction owned by Java. If secure storage is unavailable, a key may exist only in mutable session memory and is cleared when the worker exits. There is no plaintext-file or SQLite fallback.

Secret values are write-only from the renderer's perspective. APIs return presence/status metadata, never the key itself.

The adapters use Windows Credential Manager, macOS Keychain, and Linux Secret
Service (`secret-tool`) respectively. The Linux helper is resolved to an
absolute executable before use and runs with a bounded allowlisted environment,
input/output, and deadline. Secure-store failures are surfaced explicitly when
the service must fall back to session memory.

## Consequences

Each platform adapter needs availability, locked-store, update, delete, and redaction tests. Diagnostic bundles report only provider/status information.
