// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROTECTED_ATTRIBUTION = "SPDX-FileCopyrightText: 2026 Divyang S Mistry";
const SHA_PATTERN = /^[0-9a-f]{40}$/iu;

export function filesRemovingProtectedAttribution(diff) {
  const changes = new Map();
  let currentFile;

  for (const line of diff.split(/\r?\n/u)) {
    const fileMatch = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (fileMatch?.[2] !== undefined) {
      currentFile = fileMatch[2];
      changes.set(currentFile, { added: 0, removed: 0 });
      continue;
    }
    if (currentFile === undefined || !line.includes(PROTECTED_ATTRIBUTION)) continue;
    const counts = changes.get(currentFile);
    if (counts === undefined) continue;
    if (line.startsWith("-") && !line.startsWith("---")) counts.removed += 1;
    if (line.startsWith("+") && !line.startsWith("+++")) counts.added += 1;
  }

  return [...changes.entries()]
    .filter(([, counts]) => counts.removed > counts.added)
    .map(([file]) => file);
}

function main() {
  const [baseSha, headSha, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || !SHA_PATTERN.test(baseSha ?? "") || !SHA_PATTERN.test(headSha ?? "")) {
    throw new Error("Usage: node scripts/check-protected-attribution.mjs <base-sha> <head-sha>");
  }

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const diff = execFileSync(
    "git",
    [
      "diff",
      "--no-ext-diff",
      "--unified=0",
      "--diff-filter=MR",
      `${baseSha}...${headSha}`,
      "--",
      "apps",
      "packages",
      "scripts",
      "tests"
    ],
    { cwd: repositoryRoot, encoding: "utf8" }
  );
  const violations = filesRemovingProtectedAttribution(diff);

  if (violations.length > 0) {
    for (const file of violations) {
      process.stderr.write(`${file}: removed protected attribution for Divyang S Mistry\n`);
    }
    process.stderr.write("Protected copyright attribution check failed.\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write("Protected copyright attribution was preserved.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
