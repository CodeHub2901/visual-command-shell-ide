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
const requestedWorkspaces = process.env.CMD_IDE_RESPONSIVE_WORKSPACES ?? "";
const groupedWorkspaces = process.env.CMD_IDE_RESPONSIVE_DEBUG === "1" || requestedWorkspaces.length > 0
  ? [requestedWorkspaces]
  : [
      "home",
      "command-manual",
      "command-guided",
      "command-editor",
      "command-review",
      "ai-assistant",
      "bookmarks",
      "history",
      "settings"
    ];
const reports = [];
const combinedOutput = [];

for (const [index, workspaceGroup] of groupedWorkspaces.entries()) {
  const groupDirectory = groupedWorkspaces.length === 1
    ? outputDirectory
    : path.join(outputDirectory, `.part-${index + 1}`);
  const groupReportPath = path.join(groupDirectory, "responsive-report.json");
  fs.mkdirSync(groupDirectory, { recursive: true });
  const child = spawn(launch.command, launch.args, {
    cwd: desktopRoot,
    windowsHide: true,
    env: {
      ...process.env,
      CMD_IDE_JAVA: javaExecutable,
      CMD_IDE_RESPONSIVE_CAPTURE_DIR: groupDirectory,
      CMD_IDE_RESPONSIVE_WORKSPACES: workspaceGroup,
      CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", `responsive-capture-data-${index + 1}`),
      ELECTRON_ENABLE_LOGGING: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = [];
  const stderr = [];
  let lastProgress = "no progress reported";
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
    const matches = chunk.toString("utf8").match(/\[responsive\][^\r\n]*/g);
    if (matches?.at(-1) !== undefined) lastProgress = matches.at(-1);
  });
  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(
        `Responsive screenshot group ${index + 1} did not finish within four minutes; ${lastProgress}`
      ));
    }, 240_000);
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
  const stdoutText = Buffer.concat(stdout).toString("utf8");
  const stderrText = Buffer.concat(stderr).toString("utf8");
  combinedOutput.push(stdoutText, stderrText);
  assert.equal(
    exit.code,
    0,
    `Responsive screenshot group ${index + 1} failed (signal=${exit.signal ?? "none"})\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`
  );
  assert.ok(fs.existsSync(groupReportPath), `Responsive report ${index + 1} was not created`);
  const groupReport = JSON.parse(fs.readFileSync(groupReportPath, "utf8"));
  reports.push(groupReport);
  if (groupedWorkspaces.length > 1) {
    for (const capture of groupReport.captures) {
      fs.copyFileSync(path.join(groupDirectory, capture.file), path.join(outputDirectory, capture.file));
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

const report = reports.length === 1 ? reports[0] : {
  generatedAt: new Date().toISOString(),
  platform: reports[0]?.platform ?? process.platform,
  captureCount: reports.reduce((total, entry) => total + entry.captureCount, 0),
  expectedCaptureCount: reports.reduce((total, entry) => total + entry.expectedCaptureCount, 0),
  additionalScalingCheckCount: reports.reduce((total, entry) => total + entry.additionalScalingCheckCount, 0),
  expectedAdditionalScalingCheckCount: reports.reduce(
    (total, entry) => total + entry.expectedAdditionalScalingCheckCount,
    0
  ),
  failures: reports.flatMap((entry) => entry.failures),
  captures: reports.flatMap((entry) => entry.captures),
  additionalScalingChecks: reports.flatMap((entry) => entry.additionalScalingChecks)
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
assert.equal(report.captureCount, report.expectedCaptureCount);
assert.equal(report.additionalScalingCheckCount, report.expectedAdditionalScalingCheckCount);
if (process.env.CMD_IDE_RESPONSIVE_DEBUG !== "1"
    && (process.env.CMD_IDE_RESPONSIVE_WORKSPACES ?? "").length === 0) {
  assert.equal(report.expectedCaptureCount, 162);
  assert.equal(report.expectedAdditionalScalingCheckCount, 108);
}
assert.deepEqual(report.failures, []);
for (const capture of report.captures) {
  const screenshot = path.join(outputDirectory, capture.file);
  assert.ok(fs.existsSync(screenshot), `Missing responsive screenshot ${capture.file}`);
  assert.ok(fs.statSync(screenshot).size > 1_000, `Responsive screenshot is unexpectedly small: ${capture.file}`);
}
assert.doesNotMatch(combinedOutput.join("\n"), /ResizeObserver loop/i);

console.log(`Responsive desktop verification passed with ${report.captureCount} screenshots.`);
console.log(`Report: ${reportPath}`);
