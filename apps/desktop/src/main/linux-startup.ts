// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import type { DesktopEnvironmentProfile } from "@cmd-ide/contracts";

type StartupEnvironment = Readonly<Record<string, string | undefined>>;

export type DesktopStartupPlan = Readonly<{
  profile: DesktopEnvironmentProfile;
  disableHardwareAcceleration: boolean;
  ozonePlatformHint: "auto" | null;
}>;

function normalizedPlatform(platform: NodeJS.Platform): DesktopEnvironmentProfile["platform"] {
  if (platform === "linux") return "linux";
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "other";
}

function linuxSessionType(environment: StartupEnvironment): DesktopEnvironmentProfile["sessionType"] {
  const declared = environment.XDG_SESSION_TYPE?.trim().toLowerCase();
  if (declared === "wayland" || environment.WAYLAND_DISPLAY?.trim()) return "wayland";
  if (declared === "x11" || environment.DISPLAY?.trim()) return "x11";
  return "unknown";
}

function virtualizationFromDmi(dmiIdentity: string): DesktopEnvironmentProfile["virtualization"] {
  const value = dmiIdentity.trim().toLowerCase();
  if (value.length === 0) return "unknown";
  if (value.includes("vmware")) return "vmware";
  if (/(virtualbox|kvm|qemu|hyper-v|parallels|virtual machine)/u.test(value)) return "other";
  return "none";
}

export function createDesktopStartupPlan(input: Readonly<{
  platform: NodeJS.Platform;
  environment: StartupEnvironment;
  dmiIdentity?: string;
}>): DesktopStartupPlan {
  const platform = normalizedPlatform(input.platform);
  const isLinux = platform === "linux";
  const sessionType = isLinux ? linuxSessionType(input.environment) : "unknown";
  const virtualization = isLinux
    ? virtualizationFromDmi(input.dmiIdentity ?? "")
    : "unknown";
  const explicitlyDisableGpu = input.environment.CMD_IDE_DISABLE_GPU === "1";
  const explicitlyEnableGpu = input.environment.CMD_IDE_HARDWARE_ACCELERATION === "1";
  const vmwareFallback = virtualization === "vmware" && !explicitlyEnableGpu;
  const disableHardwareAcceleration = isLinux && (explicitlyDisableGpu || vmwareFallback);
  const appliedWorkarounds: DesktopEnvironmentProfile["appliedWorkarounds"] = [];

  if (isLinux && sessionType === "wayland") appliedWorkarounds.push("wayland-ozone-auto");
  if (disableHardwareAcceleration) {
    appliedWorkarounds.push(explicitlyDisableGpu
      ? "environment-software-rendering"
      : "vmware-software-rendering");
  }

  const desktop = isLinux
    ? (input.environment.XDG_CURRENT_DESKTOP ?? input.environment.DESKTOP_SESSION)?.trim() || null
    : null;

  return {
    profile: {
      platform,
      sessionType,
      desktop,
      virtualization,
      graphicsMode: disableHardwareAcceleration ? "software" : "hardware",
      nativeTransparency: input.environment.CMD_IDE_NATIVE_TRANSPARENCY === "1",
      appliedWorkarounds
    },
    disableHardwareAcceleration,
    ozonePlatformHint: isLinux && sessionType === "wayland" ? "auto" : null
  };
}
