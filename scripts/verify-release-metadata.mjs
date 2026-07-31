// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataDirectory = resolveMetadataDirectory(process.argv.slice(2));
const bomFiles = [
  ["Java", "command-ide-java.cdx.json", ["pkg:maven/"]],
  ["Node", "command-ide-node.cdx.json", ["pkg:npm/"]],
  ["combined", "command-ide.cdx.json", ["pkg:maven/", "pkg:npm/"]]
];

assert(fs.existsSync(metadataDirectory), `Release metadata directory is missing: ${metadataDirectory}`);
assert(
  !fs.existsSync(path.join(metadataDirectory, "java-license-errors.xml")),
  "Maven left java-license-errors.xml in the release metadata"
);

for (const [label, fileName, requiredNamespaces] of bomFiles) {
  verifyBom(label, fileName, requiredNamespaces);
}

const licenseMapping = readRequired("java-licenses.xml");
assert(!licenseMapping.includes("<downloaderMessage>"), "Java license mapping contains download errors");
assert(
  (licenseMapping.match(/<dependency>/gu) ?? []).length >= 25,
  "Java license mapping has unexpectedly few production dependencies"
);

const javaLicenseDirectory = path.join(metadataDirectory, "java-licenses");
assert(
  fs.existsSync(javaLicenseDirectory) && fs.statSync(javaLicenseDirectory).isDirectory(),
  "Java license directory is missing"
);
const javaLicenseFiles = listFiles(javaLicenseDirectory);
assert(javaLicenseFiles.length >= 25, "Java dependency license directory is unexpectedly incomplete");
for (const file of javaLicenseFiles) {
  assert(fs.statSync(file).size > 100, `Java license file is unexpectedly short: ${file}`);
}

const notices = readRequired("THIRD-PARTY-NOTICES.txt");
assert(notices.length > 10_000, "Third-party notices are unexpectedly short");
assert(notices.includes("# Node production dependency license texts"), "Node notices section is missing");
assert(notices.includes("# Java production dependency license texts"), "Java notices section is missing");
assert(notices.includes("# Electron runtime license inventory"), "Electron runtime notices section is missing");
assert((notices.match(/Node license SHA-256:/gu) ?? []).length >= 10, "Node license coverage is incomplete");
for (const file of javaLicenseFiles) {
  const relative = path.relative(javaLicenseDirectory, file).split(path.sep).join("/");
  assert(notices.includes(`Java dependency license: ${relative}`), `Notice is missing ${relative}`);
}
assert(!/[ÂÃ�]|â[€™“”]/u.test(notices), "Third-party notices contain likely mojibake");
assert(readRequired("ELECTRON-LICENSE.txt").includes("Electron contributors"), "Electron license copy is invalid");
assert(
  readRequired("CHROMIUM-THIRD-PARTY-LICENSES.html").includes("Chromium software"),
  "Chromium third-party license inventory is invalid"
);

const runtimeModules = readRequired("RUNTIME-MODULES.txt")
  .trim()
  .split(/\r?\n/u)
  .map((entry) => entry.split("@")[0]);
const requiredRuntimeModules = [
  "java.base",
  "java.compiler",
  "java.desktop",
  "java.net.http",
  "java.sql",
  "jdk.crypto.ec",
  "jdk.unsupported"
];
for (const moduleName of requiredRuntimeModules) {
  assert(runtimeModules.includes(moduleName), `Bundled Java runtime is missing ${moduleName}`);
}
assert(readRequired("LICENSE.txt") === fs.readFileSync(path.join(repositoryRoot, "LICENSE"), "utf8"), "Project license copy differs from LICENSE");
assert(
  readRequired("COPYRIGHT.txt") === fs.readFileSync(path.join(repositoryRoot, "COPYRIGHT"), "utf8"),
  "Project copyright copy differs from COPYRIGHT"
);
assert(readRequired("NOTICE.txt") === fs.readFileSync(path.join(repositoryRoot, "NOTICE"), "utf8"), "Project notice copy differs from NOTICE");
assert(
  readRequired("TRADEMARKS.txt") === fs.readFileSync(path.join(repositoryRoot, "TRADEMARKS.md"), "utf8"),
  "Project trademark policy copy differs from TRADEMARKS.md"
);

process.stdout.write(
  `Verified ${bomFiles.length} CycloneDX 1.6 SBOMs, ${javaLicenseFiles.length} Java license files, `
  + "third-party notices, and bundled runtime modules.\n"
);

