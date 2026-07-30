import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workDirectory = path.join(repositoryRoot, "work");
fs.mkdirSync(workDirectory, { recursive: true });
const testDirectory = fs.mkdtempSync(path.join(workDirectory, "native-acceptance-records-"));
assert(isChildPath(workDirectory, testDirectory), "Unsafe native acceptance test directory");

const revision = "0123456789abcdef0123456789abcdef01234567";
const canvasResult = {
  schemaVersion: "1.0.0",
  probe: "interactive-canvas",
  nodeCount: 1_000,
  renderMs: 148.2,
  zoomP95Ms: 94.7,
  bundledRuntime: true,
  rendererWorkflow: true
};
const ptyResult = {
  schemaVersion: "1.0.0",
  probe: "pty-throughput",
  characters: 4 * 1024 * 1024,
  elapsedMs: 402.4,
  mebibytes: 4,
  mebibytesPerSecond: 9.94,
  exitStatus: 0,
  errorEvents: 0,
  framedTransport: true
};

try {
  const canvasPath = path.join(testDirectory, "canvas.json");
  const ptyPath = path.join(testDirectory, "pty.json");
  const recordsDirectory = path.join(testDirectory, "records");
  const debPath = path.join(testDirectory, "command-ide-test.deb");
  const rpmPath = path.join(testDirectory, "command-ide-test.rpm");
  fs.writeFileSync(canvasPath, `${JSON.stringify(canvasResult)}\n`, "utf8");
  fs.writeFileSync(ptyPath, `${JSON.stringify(ptyResult)}\n`, "utf8");
  fs.writeFileSync(debPath, "deb-candidate", "utf8");
  fs.writeFileSync(rpmPath, "rpm-candidate", "utf8");

  const targets = [
    ["ubuntu-24.04", "deb"],
    ["ubuntu-26.04", "deb"],
    ["fedora-44", "rpm"]
  ];
  for (const [target, packageFormat] of targets) {
    run("write-native-acceptance-record.mjs", [
      "--target", target,
      "--package-format", packageFormat,
      "--package-name", "command-ide",
      "--package-file", packageFormat === "deb" ? debPath : rpmPath,
      "--source-revision", revision,
      "--canvas-result", canvasPath,
      "--pty-result", ptyPath,
      "--output", path.join(recordsDirectory, `${target}-${packageFormat}.json`)
    ]);
  }

  const verified = run("verify-native-acceptance-records.mjs", [
    "--records-dir", recordsDirectory,
    "--expected-revision", revision
  ]);
  assert(verified.stdout.includes("Verified 3 native acceptance records"), "Verifier omitted its summary");

  const tamperedPath = path.join(recordsDirectory, "fedora-44-rpm.json");
  const tamperedRecord = JSON.parse(fs.readFileSync(tamperedPath, "utf8"));
  tamperedRecord.pty.elapsedMs = 15_000;
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tamperedRecord, null, 2)}\n`, "utf8");
  const rejected = execute("verify-native-acceptance-records.mjs", [
    "--records-dir", recordsDirectory,
    "--expected-revision", revision
  ]);
  assert(rejected.status !== 0, "Verifier accepted an out-of-budget PTY record");
  assert(
    `${rejected.stdout}\n${rejected.stderr}`.includes("elapsedMs"),
    "Out-of-budget rejection did not identify the PTY elapsed time"
  );

  tamperedRecord.pty.elapsedMs = ptyResult.elapsedMs;
  fs.writeFileSync(tamperedPath, `${JSON.stringify(tamperedRecord, null, 2)}\n`, "utf8");
  const mixedRevisionPath = path.join(recordsDirectory, "ubuntu-26.04-deb.json");
  const mixedRevisionRecord = JSON.parse(fs.readFileSync(mixedRevisionPath, "utf8"));
  mixedRevisionRecord.sourceRevision = "fedcba9876543210fedcba9876543210fedcba98";
  fs.writeFileSync(mixedRevisionPath, `${JSON.stringify(mixedRevisionRecord, null, 2)}\n`, "utf8");
  const mixedRevision = execute("verify-native-acceptance-records.mjs", [
    "--records-dir", recordsDirectory,
    "--expected-revision", revision
  ]);
  assert(mixedRevision.status !== 0, "Verifier accepted records from mixed source revisions");
  assert(
    `${mixedRevision.stdout}\n${mixedRevision.stderr}`.includes("source revision"),
    "Mixed-revision rejection did not identify the source revision"
  );
  process.stdout.write(
    "Native acceptance tooling verified the complete target matrix and rejected tampered evidence.\n"
  );
} finally {
  assert(isChildPath(workDirectory, testDirectory), "Unsafe native acceptance cleanup target");
  fs.rmSync(testDirectory, { recursive: true, force: true });
}

function run(scriptName, argumentsList) {
  const result = execute(scriptName, argumentsList);
  assert(result.status === 0, result.stderr || result.stdout || `${scriptName} failed`);
  return result;
}

function execute(scriptName, argumentsList) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, "scripts", scriptName), ...argumentsList], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

function isChildPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
