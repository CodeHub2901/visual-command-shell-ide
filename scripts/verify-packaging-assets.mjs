import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopDirectory = path.join(repositoryRoot, "apps", "desktop");
const manifest = JSON.parse(fs.readFileSync(path.join(desktopDirectory, "package.json"), "utf8"));
const expectedIcon = "assets/packaging/icon.svg";
const iconPath = path.join(desktopDirectory, expectedIcon);
const expectedBashLanguageServerVersion = "5.6.0";
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
  manifest.author?.name === "Command IDE contributors"
    && manifest.author?.email === "CodeHub2901@users.noreply.github.com",
  "Package author metadata is incomplete"
);
assert(manifest.desktopName === "dev.commandide.desktop", "Linux desktopName is not stable");
assert(manifest.build?.linux?.syncDesktopName === true, "Linux desktop filename is not synchronized");
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
  manifest.build?.linux?.maintainer === "Command IDE contributors <CodeHub2901@users.noreply.github.com>",
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
