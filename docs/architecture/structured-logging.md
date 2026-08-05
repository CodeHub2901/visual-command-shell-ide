<!--
SPDX-FileCopyrightText: 2026 Divyang S Mistry
SPDX-License-Identifier: Apache-2.0
-->

# Structured logging

Command IDE writes a local JSON Lines trace for troubleshooting frontend,
Electron, and Java-worker flow without adding a logging panel to the product.
Electron prints the exact active file location to stderr at startup. The normal
location is Electron's platform-specific `app.getPath("logs")` directory with
the filename `command-ide.jsonl`.

The active file rotates at 5 MiB. One prior file is retained as
`command-ide.previous.jsonl`. Logs stay local and are never uploaded by the
application. Electron batches records once per event-loop turn and forces a
final flush during shutdown so normal request flow does not perform one
synchronous disk write per event.

## Correlated flow

Each line has this stable envelope:

```json
{"timestamp":"2026-08-05T12:00:00Z","level":"info","component":"electron-main","event":"rpc.request.completed","correlationId":"request-uuid","context":{"method":"v1.health.check","durationMs":8.4}}
```

- Renderer events use an explicit `[command-ide-renderer]` console prefix.
  Electron captures only this prefix, so normal browser messages do not become
  application logs and no new renderer IPC capability is exposed.
- Electron assigns the JSON-RPC UUID and logs request start, completion,
  cancellation, timeout, and connection errors.
- Java receives the same UUID and logs request receipt, outcome, and duration
  to stderr. Worker stdout remains exclusively reserved for framed JSON-RPC.
- Terminal input, resize traffic, Monaco document changes, completions, and
  hover requests are debug-level because they can be high frequency.

Useful retained values include event and method names, safe IDs, lifecycle
states, risk level, provider, interface mode, dimensions, counts, process ID,
error type/code, and elapsed milliseconds.

## Privacy boundary

Logs never intentionally retain:

- API keys, credentials, authorization values, or typed confirmations;
- generated/reviewed scripts, editor source, terminal input, or clipboard data;
- working directories, import/export paths, filenames, or project names;
- AI prompt/response text, search text, manual content, or terminal output.

Sensitive strings become a redacted marker containing only their character
count. Paths become `<redacted-path>`. Arrays become item counts. Error messages
are bounded and have the user home directory removed. Renderer error records
contain the error class and message length, not the message.

## Configuration

`CMD_IDE_LOG_LEVEL` accepts `debug`, `info`, `warn`, or `error`; the application
default is `info`. Use `debug` only for a focused local reproduction because it
includes high-frequency lifecycle metadata (still without content).

`CMD_IDE_LOG_STDERR=1` mirrors the normalized Electron JSON Lines records to
stderr. `CMD_IDE_LOG_DIR` overrides the destination directory and is intended
for development and isolated automated tests. Neither setting enables network
transport.

When sharing a diagnostic file, review it as you would any local application
log even though the logger applies redaction by default.
