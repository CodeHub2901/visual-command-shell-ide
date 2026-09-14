// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { createDesktopStartupPlan } from "./linux-startup";

describe("Linux desktop startup policy", () => {
  it("uses Ozone auto selection for a Wayland session", () => {
    const plan = createDesktopStartupPlan({
      platform: "linux",
      environment: { XDG_SESSION_TYPE: "wayland", XDG_CURRENT_DESKTOP: "GNOME" },
      dmiIdentity: "Dell Inc. Latitude"
    });

    expect(plan.ozonePlatformHint).toBe("auto");
    expect(plan.disableHardwareAcceleration).toBe(false);
    expect(plan.profile).toMatchObject({
      sessionType: "wayland",
      desktop: "GNOME",
      virtualization: "none",
      graphicsMode: "hardware",
      nativeTransparency: false,
      appliedWorkarounds: ["wayland-ozone-auto"]
    });
  });

  it("keeps native wallpaper transparency opt-in", () => {
    expect(createDesktopStartupPlan({
      platform: "linux",
      environment: { DISPLAY: ":0" }
    }).profile.nativeTransparency).toBe(false);

    expect(createDesktopStartupPlan({
      platform: "linux",
      environment: { DISPLAY: ":0", CMD_IDE_NATIVE_TRANSPARENCY: "1" }
    }).profile.nativeTransparency).toBe(true);
  });

  it("uses software rendering by default on VMware Linux guests", () => {
    const plan = createDesktopStartupPlan({
      platform: "linux",
      environment: { DISPLAY: ":0" },
      dmiIdentity: "VMware, Inc. VMware Virtual Platform"
    });

    expect(plan.disableHardwareAcceleration).toBe(true);
    expect(plan.profile.graphicsMode).toBe("software");
    expect(plan.profile.appliedWorkarounds).toContain("vmware-software-rendering");
  });

  it("allows an explicit hardware acceleration override on VMware", () => {
    const plan = createDesktopStartupPlan({
      platform: "linux",
      environment: { DISPLAY: ":0", CMD_IDE_HARDWARE_ACCELERATION: "1" },
      dmiIdentity: "VMware Virtual Platform"
    });

    expect(plan.disableHardwareAcceleration).toBe(false);
    expect(plan.profile.graphicsMode).toBe("hardware");
  });

  it("does not apply Linux workarounds on other platforms", () => {
    const plan = createDesktopStartupPlan({
      platform: "win32",
      environment: { CMD_IDE_DISABLE_GPU: "1", XDG_SESSION_TYPE: "wayland" },
      dmiIdentity: "VMware Virtual Platform"
    });

    expect(plan.profile.platform).toBe("windows");
    expect(plan.profile.appliedWorkarounds).toEqual([]);
    expect(plan.disableHardwareAcceleration).toBe(false);
    expect(plan.ozonePlatformHint).toBeNull();
  });
});
