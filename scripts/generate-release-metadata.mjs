import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(repositoryRoot, "build", "release-metadata");
const javaSbomPath = path.join(outputDirectory, "command-ide-java.cdx.json");
const nodeSbomPath = path.join(outputDirectory, "command-ide-node.cdx.json");
const combinedSbomPath = path.join(outputDirectory, "command-ide.cdx.json");
const noticesPath = path.join(outputDirectory, "THIRD-PARTY-NOTICES.txt");
const licenseOverrides = new Map([
  ["pkg:npm/bash-language-server@5.6.0", {
    relativePath: "third_party/licenses/bash-language-server-5.6.0.txt",
    sha256: "291d324119550df1624f0af60388393fe36b02bc5e61d9a236afab1801b33042"
  }],
  ["pkg:npm/tr46@0.0.3", {
    relativePath: "third_party/licenses/tr46-0.0.3.txt",
    sha256: "499d6d466d064e0460427967a344e2a32fcb86ea8c6cd1a285ec4f1fa03fba67"
  }]
]);

fs.mkdirSync(outputDirectory, { recursive: true });
if (!fs.existsSync(javaSbomPath)) {
  throw new Error(`Maven SBOM is missing: ${javaSbomPath}`);
}

const workspaceList = runPnpm(["--recursive", "list", "--prod", "--depth", "Infinity", "--json"]);
const licenseGroups = new Map();
const components = new Map();
const dependencyGraph = new Map();
const workspaceRefs = [];
const workspaces = workspaceList.filter((workspace) => workspace.name !== "visual-command-shell-ide");
const workspaceVersions = new Map(workspaces.map((workspace) => [workspace.name, workspace.version]));
const electronRuntime = inspectElectronRuntime();

for (const workspace of workspaces) {
  const workspaceRef = npmPurl(workspace.name, workspace.version);
  workspaceRefs.push(workspaceRef);
  components.set(workspaceRef, {
    type: workspace.name === "@cmd-ide/desktop" ? "application" : "library",
    "bom-ref": workspaceRef,
    name: workspace.name,
    version: workspace.version,
    purl: workspaceRef,
    licenses: [{ license: { id: "Apache-2.0" } }]
  });
}

for (const workspace of workspaces) {
  const workspaceRef = npmPurl(workspace.name, workspace.version);
  traverseDependencies(workspaceRef, workspace.dependencies ?? {});
}
addElectronRuntimeComponents();

const nodeSbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": "pkg:npm/command-ide@0.1.0",
      name: "Command IDE Node workspace",
      version: "0.1.0",
      licenses: [{ license: { id: "Apache-2.0" } }]
    }
  },
  components: [...components.values()].sort(compareBomRef),
  dependencies: mergeDependencies([
    {
      ref: "pkg:npm/command-ide@0.1.0",
      dependsOn: [...new Set(workspaceRefs)].sort()
    },
    ...serializeDependencies(dependencyGraph)
  ])
};

const javaSbom = JSON.parse(fs.readFileSync(javaSbomPath, "utf8"));
normalizeGeneratedBom(javaSbom);
fs.writeFileSync(javaSbomPath, stableJson(javaSbom), "utf8");
fs.writeFileSync(nodeSbomPath, stableJson(nodeSbom), "utf8");

const javaRoot = javaSbom.metadata?.component;
if (javaRoot === undefined || typeof javaRoot["bom-ref"] !== "string") {
  throw new Error("Maven SBOM has no metadata component reference");
}
const combinedComponents = deduplicateComponents([
  javaRoot,
  ...(javaSbom.components ?? []),
  nodeSbom.metadata.component,
  ...nodeSbom.components
]);
const combinedDependencies = mergeDependencies([
  ...(javaSbom.dependencies ?? []),
  ...nodeSbom.dependencies,
  {
    ref: "pkg:generic/command-ide@0.1.0",
    dependsOn: [javaRoot["bom-ref"], nodeSbom.metadata.component["bom-ref"]]
  }
]);
const combinedSbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": "pkg:generic/command-ide@0.1.0",
      name: "Command IDE",
      version: "0.1.0",
      licenses: [{ license: { id: "Apache-2.0" } }]
    }
  },
  components: combinedComponents,
  dependencies: combinedDependencies
};
fs.writeFileSync(combinedSbomPath, stableJson(combinedSbom), "utf8");
fs.writeFileSync(noticesPath, renderNotices(), "utf8");
fs.copyFileSync(path.join(repositoryRoot, "LICENSE"), path.join(outputDirectory, "LICENSE.txt"));
fs.copyFileSync(path.join(repositoryRoot, "NOTICE"), path.join(outputDirectory, "NOTICE.txt"));
fs.copyFileSync(electronRuntime.licensePath, path.join(outputDirectory, "ELECTRON-LICENSE.txt"));
fs.copyFileSync(
  electronRuntime.chromiumLicensesPath,
  path.join(outputDirectory, "CHROMIUM-THIRD-PARTY-LICENSES.html")
);

