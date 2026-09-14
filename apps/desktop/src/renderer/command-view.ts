// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type CommandView = "manual" | "guided" | "editor" | "review";

export function catalogSelectionView(): CommandView {
  return "manual";
}

export function buildCommandView(): CommandView {
  return "guided";
}

export function interfaceModeView(mode: "Guided" | "Compact"): CommandView {
  return mode === "Guided" ? "guided" : "editor";
}
