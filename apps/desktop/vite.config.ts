// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

const desktopManifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8")
) as { version: string; homepage: string };

export default defineConfig({
  base: "./",
  root: path.resolve(__dirname, "src/renderer"),
  plugins: [react()],
  define: {
    __COMMAND_IDE_VERSION__: JSON.stringify(desktopManifest.version),
    __COMMAND_IDE_SOURCE_REPOSITORY__: JSON.stringify(desktopManifest.homepage)
  },
  build: {
    outDir: path.resolve(__dirname, "dist/renderer"),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1"
  }
});
