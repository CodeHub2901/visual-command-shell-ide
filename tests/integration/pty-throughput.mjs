import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "linux") {
  process.stdout.write("End-to-end PTY throughput skipped: native Linux PTY required.\n");
  process.exit(0);
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultRuntimeJava = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  "java"
);
const javaExecutable = nonEmptyEnvironment("CMD_IDE_JAVA")
  ?? (fs.existsSync(defaultRuntimeJava) ? defaultRuntimeJava : "java");
const workerJar = nonEmptyEnvironment("CMD_IDE_WORKER_JAR")
  ?? path.join(repositoryRoot, "apps", "worker", "target", "worker-0.1.0-all.jar");
const dataDirectory = nonEmptyEnvironment("CMD_IDE_DATA_DIR")
  ?? path.join(repositoryRoot, "work", "pty-throughput-data");

assert.ok(fs.existsSync(workerJar), `Worker JAR does not exist: ${workerJar}`);
fs.mkdirSync(dataDirectory, { recursive: true });

const child = spawn(javaExecutable, ["-jar", workerJar], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_DATA_DIR: dataDirectory
  }
});
const stderr = [];
const pending = new Map();
const notifications = [];
let buffer = Buffer.alloc(0);

child.stderr.on("data", (chunk) => stderr.push(chunk));
child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (match === null) throw new Error("Worker response has no Content-Length");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.byteLength < start + length) return;
    const response = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
    buffer = buffer.subarray(start + length);
    if (response.method === "v1.execution.event") {
      notifications.push(response.params);
      continue;
    }
    const requestState = pending.get(response.id);
    if (requestState !== undefined) {
      pending.delete(response.id);
      clearTimeout(requestState.timeout);
      requestState.resolve(response);
    }
  }
});

const childExit = new Promise((resolve) => {
  child.on("exit", (code, signal) => {
    if (code !== null && code !== 0) {
      const error = new Error(
        `Worker exited with ${code} (signal=${signal ?? "none"}): `
          + Buffer.concat(stderr).toString("utf8")
      );
      for (const requestState of pending.values()) requestState.reject(error);
      pending.clear();
    }
    resolve({ code, signal });
  });
});

function request(id, method, params, timeoutMs = 20_000) {
  const message = { jsonrpc: "2.0", id, method, params };
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    child.stdin.write(Buffer.concat([
      Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "ascii"),
      payload
    ]));
  });
}

const outputCharacters = 4 * 1024 * 1024;
const program = {
  schemaVersion: "1.4.0",
  dialect: "bash",
  statements: [{
    type: "pipeline",
    nodeId: "pty-throughput-pipeline",
    operator: "|",
    stages: [{
      type: "command",
      nodeId: "pty-throughput-head",
      commandId: "head",
      options: [{
        optionId: "bytes",
        spelling: "-c",
        value: String(outputCharacters),
        valueKind: "literal"
      }],
      arguments: [{
        argumentId: "files",
        value: "/dev/zero",
        valueKind: "literal"
      }]
    }, {
      type: "command",
      nodeId: "pty-throughput-tr",
      commandId: "tr",
      options: [],
      arguments: [{
        argumentId: "set1",
        value: "\\000",
        valueKind: "literal"
      }, {
        argumentId: "set2",
        value: "x",
        valueKind: "literal"
      }]
    }]
  }]
};

try {
  const health = await request("pty-throughput-health", "v1.health.check", {});
  assert.equal(health.result.protocolVersion, "1.0");

  const risk = await request("pty-throughput-risk", "v1.risk.assess", { program });
  assert.equal(risk.error, undefined, `Risk assessment failed: ${JSON.stringify(risk.error)}`);
  assert.equal(risk.result.level, "low");

  const startedAt = performance.now();
  const started = await request("pty-throughput-start", "v1.execution.start", {
    program,
    reviewedScript: risk.result.script,
    reviewHash: risk.result.reviewHash,
    interfaceMode: "guided",
    confirmed: false,
    typedConfirmation: null,
    workingDirectory: repositoryRoot,
    columns: 120,
    rows: 30
  });
  assert.equal(started.error, undefined, `Execution start failed: ${JSON.stringify(started.error)}`);
  assert.ok(started.result.sessionId);

  const events = await waitForTerminalExit(started.result.sessionId);
  const elapsedMs = performance.now() - startedAt;
  const receivedCharacters = events
    .filter((event) => event.type === "output")
    .reduce((total, event) => total + event.data.length, 0);
  const exitEvent = events.findLast((event) => event.type === "exit");

  assert.equal(exitEvent?.exitStatus, 0);
  assert.ok(
    receivedCharacters >= outputCharacters,
    `PTY stream ended after ${receivedCharacters} of ${outputCharacters} expected characters`
  );
  assert.ok(
    elapsedMs < 15_000,
    `End-to-end PTY throughput exceeded 15000 ms: ${elapsedMs.toFixed(1)} ms`
  );
  assert.ok(
    !events.some((event) => event.type === "error"),
    `PTY stream reported an error: ${JSON.stringify(events.filter((event) => event.type === "error"))}`
  );

  const mebibytes = receivedCharacters / (1024 * 1024);
  const mebibytesPerSecond = mebibytes / (elapsedMs / 1000);
  process.stdout.write(
    `End-to-end PTY throughput: ${mebibytesPerSecond.toFixed(2)} MiB/s `
      + `(${mebibytes.toFixed(1)} MiB across framed JSON-RPC in ${elapsedMs.toFixed(1)} ms).\n`
  );
} finally {
  child.stdin.end();
  child.kill();
  await Promise.race([
    childExit,
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ]);
}

async function waitForTerminalExit(sessionId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const events = notifications.filter((event) => event.sessionId === sessionId);
    if (events.some((event) => event.type === "exit")) return events;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PTY session ${sessionId}`);
}

function nonEmptyEnvironment(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}
