// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { hasAuthorSignoff } from "./check-dco-signoffs.mjs";

assert.equal(
  hasAuthorSignoff(
    "Add feature\n\nSigned-off-by: Divyang S Mistry <divyang.10@gmail.com>\n",
    "Divyang S Mistry",
    "divyang.10@gmail.com"
  ),
  true
);
assert.equal(
  hasAuthorSignoff(
    "Add feature\n\nSigned-off-by: Another Person <another@example.com>\n",
    "Divyang S Mistry",
    "divyang.10@gmail.com"
  ),
  false
);
assert.equal(
  hasAuthorSignoff("Add feature without a sign-off\n", "Divyang S Mistry", "divyang.10@gmail.com"),
  false
);

process.stdout.write("DCO sign-off policy tests passed.\n");
