// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { newlyIntroducedVulnerabilities, vulnerabilityKeys } from "./compare-osv-results.mjs";

function report(packages) {
  return { results: [{ source: { path: "pnpm-lock.yaml", type: "lockfile" }, packages }] };
}

function vulnerablePackage(name, version, vulnerabilityIds) {
  return {
    package: { ecosystem: "npm", name, version },
    vulnerabilities: vulnerabilityIds.map((id) => ({ id }))
  };
}

const baseline = report([
  vulnerablePackage("existing-package", "1.0.0", ["GHSA-existing"])
]);
const unchanged = report([
  vulnerablePackage("existing-package", "1.0.0", ["GHSA-existing"])
]);
const introduced = report([
  vulnerablePackage("existing-package", "1.0.0", ["GHSA-existing"]),
  vulnerablePackage("new-package", "2.0.0", ["GHSA-new"])
]);

assert.equal(vulnerabilityKeys(baseline).size, 1);
assert.equal(vulnerabilityKeys({}).size, 0);
assert.equal(vulnerabilityKeys({ results: null }).size, 0);
assert.deepEqual(newlyIntroducedVulnerabilities(baseline, unchanged), []);
assert.deepEqual(
  newlyIntroducedVulnerabilities(baseline, introduced),
  ["npm\u0000new-package\u00002.0.0\u0000GHSA-new"]
);
assert.throws(() => vulnerabilityKeys({ unexpected: true }), /results array/u);
assert.throws(
  () => vulnerabilityKeys(report([{ package: { ecosystem: "npm", name: "invalid" } }])),
  /invalid package coordinate/u
);

process.stdout.write("OSV dependency comparison policy tests passed.\n");
