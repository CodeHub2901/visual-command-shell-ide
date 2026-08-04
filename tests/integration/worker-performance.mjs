// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workerJar = path.join(repositoryRoot, "apps", "worker", "target", "worker-0.1.0-beta.1-all.jar");
const bundledJava = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  process.platform === "win32" ? "java.exe" : "java"
);
const javaExecutable = process.env.CMD_IDE_JAVA
  ?? (fs.existsSync(bundledJava) ? bundledJava : "java");
const startedAt = performance.now();
const child = spawn(javaExecutable, ["-jar", workerJar], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", "performance-worker-data")
  }
});

const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));
let buffer = Buffer.alloc(0);
const pending = new Map();
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
    const request = pending.get(response.id);
    if (request !== undefined) {
      pending.delete(response.id);
      clearTimeout(request.timeout);
      request.resolve(response);
    }
  }
});

function request(id, method, params) {
  const payload = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "utf8");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Performance request timed out: ${method}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout });
    child.stdin.write(Buffer.concat([
      Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "ascii"),
      payload
    ]));
  });
}

async function timed(id, method, params) {
  const start = performance.now();
  const response = await request(id, method, params);
  assert.equal(response.error, undefined, `${method} returned an RPC error`);
  return { elapsedMs: performance.now() - start, result: response.result };
}

const health = await timed("perf-health", "v1.health.check", {});
const startupMs = performance.now() - startedAt;
assert.ok(startupMs < 8_000, `Worker startup exceeded 8000 ms: ${startupMs.toFixed(1)}`);

await timed("perf-catalog-warm", "v1.catalog.search", { query: "file", limit: 50 });
const searchTimes = [];
for (let index = 0; index < 30; index += 1) {
  const sample = await timed(`perf-catalog-${index}`, "v1.catalog.search", {
    query: index % 2 === 0 ? "file" : "process",
    limit: 50
  });
  searchTimes.push(sample.elapsedMs);
}
searchTimes.sort((left, right) => left - right);
const searchP95Ms = searchTimes[Math.ceil(searchTimes.length * 0.95) - 1];
assert.ok(searchP95Ms < 250, `Catalog search p95 exceeded 250 ms: ${searchP95Ms.toFixed(1)}`);

const manual = await timed("perf-manual", "v1.manual.get", { commandId: "ls" });
assert.ok(manual.elapsedMs < 3_000, `Manual rendering exceeded 3000 ms: ${manual.elapsedMs.toFixed(1)}`);

const largeSource = Array.from(
  { length: 2_000 },
  (_, index) => `echo line-${index}`
).join("\n");
const parsed = await timed("perf-large-parse", "v1.shell.parse", { source: largeSource });
assert.ok(parsed.elapsedMs < 5_000, `Large-script parse exceeded 5000 ms: ${parsed.elapsedMs.toFixed(1)}`);
assert.ok(parsed.result.sourceSpans.length > 0);

const risk = await timed("perf-large-risk", "v1.risk.assess", {
  program: parsed.result.program
});
assert.ok(risk.elapsedMs < 5_000, `Large-script risk pass exceeded 5000 ms: ${risk.elapsedMs.toFixed(1)}`);

child.stdin.end();
child.kill();
process.stdout.write(
  `Performance budgets passed: startup ${startupMs.toFixed(1)} ms, `
  + `catalog p95 ${searchP95Ms.toFixed(1)} ms, manual ${manual.elapsedMs.toFixed(1)} ms, `
  + `2000-line parse ${parsed.elapsedMs.toFixed(1)} ms, risk ${risk.elapsedMs.toFixed(1)} ms.\n`
);
