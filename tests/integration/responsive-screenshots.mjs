// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { electronLaunchPlan } from "./electron-launch.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const desktopRoot = path.join(repositoryRoot, "apps", "desktop");
const outputDirectory = path.join(repositoryRoot, "work", "responsive-screenshots");
const reportPath = path.join(outputDirectory, "responsive-report.json");
const desktopRequire = createRequire(path.join(desktopRoot, "package.json"));
const executable = desktopRequire("electron");
const javaExecutable = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  process.platform === "win32" ? "java.exe" : "java"
);
const inCi = Boolean(process.env.CI) || Boolean(process.env.GITHUB_ACTIONS);
const launch = electronLaunchPlan({
  platform: process.platform,
  executable,
  applicationArguments: ["."],
  inCi
});

fs.mkdirSync(outputDirectory, { recursive: true });
const child = spawn(launch.command, launch.args, {
  cwd: desktopRoot,
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_JAVA: javaExecutable,
    CMD_IDE_RESPONSIVE_CAPTURE_DIR: outputDirectory,
    CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", "responsive-capture-data"),
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
    reject(new Error("Responsive screenshot verification did not finish within five minutes"));
  }, 300_000);
  child.on("error", reject);
  child.on("exit", (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
});

const stdoutText = Buffer.concat(stdout).toString("utf8");
const stderrText = Buffer.concat(stderr).toString("utf8");
assert.equal(
  exit.code,
  0,
  `Responsive screenshot process failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
);
assert.ok(fs.existsSync(reportPath), "Responsive report was not created");
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
assert.equal(report.captureCount, 144);
assert.equal(report.expectedCaptureCount, 144);
assert.equal(report.additionalScalingCheckCount, 96);
assert.equal(report.expectedAdditionalScalingCheckCount, 96);
assert.deepEqual(report.failures, []);
for (const capture of report.captures) {
  const screenshot = path.join(outputDirectory, capture.file);
  assert.ok(fs.existsSync(screenshot), `Missing responsive screenshot ${capture.file}`);
  assert.ok(fs.statSync(screenshot).size > 1_000, `Responsive screenshot is unexpectedly small: ${capture.file}`);
}
assert.doesNotMatch(`${stdoutText}\n${stderrText}`, /ResizeObserver loop/i);

console.log(`Responsive desktop verification passed with ${report.captureCount} screenshots.`);
console.log(`Report: ${reportPath}`);
