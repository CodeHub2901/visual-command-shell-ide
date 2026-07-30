import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const javaExecutable = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  process.platform === "win32" ? "java.exe" : "java"
);

if (!fs.existsSync(javaExecutable)) {
  throw new Error(`Bundled Java runtime was not built: ${javaExecutable}`);
}

const child = spawn(process.execPath, ["tests/integration/worker-health.mjs"], {
  cwd: repositoryRoot,
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_JAVA: javaExecutable
  }
});

child.on("error", (error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.stderr.write(`Bundled-runtime smoke terminated by ${signal}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
