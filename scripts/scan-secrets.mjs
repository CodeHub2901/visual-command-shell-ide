// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SECRET_RULES = [
  {
    name: "private-key",
    pattern: /-----BEGIN (?:(?:RSA|DSA|EC|OPENSSH) )?PRIVATE KEY-----/gu
  },
  {
    name: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu
  },
  {
    name: "github-token",
    pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{36,255}\b/gu
  },
  {
    name: "openai-api-key",
    pattern: /\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{32,}\b/gu
  },
  {
    name: "slack-token",
    pattern: /\bxox(?:b|p|a|r|s)-[A-Za-z0-9-]{20,}\b/gu
  },
  {
    name: "google-api-key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/gu
  },
  {
    name: "npm-access-token",
    pattern: /\bnpm_[A-Za-z0-9]{36}\b/gu
  },
  {
    name: "stripe-live-key",
    pattern: /\b(?:sk|rk)_live_[0-9A-Za-z]{20,}\b/gu
  }
];

const SENSITIVE_FILE_PATTERN = /(?:^|\/)(?:\.env(?:\..+)?|[^/]+\.(?:key|pem|p12|pfx))$/iu;
const SAFE_TEMPLATE_PATTERN = /(?:^|\/)\.env\.(?:example|sample|template)$/iu;

export function detectSecrets(text) {
  const findings = [];
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      findings.push({
        rule: rule.name,
        line: lineNumberAt(text, match.index ?? 0)
      });
    }
  }
  return findings;
}

export function isSensitiveTrackedPath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  return SENSITIVE_FILE_PATTERN.test(normalized) && !SAFE_TEMPLATE_PATTERN.test(normalized);
}

export function scanRepository(repositoryRoot) {
  const trackedOutput = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: repositoryRoot,
      encoding: "buffer"
    }
  );
  const trackedPaths = trackedOutput
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "");
  const findings = [];

  for (const relativePath of trackedPaths) {
    if (isSensitiveTrackedPath(relativePath)) {
      findings.push({ file: relativePath, line: 1, rule: "sensitive-file" });
    }

    const content = readFileSync(path.join(repositoryRoot, relativePath));
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    for (const finding of detectSecrets(text)) {
      findings.push({ file: relativePath, ...finding });
    }
  }

  return { trackedFileCount: trackedPaths.length, findings };
}

function lineNumberAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = scanRepository(repositoryRoot);
  if (result.findings.length > 0) {
    for (const finding of result.findings) {
      process.stderr.write(`${finding.file}:${finding.line}: potential secret (${finding.rule})\n`);
    }
    process.stderr.write(
      `Secret scan failed with ${result.findings.length} finding(s); values were intentionally suppressed.\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Secret scan passed for ${result.trackedFileCount} repository files.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
