// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { electronLaunchPlan } from "./electron-launch.mjs";

assert.deepEqual(
  electronLaunchPlan({
    platform: "linux",
    executable: "/opt/electron/electron",
    applicationArguments: ["."],
    inCi: true
  }),
  {
    command: "xvfb-run",
    args: [
      "-a",
      "-s",
      "-screen 0 4096x2304x24",
      "--",
      "/opt/electron/electron",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "."
    ]
  }
);

assert.deepEqual(
  electronLaunchPlan({
    platform: "linux",
    executable: "/opt/Command IDE/command-ide",
    inCi: false
  }),
  {
    command: "xvfb-run",
    args: ["-a", "-s", "-screen 0 4096x2304x24", "--", "/opt/Command IDE/command-ide"]
  }
);

assert.deepEqual(
  electronLaunchPlan({
    platform: "win32",
    executable: "C:\\Command IDE\\command-ide.exe",
    applicationArguments: ["--inspect-renderer"] ,
    inCi: true
  }),
  {
    command: "C:\\Command IDE\\command-ide.exe",
    args: ["--inspect-renderer"]
  }
);

process.stdout.write("Electron launch workarounds remain scoped to Linux CI.\n");
