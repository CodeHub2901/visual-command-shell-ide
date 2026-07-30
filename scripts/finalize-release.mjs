import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArguments(process.argv.slice(2));
const releaseDirectory = path.resolve(repositoryRoot, options.releaseDirectory);
const metadataSource = path.resolve(repositoryRoot, options.metadataDirectory);
const metadataDestination = path.join(releaseDirectory, "metadata");

assert(fs.existsSync(metadataSource), `Release metadata source is missing: ${metadataSource}`);
fs.mkdirSync(releaseDirectory, { recursive: true });
assert(isChildPath(releaseDirectory, metadataDestination), "Refusing to stage metadata outside the release directory");
if (fs.existsSync(metadataDestination)) fs.rmSync(metadataDestination, { recursive: true, force: true });
fs.cpSync(metadataSource, metadataDestination, { recursive: true, errorOnExist: true });

const packages = listFiles(releaseDirectory, false)
  .filter((file) => isLinuxPackage(path.basename(file)))
  .sort(comparePath);
if (options.requireLinuxPackages) verifyPackageSet(packages);

const metadataFiles = listFiles(metadataDestination, true).sort(comparePath);
assert(metadataFiles.length > 0, "No staged release metadata was found");
const checksumTargets = [...packages, ...metadataFiles].sort(comparePath);
const checksumLines = checksumTargets.map((file) => {
  const relative = relativePath(releaseDirectory, file);
  return `${sha256(file)}  ${relative}`;
});
fs.writeFileSync(path.join(releaseDirectory, "SHA256SUMS.txt"), checksumLines.join("\n") + "\n", "utf8");

process.stdout.write(
  `Staged ${metadataFiles.length} metadata files and checksummed ${packages.length} Linux package(s).\n`
);

function parseArguments(argumentsList) {
  const result = {
    releaseDirectory: "release",
    metadataDirectory: path.join("build", "release-metadata"),
    requireLinuxPackages: false
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--require-linux-packages") {
      result.requireLinuxPackages = true;
    } else if (argument === "--release-dir" || argument === "--metadata-dir") {
      const value = argumentsList[index + 1];
      assert(typeof value === "string" && value !== "", `Missing value for ${argument}`);
      result[argument === "--release-dir" ? "releaseDirectory" : "metadataDirectory"] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return result;
}

function listFiles(directory, recursive) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Release staging does not accept symbolic links: ${target}`);
    if (entry.isFile()) return [target];
    if (entry.isDirectory() && recursive) return listFiles(target, true);
    return [];
  });
}

function verifyPackageSet(packages) {
  const extensions = new Set(packages.map(packageExtension));
  for (const extension of [".AppImage", ".deb", ".rpm"]) {
    assert(extensions.has(extension), `Linux release is missing a ${extension} package`);
  }
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

function comparePath(left, right) {
  return relativePath(releaseDirectory, left).localeCompare(relativePath(releaseDirectory, right));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
