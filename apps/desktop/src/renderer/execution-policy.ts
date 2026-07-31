// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type ExecutionRisk = "low" | "medium" | "high" | "critical";
export type InterfaceMode = "Guided" | "Compact";

export interface CriticalExecutionPolicy {
  phrase: string;
  blocked: boolean;
  ready: boolean;
}

export function criticalExecutionPolicy(
  risk: ExecutionRisk | null,
  mode: InterfaceMode,
  reviewHash: string | null,
  typedConfirmation: string
): CriticalExecutionPolicy {
  const phrase = reviewHash === null ? "" : `RUN ${reviewHash.slice(0, 12)}`;
  const critical = risk === "critical";
  return {
    phrase,
    blocked: critical && mode === "Guided",
    ready: !critical || mode === "Compact" && typedConfirmation === phrase
  };
}
