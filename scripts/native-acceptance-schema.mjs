export const SCHEMA_VERSION = "1.0.0";

export const TARGETS = Object.freeze({
  "ubuntu-24.04": Object.freeze({
    id: "ubuntu-24.04",
    family: "ubuntu",
    version: "24.04",
    architecture: "x86-64",
    packageFormat: "deb"
  }),
  "ubuntu-26.04": Object.freeze({
    id: "ubuntu-26.04",
    family: "ubuntu",
    version: "26.04",
    architecture: "x86-64",
    packageFormat: "deb"
  }),
  "fedora-44": Object.freeze({
    id: "fedora-44",
    family: "fedora",
    version: "44",
    architecture: "x86-64",
    packageFormat: "rpm"
  })
});

const CHECK_NAMES = Object.freeze([
  "installed",
  "packagedMetadataVerified",
  "launchedWithSystemJavaOverridesCleared",
  "rendererToWorkerWorkflow",
  "nativePtyExecution",
  "uninstalled",
  "userDataPreserved"
]);

export function validateCanvasProbe(value, label = "canvas result") {
  assertPlainObject(value, label);
  assertExactKeys(value, [
    "schemaVersion",
    "probe",
    "nodeCount",
    "renderMs",
    "zoomP95Ms",
    "bundledRuntime",
    "rendererWorkflow"
  ], label);
  assert(value.schemaVersion === SCHEMA_VERSION, `${label} has an unsupported schemaVersion`);
  assert(value.probe === "interactive-canvas", `${label} has an unexpected probe`);
  assert(value.nodeCount === 1_000, `${label} must measure exactly 1,000 nodes`);
  assertFiniteRange(value.renderMs, 0, 15_000, `${label}.renderMs`);
  assertFiniteRange(value.zoomP95Ms, 0, 500, `${label}.zoomP95Ms`);
  assert(value.bundledRuntime === true, `${label} did not use the bundled runtime`);
  assert(value.rendererWorkflow === true, `${label} did not exercise the renderer workflow`);
  return value;
}

export function validatePtyProbe(value, label = "PTY result") {
  assertPlainObject(value, label);
  assertExactKeys(value, [
    "schemaVersion",
    "probe",
    "characters",
    "elapsedMs",
    "mebibytes",
    "mebibytesPerSecond",
    "exitStatus",
    "errorEvents",
    "framedTransport"
  ], label);
  assert(value.schemaVersion === SCHEMA_VERSION, `${label} has an unsupported schemaVersion`);
  assert(value.probe === "pty-throughput", `${label} has an unexpected probe`);
  assert(
    Number.isInteger(value.characters) && value.characters >= 4 * 1024 * 1024,
    `${label}.characters must be at least 4 MiB`
  );
  assertFiniteRange(value.elapsedMs, 0, 15_000, `${label}.elapsedMs`);
  assertFiniteRange(value.mebibytes, 4, Number.POSITIVE_INFINITY, `${label}.mebibytes`);
  assertFiniteRange(value.mebibytesPerSecond, 0, Number.POSITIVE_INFINITY, `${label}.mebibytesPerSecond`, true);
  assert(value.exitStatus === 0, `${label} has a nonzero exit status`);
  assert(value.errorEvents === 0, `${label} contains PTY errors`);
  assert(value.framedTransport === true, `${label} did not exercise framed transport`);
  return value;
}

export function validateAcceptanceRecord(value, label = "acceptance record") {
  assertPlainObject(value, label);
  assertExactKeys(value, [
    "schemaVersion",
    "sourceRevision",
    "recordedAt",
    "target",
    "artifact",
    "checks",
    "canvas",
    "pty"
  ], label);
  assert(value.schemaVersion === SCHEMA_VERSION, `${label} has an unsupported schemaVersion`);
  const sourceRevision = validateRevision(value.sourceRevision, `${label}.sourceRevision`);
  assert(
    typeof value.recordedAt === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.recordedAt)
      && Number.isFinite(Date.parse(value.recordedAt)),
    `${label}.recordedAt must be an ISO-8601 UTC timestamp`
  );

  assertPlainObject(value.target, `${label}.target`);
  assertExactKeys(value.target, ["id", "family", "version", "architecture"], `${label}.target`);
  const definition = TARGETS[value.target.id];
  assert(definition !== undefined, `${label} has an unsupported target: ${value.target.id}`);
  for (const key of ["id", "family", "version", "architecture"]) {
    assert(value.target[key] === definition[key], `${label}.target.${key} does not match ${definition.id}`);
  }

  assertPlainObject(value.artifact, `${label}.artifact`);
  assertExactKeys(
    value.artifact,
    ["packageFormat", "packageName", "packageFileName", "packageSha256", "bundledJlinkRuntime"],
    `${label}.artifact`
  );
  assert(
    value.artifact.packageFormat === definition.packageFormat,
    `${label} has the wrong package format for ${definition.id}`
  );
  validatePackageName(value.artifact.packageName);
  assert(
    typeof value.artifact.packageFileName === "string"
      && pathSafeFileName(value.artifact.packageFileName)
      && value.artifact.packageFileName.toLowerCase().endsWith(`.${definition.packageFormat}`),
    `${label}.artifact.packageFileName is invalid`
  );
  assert(
    typeof value.artifact.packageSha256 === "string"
      && /^[a-f0-9]{64}$/u.test(value.artifact.packageSha256),
    `${label}.artifact.packageSha256 must be a lowercase SHA-256 digest`
  );
  assert(value.artifact.bundledJlinkRuntime === true, `${label} did not use the bundled jlink runtime`);

  assertPlainObject(value.checks, `${label}.checks`);
  assertExactKeys(value.checks, CHECK_NAMES, `${label}.checks`);
  for (const checkName of CHECK_NAMES) {
    assert(value.checks[checkName] === true, `${label}.checks.${checkName} is not true`);
  }

  validateCanvasProbe(value.canvas, `${label}.canvas`);
  validatePtyProbe(value.pty, `${label}.pty`);
  return { record: value, definition, sourceRevision };
}

export function validateRevision(value, label = "source revision") {
  assert(
    typeof value === "string" && /^[a-f0-9]{40}$/iu.test(value),
    `${label} must be a 40-character Git commit SHA`
  );
  return value.toLowerCase();
}

export function validatePackageName(value) {
  assert(
    typeof value === "string" && /^[a-z0-9][a-z0-9._+-]{0,127}$/iu.test(value),
    "package name contains unsupported characters"
  );
  return value;
}

export function assertPlainObject(value, label) {
  assert(
    value !== null && typeof value === "object" && !Array.isArray(value),
    `${label} must be a JSON object`
  );
}

export function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} fields must be exactly: ${expected.join(", ")}`
  );
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFiniteRange(value, minimum, maximum, label, exclusiveMinimum = false) {
  const meetsMinimum = exclusiveMinimum ? value > minimum : value >= minimum;
  assert(
    typeof value === "number" && Number.isFinite(value) && meetsMinimum && value < maximum,
    `${label} must be a finite number ${exclusiveMinimum ? "greater than" : "at least"} `
      + `${minimum} and below ${maximum}`
  );
}

function pathSafeFileName(value) {
  return value !== ""
    && value !== "."
    && value !== ".."
    && value.length <= 256
    && !/[\\/\u0000-\u001f\u007f]/u.test(value);
}
