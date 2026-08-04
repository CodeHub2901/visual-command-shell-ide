// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export function electronLaunchPlan({
  platform,
  executable,
  applicationArguments = [],
  inCi = false
}) {
  if (platform !== "linux") {
    return { command: executable, args: [...applicationArguments] };
  }
  return {
    command: "xvfb-run",
    args: [
      "-a",
      "-s",
      "-screen 0 4096x2304x24",
      "--",
      executable,
      ...(inCi ? ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] : []),
      ...applicationArguments
    ]
  };
}
