// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type WorkflowStepState = "complete" | "active" | "upcoming";

export function workflowProgress(
  hasCommand: boolean,
  hasValidatedDraft: boolean,
  reviewReady = false,
  hasRun = false
): readonly WorkflowStepState[] {
  if (!hasCommand) return ["active", "upcoming", "upcoming", "upcoming"];
  if (!hasValidatedDraft) return ["complete", "active", "upcoming", "upcoming"];
  if (!reviewReady) return ["complete", "complete", "active", "upcoming"];
  if (!hasRun) return ["complete", "complete", "complete", "active"];
  return ["complete", "complete", "complete", "complete"];
}
