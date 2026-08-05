// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StructuredLogger } from "./structured-logger";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createLogger(level: "debug" | "info" = "info") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "command-ide-logger-"));
  temporaryDirectories.push(directory);
  return new StructuredLogger({ component: "test", directory, level });
}

describe("StructuredLogger", () => {
  it("writes structured records and redacts sensitive values", () => {
    const logger = createLogger();
    logger.info("rpc.request.started", {
      method: "v1.execution.start",
      sessionId: "session-1",
      script: "rm -rf private",
      credential: "secret-value",
      filePath: "C:\\Users\\Example\\private.txt",
      columns: 120
    }, "request-1");
    logger.flush();

    const record = JSON.parse(fs.readFileSync(logger.filePath, "utf8")) as Record<string, unknown>;
    expect(record).toMatchObject({
      level: "info",
      component: "test",
      event: "rpc.request.started",
      correlationId: "request-1"
    });
    expect(JSON.stringify(record)).not.toContain("rm -rf private");
    expect(JSON.stringify(record)).not.toContain("secret-value");
    expect(JSON.stringify(record)).not.toContain("Example");
    expect(record.context).toMatchObject({
      method: "v1.execution.start",
      sessionId: "session-1",
      script: "<redacted:14 chars>",
      credential: "<redacted:12 chars>",
      filePath: "<redacted-path>",
      columns: 120
    });
  });

  it("honors levels and ingests prefixed renderer and worker records", () => {
    const logger = createLogger();
    logger.debug("ignored.debug");
    expect(logger.ingestRendererMessage(
      '[command-ide-renderer] {"level":"info","event":"workspace.changed","context":{"status":"ready"}}',
      "info"
    )).toBe(true);
    logger.ingestWorkerLine(
      '[command-ide-worker] {"level":"warn","event":"rpc.failed","correlationId":"abc"}'
    );
    logger.flush();

    const records = fs.readFileSync(logger.filePath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ component: "renderer", event: "workspace.changed" });
    expect(records[1]).toMatchObject({ component: "java-worker", event: "rpc.failed", correlationId: "abc" });
  });
});
