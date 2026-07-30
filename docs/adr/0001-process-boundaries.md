# ADR 0001: Electron and Java process boundaries

- Status: Accepted
- Date: 2026-07-18

## Context

The UI needs local catalog, persistence, process, PTY, and credential capabilities while the renderer displays untrusted manuals and terminal output.

## Decision

The React renderer runs sandboxed with Node integration disabled and context isolation enabled. A narrow preload API is its only application capability. Electron main validates renderer requests and owns the lifecycle of one long-running Java 21 worker. Java owns catalog, persistence, shell semantics, risk, export, AI providers, credentials, and local execution.

The worker does not listen on a network socket. Electron main is the only supported protocol peer.

## Consequences

Capabilities are isolated from renderer compromise, but all public calls require schemas, timeout/cancellation behavior, and lifecycle tests.

