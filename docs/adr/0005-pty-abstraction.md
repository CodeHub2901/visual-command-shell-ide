# ADR 0005: Java-owned PTY abstraction

- Status: Accepted
- Date: 2026-07-18

## Decision

Define a Java PTY service-port before selecting the final native implementation. The Linux adapter will evaluate pty4j against streaming, resize, stdin, cancellation, exit status, working-directory selection, and process-tree cleanup requirements. macOS and Windows adapters remain behind the same domain interface.

Electron never invokes a shell or process directly. Execution uses an immutable reviewed-script snapshot and review hash.

## Consequences

A native packaging spike is required during the secure-shell milestone. Failure to pass clean-target PTY tests blocks execution work rather than moving process ownership into Electron.

