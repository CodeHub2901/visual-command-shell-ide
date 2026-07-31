// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const POLICY_BASELINE = "fc34ff45cf2f17806f3c3d160c5207e0cd99de25";
const SHA_PATTERN = /^[0-9a-f]{40}$/iu;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function hasAuthorSignoff(message, authorName, authorEmail) {
  const pattern = new RegExp(
    `^Signed-off-by:\\s+${escapeRegExp(authorName)}\\s+<${escapeRegExp(authorEmail)}>\\s*$`,
    "imu"
  );
  return pattern.test(message);
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim();
}

function isAncestor(repositoryRoot, ancestor, descendant) {
  return spawnSync(
    "git",
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { cwd: repositoryRoot, stdio: "ignore" }
  ).status === 0;
}

export function commitsRequiringSignoff(repositoryRoot, baseSha, headSha) {
  const commits = git(repositoryRoot, [
    "rev-list",
    "--no-merges",
    "--reverse",
    `${baseSha}..${headSha}`
  ])
    .split(/\r?\n/u)
    .filter((commit) => commit !== "");

  return commits.filter((commit) => !isAncestor(repositoryRoot, commit, POLICY_BASELINE));
}

function main() {
  const [baseSha, headSha, ...extra] = process.argv.slice(2);
  if (extra.length > 0 || !SHA_PATTERN.test(baseSha ?? "") || !SHA_PATTERN.test(headSha ?? "")) {
    throw new Error("Usage: node scripts/check-dco-signoffs.mjs <base-sha> <head-sha>");
  }

  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  git(repositoryRoot, ["cat-file", "-e", `${POLICY_BASELINE}^{commit}`]);
  const commits = commitsRequiringSignoff(repositoryRoot, baseSha, headSha);
  const unsigned = [];

  for (const commit of commits) {
    const details = execFileSync(
      "git",
      ["show", "-s", "--format=%an%x00%ae%x00%B", commit],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    const [authorName = "", authorEmail = "", ...messageParts] = details.split("\0");
    const message = messageParts.join("\0");
    if (!hasAuthorSignoff(message, authorName, authorEmail)) unsigned.push(commit);
  }

  if (unsigned.length > 0) {
    for (const commit of unsigned) {
      process.stderr.write(`${commit}: missing a Signed-off-by line matching the commit author\n`);
    }
    process.stderr.write(
      "DCO check failed. Amend each listed commit with `git commit --amend --signoff`.\n"
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `DCO sign-offs verified for ${commits.length} non-merge commit(s) created after the policy baseline.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
