import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workerJar = path.join(repositoryRoot, "apps", "worker", "target", "worker-0.1.0-all.jar");
const javaExecutable = process.env.CMD_IDE_JAVA ?? "java";
const child = spawn(javaExecutable, ["-jar", workerJar], {
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    CMD_IDE_DATA_DIR: path.join(repositoryRoot, "work", "integration-worker-data")
  }
});

const stderr = [];
child.stderr.on("data", (chunk) => stderr.push(chunk));

let buffer = Buffer.alloc(0);
const pending = new Map();
const notifications = [];
child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /^Content-Length:\s*(\d+)$/im.exec(header);
    if (match === null) throw new Error("Worker response has no Content-Length");
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.byteLength < start + length) return;
    const response = JSON.parse(buffer.subarray(start, start + length).toString("utf8"));
    buffer = buffer.subarray(start + length);
    if (response.method === "v1.execution.event") {
      notifications.push(response.params);
      continue;
    }
    const request = pending.get(response.id);
    if (request !== undefined) {
      pending.delete(response.id);
      clearTimeout(request.timeout);
      request.resolve(response);
    }
  }
});

child.on("exit", (code) => {
  if (code !== null && code !== 0) {
    const error = new Error(`Worker exited with ${code}: ${Buffer.concat(stderr).toString("utf8")}`);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
});

function request(id, method, params) {
  const message = { jsonrpc: "2.0", id, method, params };
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}`));
    }, 10_000);
    pending.set(id, { resolve, reject, timeout });
    child.stdin.write(Buffer.concat([
      Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "ascii"),
      payload
    ]));
  });
}

const health = await request("integration-health-1", "v1.health.check", {});
assert.equal(health.result.protocolVersion, "1.0");
assert.equal(health.result.workerVersion, "0.1.0");
assert.ok(Number.isInteger(health.result.pid) && health.result.pid > 0);

const tooling = await request("integration-tooling-detect", "v1.tooling.detect", {});
assert.deepEqual(
  tooling.result.tools.map((tool) => tool.id).sort(),
  ["bash-language-server", "shellcheck", "shfmt"]
);
assert.ok(tooling.result.tools.every((tool) =>
  tool.status === "installed" ? path.isAbsolute(tool.executablePath) : tool.executablePath === null
));
const shellCheck = await request("integration-shellcheck", "v1.tooling.shellcheck", {
  source: "echo \"$VALUE\"\n"
});
const detectedShellCheck = tooling.result.tools.find((tool) => tool.id === "shellcheck");
assert.equal(
  shellCheck.result.status,
  detectedShellCheck.status === "installed" ? "completed" : "unavailable"
);
assert.ok(Array.isArray(shellCheck.result.diagnostics));
const shfmt = await request("integration-shfmt", "v1.tooling.shfmt", {
  source: "if true;then echo ok;fi\n"
});
const detectedShfmt = tooling.result.tools.find((tool) => tool.id === "shfmt");
assert.equal(shfmt.result.status, detectedShfmt.status === "installed" ? "formatted" : "unavailable");
if (shfmt.result.status === "formatted") {
  assert.equal(typeof shfmt.result.source, "string");
  assert.equal(shfmt.result.changed, true);
}
const aiModels = await request("integration-ai-models", "v1.ai.models", {
  provider: "ollama",
  endpoint: "http://127.0.0.1:11434",
  remoteEndpointConfirmed: false
});
assert.ok(["available", "unavailable", "failed"].includes(aiModels.result.status));
assert.ok(Array.isArray(aiModels.result.models));
if (aiModels.result.status === "available") {
  assert.ok(aiModels.result.models.every((model) =>
    typeof model.id === "string"
      && typeof model.displayName === "string"
      && !Object.hasOwn(model, "download")
  ));
} else {
  assert.equal(aiModels.result.models.length, 0);
  assert.equal(typeof aiModels.result.reason, "string");
}
const openAiModels = await request("integration-openai-models", "v1.ai.models", {
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  remoteEndpointConfirmed: true
});
assert.equal(openAiModels.result.status, "available");
assert.ok(openAiModels.result.models.some((model) => model.id === "gpt-5.6"));
assert.ok(openAiModels.result.models.every((model) => !Object.hasOwn(model, "download")));
const credentialStatus = await request(
  "integration-openai-credential-status",
  "v1.credentials.status",
  { provider: "openai" }
);
assert.equal(credentialStatus.result.provider, "openai");
assert.equal(typeof credentialStatus.result.configured, "boolean");
assert.ok(["secure", "session", "unavailable"].includes(credentialStatus.result.storage));
assert.ok(!Object.hasOwn(credentialStatus.result, "credential"));
const language = await request("integration-language-open", "v1.language.open", {
  source: "echo integration"
});
assert.ok(["opened", "unavailable"].includes(language.result.status));
if (language.result.status === "opened") {
  assert.match(language.result.sessionId, /^[a-f0-9-]{36}$/);
  const closedLanguage = await request("integration-language-close", "v1.language.close", {
    sessionId: language.result.sessionId
  });
  assert.equal(closedLanguage.result.accepted, true);
} else {
  assert.equal(language.result.sessionId, null);
  assert.match(language.result.reason, /Catalog assistance remains available offline/);
}

const catalog = await request("integration-catalog-all", "v1.catalog.search", { query: "", limit: 100 });
assert.equal(catalog.result.total, 62);
assert.equal(catalog.result.commands.length, 62);
assert.ok(catalog.result.commands.some((command) => command.id === "git" && command.category === "Development"));
assert.ok(catalog.result.commands.some((command) =>
  command.id === "findmnt"
  && command.category === "Storage"
  && command.platforms.includes("linux")
));
assert.ok(catalog.result.commands.some((command) =>
  command.id === "make" && command.riskTags.includes("system-change")
));
assert.ok(catalog.result.commands.some((command) =>
  command.id === "sudo" && command.riskTags.includes("privilege")
));
const memoryCatalog = await request("integration-catalog-memory", "v1.catalog.search", {
  query: "memory",
  limit: 20
});
assert.ok(memoryCatalog.result.commands.some((command) => command.id === "free"));
const discovery = await request("integration-catalog-discover", "v1.catalog.discover", {
  limit: 5000,
  refresh: false
});
assert.ok(discovery.result.total >= discovery.result.executables.length);
assert.ok(discovery.result.executables.length <= 5000);
assert.ok(discovery.result.executables.every((entry) => typeof entry.path === "string" && entry.path.length > 0));
assert.ok(discovery.result.shadowedCount >= 0);
const lsblkManual = await request("integration-manual-lsblk", "v1.manual.get", { commandId: "lsblk" });
assert.equal(lsblkManual.result.tldr.attribution.license, "CC-BY 4.0");
assert.ok(lsblkManual.result.tldr.attribution.pageUrl.includes("/pages/linux/lsblk.md"));
const findmntManual = await request(
  "integration-manual-findmnt",
  "v1.manual.get",
  { commandId: "findmnt" }
);
assert.equal(findmntManual.result.manual.synopsis, "findmnt [OPTION]... [DEVICE|MOUNTPOINT]");
assert.equal(findmntManual.result.tldr.attribution.license, "CC-BY 4.0");
assert.ok(findmntManual.result.tldr.attribution.pageUrl.includes("/pages/linux/findmnt.md"));

const parsed = await request("integration-parse-1", "v1.shell.parse", { source: "ls -al . | grep src" });
assert.equal(parsed.result.program.statements[0].type, "pipeline");
assert.equal(parsed.result.preservedRaw, false);
const preserved = await request("integration-parse-2", "v1.shell.parse", { source: "value=$(date)" });
assert.equal(preserved.result.program.statements[0].type, "raw-code");
assert.equal(preserved.result.program.statements[0].code, "value=$(date)");
const variables = await request("integration-parse-3", "v1.shell.parse", {
  source: "export ROOT=/tmp\nls \"$ROOT\""
});
assert.equal(variables.result.program.schemaVersion, "1.4.0");
assert.equal(variables.result.program.statements[0].type, "assignment");
assert.equal(variables.result.program.statements[1].arguments[0].valueKind, "variable");

const projectId = "68d4861b-3ba5-47c8-8828-6ba2efc9945d";
const project = {
  schemaVersion: "1.4.0",
  projectId,
  name: "Integration list",
  createdAt: "2026-07-18T12:00:00Z",
  updatedAt: "2026-07-18T12:00:00Z",
  catalogVersion: "1.2.0",
  target: {
    operatingSystem: "linux",
    architecture: "x86_64",
    shellDialect: "bash",
    distroFamily: "ubuntu",
    distroVersion: "24.04"
  },
  program: {
    schemaVersion: "1.4.0",
    dialect: "bash",
    statements: [{
      type: "command",
      nodeId: "node-1",
      commandId: "ls",
      options: [{ optionId: "long", spelling: "-l", value: null, valueKind: null }],
      arguments: [{ argumentId: "files", value: ".", valueKind: "literal" }]
    }]
  },
  layout: {
    nodes: [{ nodeId: "node-1", x: 0, y: 0 }],
    viewport: { x: 0, y: 0, zoom: 1 }
  },
  parameters: []
};

const saved = await request("integration-project-save", "v1.projects.save", { project });
assert.equal(saved.result.project.projectId, projectId);
assert.equal(saved.result.project.name, "Integration list");

const loaded = await request("integration-project-get", "v1.projects.get", { projectId });
assert.deepEqual(loaded.result.project.program, project.program);

const listed = await request("integration-project-list", "v1.projects.list", { limit: 10 });
assert.ok(listed.result.projects.some((entry) => entry.projectId === projectId));

const exportedProject = await request("integration-project-export", "v1.export.create", {
  project: saved.result.project,
  format: "project",
  strictMode: true,
  includeSourceComments: true
});
assert.equal(exportedProject.result.format, "project");
assert.match(exportedProject.result.suggestedFileName, /\.cmdbuilder\.json$/);
const importedProject = await request("integration-project-import", "v1.projects.import", {
  content: exportedProject.result.content
});
assert.deepEqual(importedProject.result.project.program, project.program);

const bookmarkId = "bdc62cba-64d3-4384-955d-8617c7ab8768";
const savedBookmark = await request("integration-bookmark-save", "v1.bookmarks.save", {
  bookmarkId,
  name: "Inspect variable directory",
  program: variables.result.program,
  parameters: [{
    name: "ROOT",
    description: "Directory to inspect",
    required: true,
    sensitive: false,
    defaultValue: "/tmp"
  }]
});
assert.equal(savedBookmark.result.bookmark.bookmarkId, bookmarkId);
assert.equal(savedBookmark.result.bookmark.program.statements[1].arguments[0].valueKind, "variable");
const listedBookmarks = await request("integration-bookmark-list", "v1.bookmarks.list", { limit: 20 });
assert.ok(listedBookmarks.result.bookmarks.some((entry) =>
  entry.bookmarkId === bookmarkId && entry.parameters[0].name === "ROOT"
));
const deletedBookmark = await request("integration-bookmark-delete", "v1.bookmarks.delete", { bookmarkId });
assert.equal(deletedBookmark.result.deleted, true);

const risk = await request("integration-risk-execution", "v1.risk.assess", { program: project.program });
const staleExecution = await request("integration-execution-stale", "v1.execution.start", {
  program: project.program,
  reviewedScript: `${risk.result.script} `,
  reviewHash: risk.result.reviewHash,
  interfaceMode: "guided",
  confirmed: false,
  typedConfirmation: null,
  workingDirectory: repositoryRoot,
  columns: 80,
  rows: 24
});
assert.equal(staleExecution.error.code, -32602);

if (process.platform === "linux") {
  const startedExecution = await request("integration-execution-start", "v1.execution.start", {
    program: project.program,
    reviewedScript: risk.result.script,
    reviewHash: risk.result.reviewHash,
    interfaceMode: "guided",
    confirmed: false,
    typedConfirmation: null,
    workingDirectory: repositoryRoot,
    columns: 80,
    rows: 24
  });
  assert.ok(startedExecution.result.sessionId);
  const terminalEvents = await waitForTerminalExit(startedExecution.result.sessionId);
  assert.ok(terminalEvents.some((event) => event.type === "started"));
  assert.ok(terminalEvents.some((event) => event.type === "output" && event.data.length > 0));
  assert.ok(terminalEvents.some((event) => event.type === "exit" && event.exitStatus === 0));
}

const history = await request("integration-history-list", "v1.history.list", { limit: 20 });
assert.ok(Array.isArray(history.result.entries));
if (process.platform === "linux") {
  assert.ok(history.result.entries.some((entry) =>
    entry.redactedCommandText === risk.result.script && entry.exitStatus === 0
  ));
}

child.stdin.end();
child.kill();
process.stdout.write("Worker health, tooling/language fallback, Ollama/OpenAI model boundaries, credential metadata, Bash parsing, project import/export, structured bookmarks, execution gate, and history integration passed.\n");

async function waitForTerminalExit(sessionId) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const events = notifications.filter((event) => event.sessionId === sessionId);
    if (events.some((event) => event.type === "exit")) return events;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for PTY session ${sessionId}`);
}
