# ADR 0004: Local persistence

- Status: Accepted
- Date: 2026-07-18

## Decision

Use SQLite for settings, projects, structured bookmarks, catalog caches, and redacted history. Apply numbered transactional migrations. Repository interfaces separate domain models from tables. User-facing project files remain versioned `.cmdbuilder.json` documents.

Credentials, PTY input, sudo passwords, unredacted terminal secrets, and raw AI keys are forbidden from the database.

## Consequences

Migration, corruption recovery, backup, redaction, and data-retention behavior require tests before beta.

