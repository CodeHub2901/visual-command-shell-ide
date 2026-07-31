// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import {
  addApacheSpdxHeader,
  hasApacheSpdxHeader,
  isLicenseHeaderCandidate
} from "./check-license-headers.mjs";

const typescript = addApacheSpdxHeader("apps/desktop/src/example.ts", "export const value = 1;\n");
assert.match(
  typescript,
  /^\/\/ SPDX-FileCopyrightText: 2026 Divyang S Mistry\n\/\/ SPDX-License-Identifier: Apache-2\.0\n\n/u
);
assert.equal(hasApacheSpdxHeader(typescript), true);
assert.equal(addApacheSpdxHeader("example.ts", typescript), typescript);

const css = addApacheSpdxHeader("apps/desktop/src/styles.css", "body {}\r\n");
assert.match(
  css,
  /^\/\* SPDX-FileCopyrightText: 2026 Divyang S Mistry \*\/\r\n\/\* SPDX-License-Identifier: Apache-2\.0 \*\/\r\n\r\n/u
);

const executable = addApacheSpdxHeader("scripts/example.mjs", "#!/usr/bin/env node\nprocess.exit(0);\n");
assert.match(
  executable,
  /^#!\/usr\/bin\/env node\n\/\/ SPDX-FileCopyrightText: 2026 Divyang S Mistry\n\/\/ SPDX-License-Identifier: Apache-2\.0\n/u
);

const existingLicense = addApacheSpdxHeader(
  "tests/example.ts",
  "// SPDX-License-Identifier: Apache-2.0\n\nexport const value = 1;\n"
);
assert.match(
  existingLicense,
  /^\/\/ SPDX-FileCopyrightText: 2026 Divyang S Mistry\n\/\/ SPDX-License-Identifier: Apache-2\.0\n/u
);

assert.equal(isLicenseHeaderCandidate("apps/worker/src/main/java/Worker.java"), true);
assert.equal(isLicenseHeaderCandidate("apps/desktop/src/renderer/App.tsx"), true);
assert.equal(isLicenseHeaderCandidate("packages/contracts/dist/index.js"), false);
assert.equal(isLicenseHeaderCandidate("apps/worker/target/generated/Test.java"), false);
assert.equal(isLicenseHeaderCandidate("NOTICE"), false);

process.stdout.write("Apache-2.0 SPDX header policy tests passed.\n");
