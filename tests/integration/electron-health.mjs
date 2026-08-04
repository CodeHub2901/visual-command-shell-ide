// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { electronLaunchPlan } from "./electron-launch.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
const desktopRequire = createRequire(path.join(desktopRoot, "package.json"));
const electronExecutable = desktopRequire("electron");
const bundledJavaExecutable = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  process.platform === "win32" ? "java.exe" : "java"
);

const isLinux = process.platform === "linux";
const inCi = Boolean(process.env.CI) || Boolean(process.env.GITHUB_ACTIONS);
const { command, args } = electronLaunchPlan({
  platform: isLinux ? "linux" : process.platform,
  executable: electronExecutable,
  applicationArguments: ["."],
  inCi
});
const child = spawn(command, args, {
  cwd: desktopRoot,
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_JAVA: bundledJavaExecutable,
    CMD_IDE_SMOKE_TEST: "1",
    CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", "electron-smoke-data"),
    ELECTRON_ENABLE_LOGGING: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const stdout = [];
const stderr = [];
child.stdout.on("data", (chunk) => stdout.push(chunk));
child.stderr.on("data", (chunk) => stderr.push(chunk));

const exit = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    child.kill();
    reject(new Error(
      `Electron did not complete the renderer-to-Java and large-canvas checks in 40 seconds\n` +
      `stdout:\n${Buffer.concat(stdout).toString("utf8")}\n` +
      `stderr:\n${Buffer.concat(stderr).toString("utf8")}`
    ));
  }, 40_000);
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
});

const stderrText = Buffer.concat(stderr).toString("utf8");
const stdoutText = Buffer.concat(stdout).toString("utf8");
const applicationOutput = `${stdoutText}\n${stderrText}`;
assert.equal(
  exit.code,
  0,
  `Electron smoke failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
);
assert.doesNotMatch(applicationOutput, /Application startup failed|worker-error/i);
assert.doesNotMatch(applicationOutput, /ResizeObserver loop/i);
assert.match(applicationOutput, /offline catalog validated/i);
assert.match(applicationOutput, /(man|help|bundled) manual validated/i);
assert.match(applicationOutput, /tldr CC-BY 4\.0 attribution validated/i);
assert.match(applicationOutput, /generated ls -al \./i);
assert.ok(
  (applicationOutput.match(/generated ls -al \./gi) ?? []).length >= 2,
  `Expected Guided generation and Compact synchronized regeneration\n${applicationOutput}`
);
assert.match(applicationOutput, /parsed \d+ shell nodes/i);
assert.match(applicationOutput, /low risk hash [a-f0-9]{64}/i);
assert.match(applicationOutput, /copied \d+ command characters to clipboard/i);
assert.match(applicationOutput, /exact generated command clipboard action validated/i);
assert.match(applicationOutput, /semantic React Flow mutation validated/i);
assert.match(applicationOutput, /bundled Bash Language Server session validated/i);
assert.match(applicationOutput, /local xterm and redacted History workspace validated/i);
assert.match(applicationOutput, /structured bookmark persistence validated/i);
assert.match(applicationOutput, /ollama model boundary returned (available|unavailable|failed)/i);
assert.match(applicationOutput, /proposal-only Ollama review workspace validated/i);
assert.match(applicationOutput, /OpenAI write-only credential and curated-model workspace validated/i);
assert.match(applicationOutput, /passive local tooling detection validated/i);
assert.match(applicationOutput, /persisted System\/Light\/Dark glass appearance validated/i);
assert.match(applicationOutput, /keyboard shortcuts and workspace focus validated/i);
assert.match(applicationOutput, /collapsible terminal layout and session state validated/i);
assert.match(applicationOutput, /React Flow and local Monaco editors validated/i);
assert.match(
  applicationOutput,
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)/i
);
const canvasMeasurement = applicationOutput.match(
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)\./i
);
assert.ok(canvasMeasurement);
process.stdout.write(`${canvasMeasurement[0]}\n`);
process.stdout.write("Electron renderer-to-Java catalog/manual/editor/clipboard/semantic-graph/xterm/history/generator/parser/risk smoke passed.\n");
