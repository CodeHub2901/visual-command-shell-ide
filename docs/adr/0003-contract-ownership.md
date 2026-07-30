# ADR 0003: Versioned shared contracts

- Status: Accepted
- Date: 2026-07-18

## Decision

Protocol contracts live in `packages/contracts` as versioned schemas with TypeScript runtime validators and exported JSON Schema artifacts. Java maps the same public shapes to records/DTOs and validates again during dispatch. Additive compatible changes remain within a major version; breaking changes introduce a new namespace and migration path.

Unknown methods are rejected. Unknown or invalid fields are rejected at trust boundaries unless a schema explicitly permits forward-compatible metadata.

## Consequences

Protocol fixtures become cross-language compatibility tests. Neither UI component types nor persistence entities are public protocol contracts by default.

