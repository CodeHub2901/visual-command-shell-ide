// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export const ONBOARDING_STORAGE_KEY = "command-ide:onboarding-complete";
export const ONBOARDING_STORAGE_VALUE = "1";

export function onboardingCompleteFromStorage(value: string | null): boolean {
  return value === ONBOARDING_STORAGE_VALUE;
}
