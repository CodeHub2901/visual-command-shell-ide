// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { filesRemovingProtectedAttribution } from "./check-protected-attribution.mjs";

const header = "SPDX-FileCopyrightText: 2026 Divyang S Mistry";

assert.deepEqual(filesRemovingProtectedAttribution([
  "diff --git a/apps/example.ts b/apps/example.ts",
  "@@ -1 +1 @@",
  `-// ${header}`,
  "+// SPDX-FileCopyrightText: 2026 Another Contributor"
].join("\n")), ["apps/example.ts"]);

assert.deepEqual(filesRemovingProtectedAttribution([
  "diff --git a/apps/example.ts b/apps/example.ts",
  "@@ -1 +1 @@",
  `-// ${header}`,
  `+/* ${header} */`
].join("\n")), []);

assert.deepEqual(filesRemovingProtectedAttribution([
  "diff --git a/apps/new.ts b/apps/new.ts",
  "@@ -0,0 +1 @@",
  "+// SPDX-FileCopyrightText: 2026 Another Contributor"
].join("\n")), []);

process.stdout.write("Protected copyright attribution policy tests passed.\n");
