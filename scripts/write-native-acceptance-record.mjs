// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  SCHEMA_VERSION,
  TARGETS,
  assert,
  validateCanvasProbe,
  validatePackageName,
  validatePtyProbe,
  validateRevision
} from "./native-acceptance-schema.mjs";

const options = parseArguments(process.argv.slice(2));
const definition = TARGETS[options.target];
assert(definition !== undefined, `Unsupported target: ${options.target}`);
assert(
  options.packageFormat === definition.packageFormat,
  `${options.target} requires package format ${definition.packageFormat}`
);

const canvas = validateCanvasProbe(readJsonFile(options.canvasResult), "canvas result");
const pty = validatePtyProbe(readJsonFile(options.ptyResult), "PTY result");
const sourceRevision = validateRevision(options.sourceRevision);
const packageName = validatePackageName(options.packageName);
const packageFile = regularFile(options.packageFile, "package candidate");
const record = {
  schemaVersion: SCHEMA_VERSION,
  sourceRevision,
  recordedAt: new Date().toISOString(),
  target: {
    id: definition.id,
    family: definition.family,
    version: definition.version,
    architecture: definition.architecture
  },
  artifact: {
    packageFormat: definition.packageFormat,
    packageName,
    packageFileName: path.basename(packageFile),
    packageSha256: sha256(packageFile),
    bundledJlinkRuntime: true
  },
  checks: {
    installed: true,
    packagedMetadataVerified: true,
    launchedWithSystemJavaOverridesCleared: true,
    rendererToWorkerWorkflow: true,
    nativePtyExecution: true,
    uninstalled: true,
    userDataPreserved: true
  },
  canvas,
  pty
};

writeJsonAtomically(options.output, record);
process.stdout.write(`Recorded native acceptance for ${definition.id} at ${path.resolve(options.output)}.\n`);

function parseArguments(argumentsList) {
  const names = new Map([
    ["--target", "target"],
    ["--package-format", "packageFormat"],
    ["--package-name", "packageName"],
    ["--package-file", "packageFile"],
    ["--source-revision", "sourceRevision"],
    ["--canvas-result", "canvasResult"],
    ["--pty-result", "ptyResult"],
    ["--output", "output"]
  ]);
  const result = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const property = names.get(flag);
    assert(property !== undefined, `Unknown argument: ${flag}`);
    assert(result[property] === undefined, `Duplicate argument: ${flag}`);
    const value = argumentsList[index + 1];
    assert(typeof value === "string" && value.trim() !== "", `Missing value for ${flag}`);
    result[property] = value;
  }
  for (const [flag, property] of names) {
    assert(result[property] !== undefined, `Missing required argument: ${flag}`);
  }
  return result;
}

function readJsonFile(file) {
  const resolved = regularFile(file, "probe result");
  try {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse probe result ${resolved}: ${error.message}`);
  }
}

function regularFile(file, label) {
  const resolved = path.resolve(file);
  const stat = fs.lstatSync(resolved);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${label} must be a regular file: ${resolved}`);
  return resolved;
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeJsonAtomically(file, value) {
  const outputPath = path.resolve(file);
  const parentDirectory = path.dirname(outputPath);
  fs.mkdirSync(parentDirectory, { recursive: true });
  const temporaryPath = path.join(
    parentDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx"
    });
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
}
