import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const executable = packagedExecutable(repositoryRoot);
assert.ok(fs.existsSync(executable), `Packaged application does not exist: ${executable}`);
const metadataDirectory = path.join(path.dirname(executable), "resources", "metadata");
const metadataCheck = spawnSync(
  process.execPath,
  [path.join(repositoryRoot, "scripts", "verify-release-metadata.mjs"), "--metadata-dir", metadataDirectory],
  { cwd: repositoryRoot, encoding: "utf8" }
);
assert.equal(
  metadataCheck.status,
  0,
  `Packaged metadata verification failed\n${metadataCheck.stdout}\n${metadataCheck.stderr}`
);

const child = spawn(executable, [], {
  cwd: path.dirname(executable),
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_PACKAGED_SMOKE_TEST: "1",
    CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", "packaged-smoke-data"),
    CMD_IDE_JAVA: "",
    JAVA_HOME: "",
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
    reject(new Error("Packaged application did not complete its bundled-runtime smoke test"));
  }, 50_000);
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
  `Packaged smoke failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
);
assert.doesNotMatch(stderrText, /Application startup failed|worker-error|editor verification failed/i);
assert.match(stderrText, /bundled Bash Language Server session validated/i);
assert.match(stderrText, /OpenAI write-only credential and curated-model workspace validated/i);
assert.match(stderrText, /keyboard shortcuts and workspace focus validated/i);
assert.match(stderrText, /collapsible terminal layout and session state validated/i);
assert.match(
  stderrText,
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)/i
);
const canvasMeasurement = stderrText.match(
  /Interactive React Flow large-canvas: render \d+(?:\.\d+)? ms, zoom p95 \d+(?:\.\d+)? ms \(1,000 nodes\)\./i
);
assert.ok(canvasMeasurement);
process.stdout.write(`${canvasMeasurement[0]}\n`);
process.stdout.write("Packaged Electron app launched with its bundled jlink runtime and completed renderer-to-worker smoke checks.\n");

function packagedExecutable(root) {
  if (process.platform === "win32") {
    return path.join(root, "release", "win-unpacked", "Command IDE.exe");
  }
  if (process.platform === "linux") {
    return path.join(root, "release", "linux-unpacked", "command-ide");
  }
  throw new Error(`Packaged smoke is not configured for ${process.platform}`);
}
