// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import {
  TARGETS,
  assert,
  validateAcceptanceRecord,
  validateRevision
} from "./native-acceptance-schema.mjs";

const options = parseArguments(process.argv.slice(2));
const recordsDirectory = path.resolve(options.recordsDirectory);
const directoryStat = fs.lstatSync(recordsDirectory);
assert(
  directoryStat.isDirectory() && !directoryStat.isSymbolicLink(),
  `Records directory must be a regular directory: ${recordsDirectory}`
);

const entries = fs.readdirSync(recordsDirectory, { withFileTypes: true });
assert(entries.length > 0, "Native acceptance records directory is empty");
const records = entries.map((entry) => {
  assert(!entry.isSymbolicLink(), `Native acceptance records do not accept symbolic links: ${entry.name}`);
  assert(entry.isFile() && entry.name.endsWith(".json"), `Unexpected acceptance artifact: ${entry.name}`);
  const file = path.join(recordsDirectory, entry.name);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse acceptance record ${entry.name}: ${error.message}`);
  }
  return {
    fileName: entry.name,
    ...validateAcceptanceRecord(value, `acceptance record ${entry.name}`)
  };
});

assert(
  records.length === Object.keys(TARGETS).length,
  `Expected ${Object.keys(TARGETS).length} native acceptance records, found ${records.length}`
);
const recordsByTarget = new Map();
for (const entry of records) {
  assert(
    !recordsByTarget.has(entry.definition.id),
    `Duplicate native acceptance record for ${entry.definition.id}`
  );
  recordsByTarget.set(entry.definition.id, entry);
}
for (const targetId of Object.keys(TARGETS)) {
  assert(recordsByTarget.has(targetId), `Missing native acceptance record for ${targetId}`);
}
const ubuntu24Artifact = recordsByTarget.get("ubuntu-24.04").record.artifact;
const ubuntu26Artifact = recordsByTarget.get("ubuntu-26.04").record.artifact;
assert(
  ubuntu24Artifact.packageName === ubuntu26Artifact.packageName
    && ubuntu24Artifact.packageFileName === ubuntu26Artifact.packageFileName
    && ubuntu24Artifact.packageSha256 === ubuntu26Artifact.packageSha256,
  "Ubuntu acceptance records do not refer to the same deb candidate"
);

const revisions = new Set(records.map((entry) => entry.sourceRevision));
assert(revisions.size === 1, "Native acceptance records do not share one source revision");
const sourceRevision = [...revisions][0];
if (options.expectedRevision !== undefined) {
  assert(
    sourceRevision === validateRevision(options.expectedRevision, "expected revision"),
    `Native acceptance records are for ${sourceRevision}, not ${options.expectedRevision.toLowerCase()}`
  );
}

process.stdout.write("Target         Package  Canvas render  Zoom p95  PTY throughput\n");
for (const targetId of Object.keys(TARGETS)) {
  const { record } = recordsByTarget.get(targetId);
  process.stdout.write(
    `${targetId.padEnd(14)} ${record.artifact.packageFormat.padEnd(8)} `
      + `${record.canvas.renderMs.toFixed(1).padStart(9)} ms  `
      + `${record.canvas.zoomP95Ms.toFixed(1).padStart(7)} ms  `
      + `${record.pty.mebibytesPerSecond.toFixed(2).padStart(10)} MiB/s\n`
  );
}
process.stdout.write(
  `Verified ${records.length} native acceptance records for source revision ${sourceRevision}.\n`
);

function parseArguments(argumentsList) {
  let recordsDirectory;
  let expectedRevision;
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    assert(typeof value === "string" && value.trim() !== "", `Missing value for ${flag}`);
    if (flag === "--records-dir") {
      assert(recordsDirectory === undefined, `Duplicate argument: ${flag}`);
      recordsDirectory = value;
    } else if (flag === "--expected-revision") {
      assert(expectedRevision === undefined, `Duplicate argument: ${flag}`);
      expectedRevision = value;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  assert(recordsDirectory !== undefined, "Missing required argument: --records-dir");
  return { recordsDirectory, expectedRevision };
}
