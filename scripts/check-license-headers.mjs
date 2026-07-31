// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SPDX_IDENTIFIER = "SPDX-License-Identifier: Apache-2.0";
const DEFAULT_SPDX_COPYRIGHT = "SPDX-FileCopyrightText: 2026 Divyang S Mistry";
const SPDX_COPYRIGHT_PREFIX = "SPDX-FileCopyrightText:";
const SOURCE_EXTENSIONS = new Set([".css", ".java", ".js", ".mjs", ".ts", ".tsx"]);
const SOURCE_ROOTS = new Set(["apps", "packages", "scripts", "tests"]);
const EXCLUDED_SEGMENTS = new Set(["dist", "dist-electron", "node_modules", "release", "target"]);

export function isLicenseHeaderCandidate(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return SOURCE_ROOTS.has(segments[0])
    && !segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))
    && SOURCE_EXTENSIONS.has(path.posix.extname(normalized));
}

export function hasApacheSpdxHeader(content) {
  const header = content.split(/\r?\n/u).slice(0, 8);
  return header.some(hasCopyrightOwner)
    && header.some((line) => line.includes(SPDX_IDENTIFIER));
}

export function addApacheSpdxHeader(relativePath, content) {
  if (hasApacheSpdxHeader(content)) return content;
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const extension = path.posix.extname(relativePath.replaceAll("\\", "/"));
  const comment = (value) => extension === ".css" ? `/* ${value} */` : `// ${value}`;
  const copyrightHeader = comment(DEFAULT_SPDX_COPYRIGHT);
  const licenseHeader = comment(SPDX_IDENTIFIER);
  const hasCopyright = content.split(/\r?\n/u).slice(0, 8)
    .some(hasCopyrightOwner);
  const hasLicense = content.split(/\r?\n/u).slice(0, 8)
    .some((line) => line.includes(SPDX_IDENTIFIER));

  if (hasLicense && !hasCopyright) {
    const licenseIndex = content.indexOf(SPDX_IDENTIFIER);
    const lineStart = content.lastIndexOf("\n", licenseIndex) + 1;
    return `${content.slice(0, lineStart)}${copyrightHeader}${lineEnding}${content.slice(lineStart)}`;
  }

  if (hasCopyright && !hasLicense) {
    const copyrightIndex = content.indexOf(SPDX_COPYRIGHT_PREFIX);
    const lineEnd = content.indexOf("\n", copyrightIndex);
    const insertionPoint = lineEnd === -1 ? content.length : lineEnd + 1;
    return `${content.slice(0, insertionPoint)}${licenseHeader}${lineEnding}${content.slice(insertionPoint)}`;
  }

  const header = `${copyrightHeader}${lineEnding}${licenseHeader}`;

  if (content.startsWith("#!")) {
    const firstLineEnd = content.indexOf(lineEnding);
    if (firstLineEnd === -1) return `${content}${lineEnding}${header}${lineEnding}`;
    const insertionPoint = firstLineEnd + lineEnding.length;
    return `${content.slice(0, insertionPoint)}${header}${lineEnding}${content.slice(insertionPoint)}`;
  }

  return `${header}${lineEnding}${lineEnding}${content}`;
}

function hasCopyrightOwner(line) {
  const markerIndex = line.indexOf(SPDX_COPYRIGHT_PREFIX);
  if (markerIndex === -1) return false;
  const owner = line.slice(markerIndex + SPDX_COPYRIGHT_PREFIX.length)
    .replace(/\*\/\s*$/u, "")
    .trim();
  return owner !== "";
}

export function inspectRepository(repositoryRoot, write) {
  const paths = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: repositoryRoot, encoding: "buffer" }
  ).toString("utf8").split("\0").filter((entry) => entry !== "");
  const candidates = paths.filter(isLicenseHeaderCandidate);
  const missing = [];

  for (const relativePath of candidates) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    const content = readFileSync(absolutePath, "utf8");
    if (hasApacheSpdxHeader(content)) continue;
    missing.push(relativePath);
    if (write) writeFileSync(absolutePath, addApacheSpdxHeader(relativePath, content), "utf8");
  }

  return { candidateCount: candidates.length, missing };
}

function main() {
  const write = process.argv.slice(2).includes("--write");
  if (process.argv.slice(2).some((argument) => argument !== "--write")) {
    throw new Error("Usage: node scripts/check-license-headers.mjs [--write]");
  }
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = inspectRepository(repositoryRoot, write);
  if (write) {
    process.stdout.write(
      `Added copyright and Apache-2.0 SPDX headers to ${result.missing.length} of ${result.candidateCount} original source files.\n`
    );
    return;
  }
  if (result.missing.length > 0) {
    for (const relativePath of result.missing) {
      process.stderr.write(
        `${relativePath}: missing ${SPDX_COPYRIGHT_PREFIX} <owner> or ${SPDX_IDENTIFIER}\n`
      );
    }
    process.stderr.write(`License header check failed for ${result.missing.length} source file(s).\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `Copyright and Apache-2.0 SPDX headers verified for ${result.candidateCount} original source files.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
