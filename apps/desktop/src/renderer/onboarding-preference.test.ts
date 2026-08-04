// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { onboardingCompleteFromStorage, ONBOARDING_STORAGE_VALUE } from "./onboarding-preference";

describe("onboarding preference", () => {
  it("recognizes only the current completion marker", () => {
    expect(onboardingCompleteFromStorage(ONBOARDING_STORAGE_VALUE)).toBe(true);
    expect(onboardingCompleteFromStorage(null)).toBe(false);
    expect(onboardingCompleteFromStorage("0")).toBe(false);
    expect(onboardingCompleteFromStorage("future-version")).toBe(false);
  });
});
