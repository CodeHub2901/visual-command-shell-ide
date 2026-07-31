// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function vulnerabilityKeys(report) {
  if (
    report !== null
    && typeof report === "object"
    && !Array.isArray(report)
    && Object.keys(report).length === 0
  ) {
    return new Set();
  }
  if (!Array.isArray(report?.results)) {
    throw new Error("OSV report does not contain a results array");
  }

  const keys = new Set();
  for (const result of report.results) {
    if (!Array.isArray(result?.packages)) continue;
    for (const entry of result.packages) {
      const dependency = entry?.package;
      if (
        typeof dependency?.ecosystem !== "string"
        || typeof dependency?.name !== "string"
        || typeof dependency?.version !== "string"
      ) {
        throw new Error("OSV report contains an invalid package coordinate");
      }
      if (!Array.isArray(entry.vulnerabilities)) continue;
      for (const vulnerability of entry.vulnerabilities) {
        if (typeof vulnerability?.id !== "string" || vulnerability.id === "") {
          throw new Error("OSV report contains a vulnerability without an ID");
        }
        keys.add([
          dependency.ecosystem,
          dependency.name,
          dependency.version,
          vulnerability.id
        ].join("\u0000"));
      }
    }
  }
  return keys;
}

export function newlyIntroducedVulnerabilities(oldReport, newReport) {
  const oldKeys = vulnerabilityKeys(oldReport);
  return [...vulnerabilityKeys(newReport)]
    .filter((key) => !oldKeys.has(key))
    .sort();
}

function displayKey(key) {
  const [ecosystem, name, version, vulnerabilityId] = key.split("\u0000");
  return `${ecosystem}:${name}@${version} (${vulnerabilityId})`;
}

function readReport(fileName) {
  return JSON.parse(fs.readFileSync(path.resolve(fileName), "utf8"));
}

function main() {
  const [oldReportPath, newReportPath, ...extra] = process.argv.slice(2);
  if (oldReportPath === undefined || newReportPath === undefined || extra.length > 0) {
    throw new Error(
      "Usage: node scripts/compare-osv-results.mjs <old-results.json> <new-results.json>"
    );
  }

  const oldReport = readReport(oldReportPath);
  const newReport = readReport(newReportPath);
  const introduced = newlyIntroducedVulnerabilities(oldReport, newReport);
  if (introduced.length > 0) {
    for (const key of introduced) {
      process.stderr.write(`New vulnerable dependency: ${displayKey(key)}\n`);
    }
    process.stderr.write(
      `OSV dependency review rejected ${introduced.length} newly introduced vulnerability finding(s).\n`
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write("OSV dependency review found no newly introduced vulnerabilities.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
