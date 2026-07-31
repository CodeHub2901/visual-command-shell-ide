// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const releaseDirectory = path.resolve(repositoryRoot, options.releaseDirectory);
const checksumFile = path.join(releaseDirectory, "SHA256SUMS.txt");
const metadataDirectory = path.join(releaseDirectory, "metadata");

assert(fs.existsSync(checksumFile), `Checksum manifest is missing: ${checksumFile}`);
const entries = parseChecksumManifest(fs.readFileSync(checksumFile, "utf8"));
assert(entries.length > 0, "Checksum manifest is empty");
const checkedPaths = new Set();
for (const entry of entries) {
  assert(!checkedPaths.has(entry.relative.toLowerCase()), `Duplicate checksum path: ${entry.relative}`);
  checkedPaths.add(entry.relative.toLowerCase());
  const target = resolveReleasePath(entry.relative);
  assert(fs.existsSync(target) && fs.statSync(target).isFile(), `Checksummed file is missing: ${entry.relative}`);
  assert(sha256(target) === entry.digest, `SHA-256 mismatch: ${entry.relative}`);
}

const packages = listFiles(releaseDirectory, false).filter((file) => isLinuxPackage(path.basename(file)));
const metadataFiles = listFiles(metadataDirectory, true);
const expectedFiles = [...packages, ...metadataFiles]
  .map((file) => relativePath(releaseDirectory, file).toLowerCase())
  .sort();
assert(
  JSON.stringify([...checkedPaths].sort()) === JSON.stringify(expectedFiles),
  "Checksum manifest does not exactly cover the Linux packages and staged metadata"
);

if (options.requireLinuxPackages) {
  verifyPackageSet(packages);
  for (const file of packages) verifyPackageSignature(file);
}

const metadataVerification = spawnSync(
  process.execPath,
  [path.join(repositoryRoot, "scripts", "verify-release-metadata.mjs"), "--metadata-dir", metadataDirectory],
  { cwd: repositoryRoot, encoding: "utf8" }
);
assert(
  metadataVerification.status === 0,
  metadataVerification.stderr || metadataVerification.stdout || "Staged metadata verification failed"
);

process.stdout.write(
  `Verified SHA-256 checksums for ${entries.length} files`
  + `${options.requireLinuxPackages ? " and native Linux package-format headers" : ""}.\n`
);

function parseArguments(argumentsList) {
  const result = { releaseDirectory: "release", requireLinuxPackages: false };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--require-linux-packages") {
      result.requireLinuxPackages = true;
    } else if (argument === "--release-dir") {
      const value = argumentsList[index + 1];
      assert(typeof value === "string" && value !== "", "Missing value for --release-dir");
      result.releaseDirectory = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function parseChecksumManifest(value) {
  return value.trim().split(/\r?\n/u).map((line) => {
    const match = /^([a-f0-9]{64}) {2}(.+)$/u.exec(line);
    assert(match !== null, `Malformed checksum line: ${line}`);
    assert(!match[2].includes("\\"), `Checksum path must use forward slashes: ${match[2]}`);
    return { digest: match[1], relative: match[2] };
  });
}

function resolveReleasePath(relative) {
  assert(relative !== "" && !path.posix.isAbsolute(relative), `Unsafe checksum path: ${relative}`);
  const segments = relative.split("/");
  assert(!segments.includes("") && !segments.includes(".") && !segments.includes(".."), `Unsafe checksum path: ${relative}`);
  const target = path.resolve(releaseDirectory, ...segments);
  assert(isChildPath(releaseDirectory, target), `Checksum path escapes the release directory: ${relative}`);
  return target;
}

function verifyPackageSet(packages) {
  const extensions = new Set(packages.map(packageExtension));
  for (const extension of [".AppImage", ".deb", ".rpm"]) {
    assert(extensions.has(extension), `Linux release is missing a ${extension} package`);
  }
}

function verifyPackageSignature(file) {
  const bytes = fs.readFileSync(file).subarray(0, 8);
  if (file.endsWith(".AppImage")) {
    assert(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `${file} is not an ELF AppImage`);
  } else if (file.endsWith(".deb")) {
    assert(bytes.equals(Buffer.from("!<arch>\n", "ascii")), `${file} is not a Debian ar archive`);
  } else if (file.endsWith(".rpm")) {
    assert(bytes.subarray(0, 4).equals(Buffer.from([0xed, 0xab, 0xee, 0xdb])), `${file} is not an RPM archive`);
  }
}

function listFiles(directory, recursive) {
  assert(fs.existsSync(directory) && fs.statSync(directory).isDirectory(), `Directory is missing: ${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release verification does not accept symbolic links: ${target}`);
    if (entry.isFile()) return [target];
    if (entry.isDirectory() && recursive) return listFiles(target, true);
    return [];
  });
}

function packageExtension(file) {
  if (file.endsWith(".AppImage")) return ".AppImage";
  return path.extname(file).toLowerCase();
}

function isLinuxPackage(file) {
  return file.endsWith(".AppImage") || file.endsWith(".deb") || file.endsWith(".rpm");
}

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function relativePath(root, target) {
  const relative = path.relative(root, target);
  assert(relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative), `Unsafe release path: ${target}`);
  return relative.split(path.sep).join("/");
}

function isChildPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