const runtimeJava = path.join(
  repositoryRoot,
  "apps",
  "worker",
  "target",
  "runtime",
  "bin",
  process.platform === "win32" ? "java.exe" : "java"
);
if (fs.existsSync(runtimeJava)) {
  const modules = spawnSync(runtimeJava, ["--list-modules"], { encoding: "utf8" });
  if (modules.status !== 0) throw new Error(modules.stderr || "Could not list bundled runtime modules");
  fs.writeFileSync(
    path.join(outputDirectory, "RUNTIME-MODULES.txt"),
    modules.stdout.trim().split(/\r?\n/u).sort().join("\n") + "\n",
    "utf8"
  );
}

process.stdout.write(
  `Generated combined CycloneDX SBOM with ${combinedComponents.length} components `
  + `and ${licenseGroups.size} distinct Node license texts.\n`
);

function traverseDependencies(parentRef, dependencies) {
  const childRefs = [];
  for (const dependency of Object.values(dependencies)) {
    if (typeof dependency?.from !== "string" || typeof dependency?.version !== "string") continue;
    const workspaceVersion = workspaceVersions.get(dependency.from);
    const resolvedVersion = workspaceVersion ?? dependency.version;
    const ref = npmPurl(dependency.from, resolvedVersion);
    childRefs.push(ref);
    if (!components.has(ref)) components.set(ref, componentFromDependency(dependency, ref));
    if (workspaceVersion === undefined) addLicenseText(dependency, ref);
    traverseDependencies(ref, dependency.dependencies ?? {});
  }
  const existing = dependencyGraph.get(parentRef) ?? new Set();
  childRefs.forEach((ref) => existing.add(ref));
  dependencyGraph.set(parentRef, existing);
}

function componentFromDependency(dependency, ref) {
  const manifest = readManifest(dependency.path);
  const component = {
    type: "library",
    "bom-ref": ref,
    name: dependency.from,
    version: dependency.version,
    purl: ref
  };
  const license = normalizeLicense(manifest?.license);
  if (license !== null) {
    component.licenses = [simpleSpdx(license)
      ? { license: { id: license } }
      : { expression: license }];
  }
  const homepage = typeof manifest?.homepage === "string"
    ? manifest.homepage
    : repositoryUrl(manifest?.repository);
  if (homepage !== null) {
    component.externalReferences = [{ type: "website", url: homepage }];
  }
  return component;
}

function addLicenseText(dependency, ref) {
  const text = readLicenseText(dependency.path) ?? readLicenseOverride(ref);
  if (text === null) {
    throw new Error(`Production dependency has no bundled license text: ${ref}`);
  }
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  const group = licenseGroups.get(digest) ?? { text, refs: new Set() };
  group.refs.add(ref);
  licenseGroups.set(digest, group);
}

function readLicenseOverride(ref) {
  const override = licenseOverrides.get(ref);
  if (override === undefined) return null;
  const file = path.resolve(repositoryRoot, override.relativePath);
  const relative = path.relative(repositoryRoot, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`License override escapes the repository: ${ref}`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size > 2_000_000) {
    throw new Error(`License override is missing or invalid: ${ref}`);
  }
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/gu, "\n").trim() + "\n";
  const digest = createHash("sha256").update(text, "utf8").digest("hex");
  if (digest !== override.sha256) {
    throw new Error(`License override checksum mismatch for ${ref}: ${digest}`);
  }
  return text;
}

