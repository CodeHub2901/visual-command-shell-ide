import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
const desktopRequire = createRequire(path.join(desktopRoot, "package.json"));
const electronExecutable = desktopRequire("electron");

const command = process.platform === "linux" ? "xvfb-run" : electronExecutable;
const args = process.platform === "linux" ? ["-a", electronExecutable, "."] : ["."];
const child = spawn(command, args, {
  cwd: desktopRoot,
  windowsHide: true,
  env: {
    ...process.env,
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
assert.equal(
  exit.code,
  0,
  `Electron smoke failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
);
assert.doesNotMatch(stderrText, /Application startup failed|worker-error/i);
assert.match(stderrText, /offline catalog validated/i);
assert.match(stderrText, /(man|help|bundled) manual validated/i);
assert.match(stderrText, /tldr CC-BY 4\.0 attribution validated/i);
assert.match(stderrText, /generated ls -al \./i);
assert.ok(
  (stderrText.match(/generated ls -al \./gi) ?? []).length >= 2,
  `Expected Guided generation and Compact synchronized regeneration\n${stderrText}`
);
assert.match(stderrText, /parsed \d+ shell nodes/i);
assert.match(stderrText, /low risk hash [a-f0-9]{64}/i);
assert.match(stderrText, /copied \d+ command characters to clipboard/i);
assert.match(stderrText, /exact generated command clipboard action validated/i);
assert.match(stderrText, /semantic React Flow mutation validated/i);
assert.match(stderrText, /bundled Bash Language Server session validated/i);
assert.match(stderrText, /local xterm and redacted History workspace validated/i);
assert.match(stderrText, /structured bookmark persistence validated/i);
assert.match(stderrText, /ollama model boundary returned (available|unavailable|failed)/i);
assert.match(stderrText, /proposal-only Ollama review workspace validated/i);
assert.match(stderrText, /OpenAI write-only credential and curated-model workspace validated/i);
assert.match(stderrText, /passive local tooling detection validated/i);
assert.match(stderrText, /keyboard shortcuts and workspace focus validated/i);
assert.match(stderrText, /collapsible terminal layout and session state validated/i);
assert.match(stderrText, /React Flow and local Monaco editors validated/i);
assert.match(
  stderrText,
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)/i
);
const canvasMeasurement = stderrText.match(
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)\./i
);
assert.ok(canvasMeasurement);
process.stdout.write(`${canvasMeasurement[0]}\n`);
process.stdout.write("Electron renderer-to-Java catalog/manual/editor/clipboard/semantic-graph/xterm/history/generator/parser/risk smoke passed.\n");
