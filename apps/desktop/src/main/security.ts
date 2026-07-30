import type { WebPreferences } from "electron";

export function secureWebPreferences(preload: string, packaged: boolean): WebPreferences {
  return Object.freeze({
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: !packaged,
    webviewTag: false
  });
}

