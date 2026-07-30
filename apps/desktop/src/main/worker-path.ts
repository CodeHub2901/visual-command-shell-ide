import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export function resolveWorkerJar(): string {
  const configured = process.env.CMD_IDE_WORKER_JAR;
  if (configured !== undefined && configured.trim() !== "") {
    return path.resolve(configured);
  }

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "worker", "worker-all.jar");
  }

  return path.resolve(
    app.getAppPath(),
    "..",
    "worker",
    "target",
    "worker-0.1.0-all.jar"
  );
}

export function bundledJavaExecutable(
  resourcesPath: string,
  platform: NodeJS.Platform = process.platform
): string {
  return path.join(resourcesPath, "runtime", "bin", platform === "win32" ? "java.exe" : "java");
}

export function resolveJavaExecutable(): string {
  const configured = process.env.CMD_IDE_JAVA;
  if (configured !== undefined && configured.trim() !== "") {
    return path.resolve(configured);
  }
  if (app.isPackaged) return bundledJavaExecutable(process.resourcesPath);

  const javaHome = process.env.JAVA_HOME;
  if (javaHome !== undefined && javaHome.trim() !== "") {
    const candidate = path.join(
      path.resolve(javaHome),
      "bin",
      process.platform === "win32" ? "java.exe" : "java"
    );
    if (fs.existsSync(candidate)) return candidate;
  }
  return "java";
}

export function bundledBashLanguageServerEnvironment(
  appPath: string,
  electronExecutable: string
): NodeJS.ProcessEnv {
  return {
    CMD_IDE_BLS_RUNTIME: path.resolve(electronExecutable),
    CMD_IDE_BLS_ENTRYPOINT: path.join(
      path.resolve(appPath),
      "node_modules",
      "bash-language-server",
      "out",
      "cli.js"
    )
  };
}
