export const TERMINAL_LAYOUT_SESSION_KEY = "command-ide:terminal-layout";

export function terminalExpandedFromStorage(value: string | null): boolean {
  return value !== "collapsed";
}

export function terminalStorageValue(expanded: boolean): "expanded" | "collapsed" {
  return expanded ? "expanded" : "collapsed";
}
