// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { detectSecrets, isSensitiveTrackedPath } from "./scan-secrets.mjs";

const samples = [
  ["private-key", ["-----BEGIN RSA ", "PRIVATE KEY-----"].join("")],
  ["aws-access-key", ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("")],
  ["github-token", ["gh", "p_", "a".repeat(40)].join("")],
  ["openai-api-key", ["s", "k-proj-", "b".repeat(40)].join("")],
  ["slack-token", ["xo", "xb-", "1234567890-", "c".repeat(24)].join("")],
  ["google-api-key", ["AI", "za", "d".repeat(35)].join("")],
  ["npm-access-token", ["np", "m_", "e".repeat(36)].join("")],
  ["stripe-live-key", ["s", "k_live_", "f".repeat(24)].join("")]
];

for (const [expectedRule, sample] of samples) {
  assert.deepEqual(detectSecrets(`first line\n${sample}\n`), [{ rule: expectedRule, line: 2 }]);
}

assert.deepEqual(detectSecrets("OPENAI_API_KEY=<redacted>\nsk-test\npassword=example"), []);
assert.equal(isSensitiveTrackedPath(".env"), true);
assert.equal(isSensitiveTrackedPath("config/production.pem"), true);
assert.equal(isSensitiveTrackedPath(".env.example"), false);
assert.equal(isSensitiveTrackedPath("docs/key-management.md"), false);

process.stdout.write(`Secret scanner rejected ${samples.length} credential formats without exposing their values.\n`);
