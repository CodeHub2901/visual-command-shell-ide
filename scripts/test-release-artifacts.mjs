import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = path.join(repositoryRoot, "work", "release-artifact-test");
assert(isChildPath(path.join(repositoryRoot, "work"), testDirectory), "Unsafe release artifact test directory");
if (fs.existsSync(testDirectory)) fs.rmSync(testDirectory, { recursive: true, force: true });
fs.mkdirSync(testDirectory, { recursive: true });

try {
  fs.writeFileSync(
    path.join(testDirectory, "Command-IDE-test.AppImage"),
    Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from("test-appimage")])
  );
  fs.writeFileSync(path.join(testDirectory, "command-ide-test.deb"), Buffer.from("!<arch>\ntest-deb", "ascii"));
  fs.writeFileSync(
    path.join(testDirectory, "command-ide-test.rpm"),
    Buffer.concat([Buffer.from([0xed, 0xab, 0xee, 0xdb]), Buffer.from("test-rpm")])
  );

  run("finalize-release.mjs", [
    "--release-dir",
    testDirectory,
    "--metadata-dir",
    path.join(repositoryRoot, "build", "release-metadata"),
    "--require-linux-packages"
  ]);
  run("verify-release-artifacts.mjs", [
    "--release-dir",
    testDirectory,
    "--require-linux-packages"
  ]);

  fs.appendFileSync(path.join(testDirectory, "command-ide-test.deb"), "tampered");
  const tampered = execute("verify-release-artifacts.mjs", [
    "--release-dir",
    testDirectory,
    "--require-linux-packages"
  ]);
  assert(tampered.status !== 0, "Artifact verification accepted a tampered package");
  assert(
    `${tampered.stdout}\n${tampered.stderr}`.includes("SHA-256 mismatch"),
    "Tamper rejection did not identify the checksum mismatch"
  );
  process.stdout.write("Release finalization accepted all package-format headers and rejected a tampered artifact.\n");
} finally {
  fs.rmSync(testDirectory, { recursive: true, force: true });
}

function run(scriptName, argumentsList) {
  const result = execute(scriptName, argumentsList);
  assert(result.status === 0, result.stderr || result.stdout || `${scriptName} failed`);
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
