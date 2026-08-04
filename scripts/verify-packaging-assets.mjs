// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDirectory = path.join(repositoryRoot, "apps", "desktop");
const workspaceManifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(desktopDirectory, "package.json"), "utf8"));
const contractsManifest = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "packages", "contracts", "package.json"), "utf8")
);
const rootPom = fs.readFileSync(path.join(repositoryRoot, "pom.xml"), "utf8");
const workerPom = fs.readFileSync(path.join(repositoryRoot, "apps", "worker", "pom.xml"), "utf8");
const viteConfig = fs.readFileSync(path.join(desktopDirectory, "vite.config.ts"), "utf8");
const notice = fs.readFileSync(path.join(repositoryRoot, "NOTICE"), "utf8");
const copyright = fs.readFileSync(path.join(repositoryRoot, "COPYRIGHT"), "utf8");
const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf8");
const messages = fs.readFileSync(path.join(desktopDirectory, "src", "shared", "messages", "en.ts"), "utf8");
const betaReleaseNotes = fs.readFileSync(
  path.join(repositoryRoot, "docs", "release", "0.1.0-beta.md"),
  "utf8"
);
const legalOwner = "Divyang S Mistry";
const expectedIcon = "assets/packaging/icon.svg";
const iconPath = path.join(desktopDirectory, expectedIcon);
const expectedBashLanguageServerVersion = "5.6.0";
const expectedReleaseVersion = "0.1.0-beta.1";
const bashLanguageServerDirectory = path.join(
  desktopDirectory,
  "node_modules",
  "bash-language-server"
);

assert(
  manifest.homepage === "https://github.com/CodeHub2901/visual-command-shell-ide",
  "Package homepage does not identify the canonical repository"
);
assert(
  workspaceManifest.version === expectedReleaseVersion
    && manifest.version === expectedReleaseVersion
    && contractsManifest.version === expectedReleaseVersion
    && rootPom.includes(`<version>${expectedReleaseVersion}</version>`)
    && workerPom.includes(`<version>${expectedReleaseVersion}</version>`),
  "Node and Maven release versions are not synchronized"
);
assert(
  betaReleaseNotes.startsWith(`# Command IDE ${expectedReleaseVersion} release notes`),
  "Beta release notes do not identify the packaged version"
);
for (const screenshot of [
  "catalog-wide.png",
  "visual-builder.png",
  "script-editor.png",
  "manual-compact-150pct.png",
  "settings-minimum-200pct.png"
]) {
  const screenshotPath = path.join(
    repositoryRoot,
    "docs",
    "release",
    "images",
    expectedReleaseVersion,
    screenshot
  );
  assert(
    fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 100_000,
    `Verified release screenshot is missing or unexpectedly small: ${screenshot}`
  );
}
assert(
  workspaceManifest.license === "Apache-2.0" && manifest.license === "Apache-2.0",
  "Workspace and desktop manifests must declare Apache-2.0"
);
assert(
  rootPom.includes("<name>Apache License, Version 2.0</name>")
    && rootPom.includes("https://www.apache.org/licenses/LICENSE-2.0.txt")
    && rootPom.includes(`<name>${legalOwner}</name>`),
  "Maven metadata must declare Apache License 2.0"
);
for (const [label, content] of [
  ["COPYRIGHT", copyright],
  ["NOTICE", notice],
  ["README", readme],
  ["legal UI messages", messages]
]) {
  assert(content.includes(`Copyright 2026 ${legalOwner}`), `${label} does not identify the legal copyright owner`);
}
assert(
  fs.existsSync(path.join(repositoryRoot, "TRADEMARKS.md")),
  "Project trademark policy is missing"
);
assert(
  viteConfig.includes("__COMMAND_IDE_VERSION__")
    && viteConfig.includes("__COMMAND_IDE_SOURCE_REPOSITORY__"),
  "Renderer legal metadata must derive its version and source repository from the desktop manifest"
);
assert(
  workspaceManifest.scripts?.["dist:linux"]?.includes("--publish never")
    && workspaceManifest.scripts?.["dist:linux"]?.includes("--config.productName=CommandIDE"),
  "Linux distribution must use a package-safe product directory and must not implicitly publish from CI"
);
assert(
  workspaceManifest.author?.name === "Divyang S Mistry"
    && manifest.author?.name === "Divyang S Mistry"
    && manifest.author?.email === "CodeHub2901@users.noreply.github.com",
  "Package author metadata is incomplete"
);
assert(manifest.desktopName === "dev.commandide.desktop", "Linux desktopName is not stable");
assert(manifest.build?.linux?.syncDesktopName === true, "Linux desktop filename is not synchronized");
assert(manifest.build?.linux?.desktop?.entry?.Name === "Command IDE", "Linux desktop display name is not stable");
assert(manifest.build?.linux?.executableName === "command-ide", "Linux executable name is not package-safe");
assert(
  manifest.build?.deb?.packageName === "command-ide"
    && manifest.build?.rpm?.packageName === "command-ide",
  "Native Linux package names are not package-safe"
);
assert(
  manifest.build?.linux?.artifactName === "command-ide-${version}-${arch}.${ext}",
  "Linux artifact name is not stable"
);
assert(
  manifest.build?.linux?.maintainer === "Divyang S Mistry <CodeHub2901@users.noreply.github.com>",
  "Linux maintainer metadata is incomplete"
);
assert(manifest.build?.linux?.icon === expectedIcon, "Linux package does not use the source icon");
assert(manifest.build?.win?.icon === expectedIcon, "Windows package does not use the source icon");
assert(fs.existsSync(iconPath) && fs.statSync(iconPath).isFile(), "Packaging icon is missing");
assert(fs.statSync(iconPath).size <= 100_000, "Packaging icon is unexpectedly large");
assert(
  manifest.dependencies?.["bash-language-server"] === expectedBashLanguageServerVersion,
  "Bash Language Server must be an exact production dependency"
);
const bashLanguageServerManifest = JSON.parse(
  fs.readFileSync(path.join(bashLanguageServerDirectory, "package.json"), "utf8")
);
assert(
  bashLanguageServerManifest.version === expectedBashLanguageServerVersion
    && bashLanguageServerManifest.license === "MIT",
  "Installed Bash Language Server version/license does not match packaging policy"
);
for (const relative of ["out/cli.js", "tree-sitter-bash.wasm"]) {
  const asset = path.join(bashLanguageServerDirectory, relative);
  assert(fs.existsSync(asset) && fs.statSync(asset).isFile(), `Bash Language Server asset is missing: ${relative}`);
}

const svg = fs.readFileSync(iconPath, "utf8");
assert(/<svg\b[^>]*viewBox="0 0 1024 1024"/u.test(svg), "Icon must use the reviewed square viewBox");
assert(svg.includes("<title") && svg.includes("<desc"), "Icon needs accessible title and description metadata");
assert(!/<(?:script|foreignObject|image)\b/iu.test(svg), "Icon contains active or externally loaded content");
assert(!/(?:href|src)\s*=\s*["'](?:https?:|data:|file:)/iu.test(svg), "Icon references an external resource");
assert(!/<text\b/iu.test(svg), "Icon must not depend on host fonts");

process.stdout.write(
  "Packaging icon, Linux desktop identity, and bundled Bash Language Server assets verified.\n"
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
