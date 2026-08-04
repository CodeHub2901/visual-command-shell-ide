// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type DraftSaveState = "none" | "unsaved" | "changed" | "saved";

export function draftSaveState(savedProgram: unknown | null, draftProgram: unknown | null): DraftSaveState {
  if (draftProgram === null) return "none";
  if (savedProgram === null) return "unsaved";
  return JSON.stringify(savedProgram) === JSON.stringify(draftProgram) ? "saved" : "changed";
}