function verifyBom(label, fileName, requiredNamespaces) {
  const raw = readRequired(fileName);
  assert(!containsSensitivePath(raw), `${label} SBOM contains an absolute local path`);
  assert(!raw.includes("link%3A") && !raw.includes("file%3A"), `${label} SBOM contains a local dependency reference`);
  const bom = JSON.parse(raw);
  assert(bom.bomFormat === "CycloneDX", `${label} SBOM has the wrong format`);
  assert(bom.specVersion === "1.6", `${label} SBOM is not CycloneDX 1.6`);
  assert(bom.version === 1, `${label} SBOM has the wrong document version`);
  assert(bom.serialNumber === undefined, `${label} SBOM contains a nondeterministic serial number`);
  assert(bom.metadata?.timestamp === undefined, `${label} SBOM contains a nondeterministic timestamp`);
  assert(bom.metadata?.tools === undefined, `${label} SBOM contains nondeterministic tool metadata`);

  const root = bom.metadata?.component;
  assert(typeof root?.["bom-ref"] === "string", `${label} SBOM root reference is missing`);
  assert(Array.isArray(root.licenses) && root.licenses.length > 0, `${label} SBOM root license is missing`);
  const components = Array.isArray(bom.components) ? bom.components : [];
  assert(components.length > 0, `${label} SBOM has no components`);
  assert(isSorted(components.map((component) => component["bom-ref"])), `${label} components are not sorted`);

  const references = new Set([root["bom-ref"]]);
  for (const component of components) {
    const reference = component?.["bom-ref"];
    assert(typeof reference === "string" && reference !== "", `${label} component has no reference`);
    assert(!references.has(reference), `${label} SBOM has duplicate component reference ${reference}`);
    references.add(reference);
    assert(typeof component.name === "string" && component.name !== "", `${reference} has no name`);
    assert(typeof component.version === "string" && component.version !== "", `${reference} has no version`);
    assert(Array.isArray(component.licenses) && component.licenses.length > 0, `${reference} has no license`);
  }
  for (const namespace of requiredNamespaces) {
    assert([...references].some((reference) => reference.startsWith(namespace)), `${label} SBOM lacks ${namespace} components`);
  }
  if (label !== "Java") {
    assert([...references].some((reference) => reference.startsWith("pkg:npm/electron@")), `${label} SBOM lacks Electron`);
    assert([...references].some((reference) => reference.startsWith("pkg:generic/chromium@")), `${label} SBOM lacks Chromium`);
    assert([...references].some((reference) => reference.startsWith("pkg:generic/node.js@")), `${label} SBOM lacks embedded Node.js`);
  }

  const dependencies = Array.isArray(bom.dependencies) ? bom.dependencies : [];
  assert(isSorted(dependencies.map((dependency) => dependency.ref)), `${label} dependency graph is not sorted`);
  const dependencyReferences = new Set();
  for (const dependency of dependencies) {
    assert(references.has(dependency.ref), `${label} graph has unknown source ${dependency.ref}`);
    assert(!dependencyReferences.has(dependency.ref), `${label} graph repeats source ${dependency.ref}`);
    dependencyReferences.add(dependency.ref);
    const targets = dependency.dependsOn ?? [];
    assert(Array.isArray(targets) && isSorted(targets), `${dependency.ref} dependency targets are not sorted`);
    assert(new Set(targets).size === targets.length, `${dependency.ref} dependency targets are duplicated`);
    for (const target of targets) {
      assert(references.has(target), `${label} graph has unknown target ${target}`);
    }
  }
  assert(dependencyReferences.has(root["bom-ref"]), `${label} graph has no root entry`);
  assert(raw === stableJson(bom), `${label} SBOM JSON is not deterministically formatted`);
}

function containsSensitivePath(value) {
  const normalized = value.replace(/\\\\/gu, "/");
  return /(?:[A-Za-z]:\/Users\/|\/home\/|\/Users\/|\/tmp\/)/u.test(normalized);
}

function resolveMetadataDirectory(argumentsList) {
  if (argumentsList.length === 0) return path.join(repositoryRoot, "build", "release-metadata");
  if (argumentsList.length === 2 && argumentsList[0] === "--metadata-dir") {
    return path.resolve(repositoryRoot, argumentsList[1]);
  }
  throw new Error("Usage: verify-release-metadata.mjs [--metadata-dir <path>]");
}

function readRequired(fileName) {
  const target = path.join(metadataDirectory, fileName);
  assert(fs.existsSync(target), `Required release metadata is missing: ${target}`);
  return fs.readFileSync(target, "utf8");
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : entry.isFile() ? [target] : [];
    });
}

function isSorted(values) {
  return values.every((value, index) => index === 0 || String(values[index - 1]).localeCompare(String(value)) <= 0);
}

function stableJson(value) {
  return JSON.stringify(sortObject(value), null, 2) + "\n";
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortObject(child)])
    );
  }
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
