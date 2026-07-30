import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrapper = process.platform === "win32" ? "mvnw.cmd" : "./mvnw";
const javaHome = resolveJavaHome();
const result = spawnSync(wrapper, ["--batch-mode", ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    JAVA_HOME: javaHome
  }
});

if (result.error !== undefined) {
  throw result.error;
}
process.exit(result.status ?? 1);

function resolveJavaHome() {
  const configured = process.env.CMD_IDE_JAVA_HOME;
  if (configured !== undefined && configured.trim() !== "") {
    return configured;
  }

  const probe = spawnSync("java", ["-XshowSettings:properties", "-version"], {
    encoding: "utf8"
  });
  const output = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`;
  const match = /^\s*java\.home\s*=\s*(.+)$/m.exec(output);
  if (probe.status !== 0 || match?.[1] === undefined) {
    throw new Error("JDK 21 was not found on PATH; set CMD_IDE_JAVA_HOME");
  }
  return match[1].trim();
}
