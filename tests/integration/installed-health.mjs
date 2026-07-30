import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeProbeResult } from "./probe-result.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const configuredExecutable = process.env.CMD_IDE_INSTALLED_EXECUTABLE;
assert.ok(configuredExecutable, "CMD_IDE_INSTALLED_EXECUTABLE is required");
const executable = path.resolve(configuredExecutable);
assert.ok(fs.existsSync(executable), `Installed application does not exist: ${executable}`);

if (!executable.endsWith(".AppImage")) {
  const metadataDirectory = path.join(path.dirname(executable), "resources", "metadata");
  const metadataCheck = spawnSync(
    process.execPath,
    [path.join(repositoryRoot, "scripts", "verify-release-metadata.mjs"), "--metadata-dir", metadataDirectory],
    { cwd: repositoryRoot, encoding: "utf8" }
  );
  assert.equal(
    metadataCheck.status,
    0,
    `Installed metadata verification failed\n${metadataCheck.stdout}\n${metadataCheck.stderr}`
  );
}

const command = process.platform === "linux" ? "xvfb-run" : executable;
const args = process.platform === "linux" ? ["-a", executable] : [];
const child = spawn(command, args, {
  cwd: path.dirname(executable),
  env: {
    ...process.env,
    CMD_IDE_PACKAGED_SMOKE_TEST: "1",
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
    reject(new Error("Installed application did not complete its bundled-runtime smoke test"));
  }, 60_000);
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
  `Installed smoke failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
);
assert.doesNotMatch(applicationOutput, /Application startup failed|worker-error|editor verification failed/i);
assert.match(applicationOutput, /OpenAI write-only credential and curated-model workspace validated/i);
assert.match(applicationOutput, /keyboard shortcuts and workspace focus validated/i);
assert.match(applicationOutput, /collapsible terminal layout and session state validated/i);
const canvasMeasurement = applicationOutput.match(
  /Interactive React Flow large-canvas: render (\d+(?:\.\d+)?) ms, zoom p95 (\d+(?:\.\d+)?) ms \(1,000 nodes\)\./i
);
assert.ok(canvasMeasurement, `Installed smoke did not report a large-canvas measurement\n${applicationOutput}`);
writeProbeResult("CMD_IDE_CANVAS_RESULT_PATH", {
  schemaVersion: "1.0.0",
  probe: "interactive-canvas",
  nodeCount: 1_000,
  renderMs: Number(canvasMeasurement[1]),
  zoomP95Ms: Number(canvasMeasurement[2]),
  bundledRuntime: true,
  rendererWorkflow: true
});
process.stdout.write(`${canvasMeasurement[0]}\n`);
process.stdout.write("Installed app launched with bundled Java and passed renderer-to-worker smoke checks.\n");