function readLicenseText(packagePath) {
  if (typeof packagePath !== "string" || !fs.existsSync(packagePath)) return null;
  const candidate = fs.readdirSync(packagePath)
    .filter((name) => /^(license|copying|notice)(\..*)?$/iu.test(name))
    .sort((left, right) => left.localeCompare(right))[0];
  if (candidate === undefined) return null;
  const file = path.join(packagePath, candidate);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 2_000_000) return null;
  return fs.readFileSync(file, "utf8").replace(/\r\n/gu, "\n").trim() + "\n";
}

function readManifest(packagePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function renderNotices() {
  const header = fs.readFileSync(path.join(repositoryRoot, "NOTICE"), "utf8")
    .replace(/\r\n/gu, "\n")
    .trim();
  const nodeSections = [...licenseGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([digest, group]) => [
      "--------------------------------------------------------------------------------",
      `Node license SHA-256: ${digest}`,
      "Components:",
      ...[...group.refs].sort().map((ref) => `- ${ref}`),
      "",
      group.text.trim()
    ].join("\n"));
  const javaLicenseDirectory = path.join(outputDirectory, "java-licenses");
  if (!fs.existsSync(javaLicenseDirectory) || !fs.statSync(javaLicenseDirectory).isDirectory()) {
    throw new Error("Maven dependency license directory is missing");
  }
  const javaSections = listFiles(javaLicenseDirectory)
    .map((file) => {
      const relative = path.relative(javaLicenseDirectory, file).split(path.sep).join("/");
      const text = fs.readFileSync(file, "utf8").replace(/\r\n/gu, "\n").trim();
      return [
        "--------------------------------------------------------------------------------",
        `Java dependency license: ${relative}`,
        "",
        text
      ].join("\n");
    });
  if (javaSections.length === 0) throw new Error("No Java dependency license texts were downloaded");
  return [
    header,
    "",
    "# Electron runtime license inventory",
    "",
    `Electron ${electronRuntime.electronVersion} bundles Chromium ${electronRuntime.chromiumVersion} `
      + `and Node.js ${electronRuntime.nodeVersion}.`,
    "The Electron MIT license is supplied as ELECTRON-LICENSE.txt.",
    "Chromium and its bundled third-party license texts are supplied as",
    "CHROMIUM-THIRD-PARTY-LICENSES.html, copied from the installed Electron distribution.",
    "",
    "# Node production dependency license texts",
    "",
    ...nodeSections,
    "",
    "# Java production dependency license texts",
    "",
    ...javaSections,
    ""
  ].join("\n");
}

function addElectronRuntimeComponents() {
  const desktopRef = npmPurl("@cmd-ide/desktop", workspaceVersions.get("@cmd-ide/desktop"));
  const electronRef = npmPurl("electron", electronRuntime.electronVersion);
  const chromiumRef = `pkg:generic/chromium@${encodeURIComponent(electronRuntime.chromiumVersion)}`;
  const nodeRef = `pkg:generic/node.js@${encodeURIComponent(electronRuntime.nodeVersion)}`;
  components.set(electronRef, {
    type: "framework",
    "bom-ref": electronRef,
    name: "Electron",
    version: electronRuntime.electronVersion,
    purl: electronRef,
    licenses: [{ license: { id: "MIT" } }],
    externalReferences: [{ type: "website", url: "https://www.electronjs.org/" }]
  });
  components.set(chromiumRef, {
    type: "framework",
    "bom-ref": chromiumRef,
    name: "Chromium",
    version: electronRuntime.chromiumVersion,
    purl: chromiumRef,
    licenses: [{ license: { id: "BSD-3-Clause" } }],
    externalReferences: [{ type: "website", url: "https://www.chromium.org/" }]
  });
  components.set(nodeRef, {
    type: "framework",
    "bom-ref": nodeRef,
    name: "Node.js",
    version: electronRuntime.nodeVersion,
    purl: nodeRef,
    licenses: [{ license: { id: "MIT" } }],
    externalReferences: [{ type: "website", url: "https://nodejs.org/" }]
  });
  addGraphEdge(desktopRef, electronRef);
  addGraphEdge(electronRef, chromiumRef);
  addGraphEdge(electronRef, nodeRef);
  if (!dependencyGraph.has(chromiumRef)) dependencyGraph.set(chromiumRef, new Set());
  if (!dependencyGraph.has(nodeRef)) dependencyGraph.set(nodeRef, new Set());
}

function addGraphEdge(parent, child) {
  const targets = dependencyGraph.get(parent) ?? new Set();
  targets.add(child);
  dependencyGraph.set(parent, targets);
}

function inspectElectronRuntime() {
  const electronRoot = path.join(repositoryRoot, "apps", "desktop", "node_modules", "electron");
  const manifest = JSON.parse(fs.readFileSync(path.join(electronRoot, "package.json"), "utf8"));
  const distribution = path.join(electronRoot, "dist");
  const executable = path.join(distribution, process.platform === "win32" ? "electron.exe" : "electron");
  const licensePath = path.join(distribution, "LICENSE");
  const chromiumLicensesPath = path.join(distribution, "LICENSES.chromium.html");
  for (const file of [executable, licensePath, chromiumLicensesPath]) {
    if (!fs.existsSync(file)) throw new Error(`Installed Electron distribution is incomplete: ${file}`);
  }
  const result = spawnSync(executable, ["-p", "JSON.stringify(process.versions)"], {
    cwd: repositoryRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not inspect the installed Electron runtime");
  const versions = JSON.parse(result.stdout.trim());
  if (versions.electron !== manifest.version) {
    throw new Error(`Electron package/runtime mismatch: ${manifest.version} != ${versions.electron}`);
  }
  if (typeof versions.chrome !== "string" || typeof versions.node !== "string") {
    throw new Error("Electron did not report its bundled Chromium and Node.js versions");
  }
  return {
    electronVersion: versions.electron,
    chromiumVersion: versions.chrome,
    nodeVersion: versions.node,
    licensePath,
    chromiumLicensesPath
  };
}

function normalizeGeneratedBom(bom) {
  delete bom.serialNumber;
  if (bom.metadata !== undefined) {
    delete bom.metadata.timestamp;
    delete bom.metadata.tools;
    if (bom.metadata.component?.group === "dev.commandide") {
      bom.metadata.component.licenses = [{ license: { id: "Apache-2.0" } }];
    }
  }
  if (Array.isArray(bom.components)) bom.components.sort(compareBomRef);
  if (Array.isArray(bom.dependencies)) {
    bom.dependencies = mergeDependencies(bom.dependencies);
  }
}

function deduplicateComponents(values) {
  const byReference = new Map();
  for (const component of values) {
    if (typeof component?.["bom-ref"] === "string") {
      byReference.set(component["bom-ref"], component);
    }
  }
  return [...byReference.values()].sort(compareBomRef);
}

function mergeDependencies(values) {
  const graph = new Map();
  for (const entry of values) {
    if (typeof entry?.ref !== "string") continue;
    const targets = graph.get(entry.ref) ?? new Set();
    for (const target of entry.dependsOn ?? []) targets.add(target);
    graph.set(entry.ref, targets);
  }
  return serializeDependencies(graph);
}

function serializeDependencies(graph) {
  return [...graph.entries()]
    .map(([ref, targets]) => ({ ref, dependsOn: [...targets].sort() }))
    .sort((left, right) => left.ref.localeCompare(right.ref));
}

function compareBomRef(left, right) {
  return String(left["bom-ref"]).localeCompare(String(right["bom-ref"]));
}

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (Array.isArray(value)) {
    const values = value.filter((item) => typeof item === "string" && item.trim() !== "");
    return values.length === 0 ? null : values.join(" OR ");
  }
  if (typeof value?.type === "string") return value.type;
  return null;
}

function simpleSpdx(value) {
  return /^[A-Za-z0-9-.+]+$/u.test(value);
}

function repositoryUrl(value) {
  if (typeof value === "string" && /^https?:\/\//u.test(value)) return value;
  if (typeof value?.url !== "string") return null;
  return value.url.replace(/^git\+/u, "").replace(/\.git$/u, "");
}

function npmPurl(name, version) {
  if (name.startsWith("@")) {
    const [scope, packageName] = name.split("/");
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function runPnpm(argumentsList) {
  const pnpmScript = process.env.npm_execpath;
  if (pnpmScript === undefined || !fs.existsSync(pnpmScript)) {
    throw new Error("Run release metadata generation through pnpm so npm_execpath is available");
  }
  const result = spawnSync(process.execPath, [pnpmScript, ...argumentsList], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(result.stderr || "pnpm dependency inventory failed");
  return JSON.parse(result.stdout);
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : entry.isFile() ? [target] : [];
    });
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
