// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export const TERMINAL_LAYOUT_SESSION_KEY = "command-ide:terminal-layout";

export function terminalExpandedFromStorage(value: string | null): boolean {
  return value !== "collapsed";
}

export function terminalStorageValue(expanded: boolean): "expanded" | "collapsed" {
  return expanded ? "expanded" : "collapsed";
}
