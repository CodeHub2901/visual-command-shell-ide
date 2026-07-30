import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  bundledBashLanguageServerEnvironment,
  bundledJavaExecutable
} from "./worker-path";

describe("bundled Java runtime path", () => {
  it("uses the packaged runtime instead of a system JDK", () => {
    expect(bundledJavaExecutable("/opt/command-ide/resources", "linux")).toBe(
      path.join("/opt/command-ide/resources", "runtime", "bin", "java")
    );
    expect(bundledJavaExecutable("C:\\Command IDE\\resources", "win32")).toBe(
      path.join("C:\\Command IDE\\resources", "runtime", "bin", "java.exe")
    );
  });

  it("points the worker at the packaged language server and Electron runtime", () => {
    expect(bundledBashLanguageServerEnvironment(
      "/opt/Command IDE/resources/app.asar",
      "/opt/Command IDE/command-ide"
    )).toEqual({
      CMD_IDE_BLS_RUNTIME: path.resolve("/opt/Command IDE/command-ide"),
      CMD_IDE_BLS_ENTRYPOINT: path.join(
        path.resolve("/opt/Command IDE/resources/app.asar"),
        "node_modules",
        "bash-language-server",
        "out",
        "cli.js"
      )
    });
  });
});
