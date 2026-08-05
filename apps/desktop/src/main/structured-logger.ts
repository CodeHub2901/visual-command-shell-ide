// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: unknown;
}

interface LogRecord {
  timestamp: string;
  level: LogLevel;
  component: string;
  event: string;
  correlationId?: string;
  context?: unknown;
}

const levelWeights: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
const rendererPrefix = "[command-ide-renderer] ";
const workerPrefix = "[command-ide-worker] ";
const sensitiveKey = /credential|password|token|secret|authorization|reviewedScript|typedConfirmation|input|source|script|commandText|content|payload|data/iu;
const pathKey = /path|directory|fileName|filePath/iu;
const safeStringKey = /^(method|provider|status|riskLevel|level|format|interfaceMode|workspace|commandView|layoutBand|commandId|projectId|bookmarkId|sessionId|requestId|protocolVersion|workerVersion|javaVersion|version|platform|architecture|ozonePlatformHint|signal|errorName|errorCode)$/u;

export interface StructuredLoggerOptions {
  component: string;
  directory: string;
  level?: LogLevel;
  mirrorToStderr?: boolean;
  maxBytes?: number;
}

export class StructuredLogger {
  readonly filePath: string;
  readonly level: LogLevel;
  private readonly component: string;
  private readonly mirrorToStderr: boolean;
  private pendingLines: string[] = [];
  private flushHandle: NodeJS.Immediate | null = null;

  constructor(options: StructuredLoggerOptions) {
    this.component = options.component;
    this.level = options.level ?? "info";
    this.mirrorToStderr = options.mirrorToStderr ?? false;
    fs.mkdirSync(options.directory, { recursive: true });
    this.filePath = path.join(options.directory, "command-ide.jsonl");
    rotateIfRequired(this.filePath, options.maxBytes ?? 5 * 1024 * 1024);
  }

  debug(event: string, context?: LogContext, correlationId?: string): void {
    this.write("debug", event, context, correlationId);
  }

  info(event: string, context?: LogContext, correlationId?: string): void {
    this.write("info", event, context, correlationId);
  }

  warn(event: string, context?: LogContext, correlationId?: string): void {
    this.write("warn", event, context, correlationId);
  }

  error(event: string, context?: LogContext, correlationId?: string): void {
    this.write("error", event, context, correlationId);
  }

  ingestRendererMessage(message: string, consoleLevel: string): boolean {
    if (!message.startsWith(rendererPrefix)) return false;
    const parsed = parseExternalRecord(message.slice(rendererPrefix.length));
    if (parsed === null) {
      this.warn("renderer.log.invalid", { messageCharacters: message.length });
      return true;
    }
    this.write(
      normalizeLevel(parsed.level ?? consoleLevel),
      typeof parsed.event === "string" ? parsed.event : "renderer.event",
      isRecord(parsed.context) ? parsed.context : undefined,
      typeof parsed.correlationId === "string" ? parsed.correlationId : undefined,
      "renderer"
    );
    return true;
  }

  ingestWorkerLine(line: string): void {
    if (!line.startsWith(workerPrefix)) {
      this.warn("worker.stderr", { message: scrubText(line), messageCharacters: line.length });
      return;
    }
    const parsed = parseExternalRecord(line.slice(workerPrefix.length));
    if (parsed === null) {
      this.warn("worker.log.invalid", { messageCharacters: line.length });
      return;
    }
    this.write(
      normalizeLevel(parsed.level),
      typeof parsed.event === "string" ? parsed.event : "worker.event",
      isRecord(parsed.context) ? parsed.context : undefined,
      typeof parsed.correlationId === "string" ? parsed.correlationId : undefined,
      "java-worker",
      typeof parsed.timestamp === "string" ? parsed.timestamp : undefined
    );
  }

  flush(): void {
    if (this.flushHandle !== null) {
      clearImmediate(this.flushHandle);
      this.flushHandle = null;
    }
    if (this.pendingLines.length === 0) return;
    const output = this.pendingLines.join("");
    this.pendingLines = [];
    try {
      fs.appendFileSync(this.filePath, output, "utf8");
    } catch (error: unknown) {
      process.stderr.write(`[command-ide-logger-error] ${errorName(error)}\n`);
    }
  }

  private write(
    level: LogLevel,
    event: string,
    context?: LogContext,
    correlationId?: string,
    component = this.component,
    timestamp?: string
  ): void {
    if (levelWeights[level] < levelWeights[this.level]) return;
    const record: LogRecord = {
      timestamp: validTimestamp(timestamp) ? timestamp : new Date().toISOString(),
      level,
      component,
      event: boundedEvent(event)
    };
    if (correlationId !== undefined) record.correlationId = boundedIdentifier(correlationId);
    if (context !== undefined) record.context = sanitizeLogValue(context);
    const line = JSON.stringify(record) + "\n";
    this.pendingLines.push(line);
    if (this.flushHandle === null) {
      this.flushHandle = setImmediate(() => this.flush());
    }
    if (this.mirrorToStderr) process.stderr.write(line);
  }
}

export function summarizeForLog(value: unknown): unknown {
  return sanitizeLogValue(value);
}

export function logErrorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: scrubText(error.message),
      errorCode: "code" in error && typeof error.code === "string" ? error.code : undefined
    };
  }
  return { errorName: typeof error, errorMessage: "Non-Error rejection" };
}

function sanitizeLogValue(value: unknown, key = "", depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (key === "errorMessage") return scrubText(value);
    if (sensitiveKey.test(key)) return `<redacted:${value.length} chars>`;
    if (pathKey.test(key)) return "<redacted-path>";
    if (safeStringKey.test(key)) return boundedIdentifier(value);
    return `<string:${value.length} chars>`;
  }
  if (typeof value === "undefined") return undefined;
  if (depth >= 3) return "<max-depth>";
  if (Array.isArray(value)) {
    return { itemCount: value.length };
  }
  if (value instanceof Error) return logErrorContext(value);
  if (!isRecord(value)) return `<${typeof value}>`;
  const sanitized: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value).slice(0, 30)) {
    const next = sanitizeLogValue(entryValue, entryKey, depth + 1);
    if (next !== undefined) sanitized[entryKey] = next;
  }
  return sanitized;
}

function rotateIfRequired(filePath: string, maxBytes: number): void {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < maxBytes) return;
    const previousPath = path.join(path.dirname(filePath), "command-ide.previous.jsonl");
    if (fs.existsSync(previousPath)) fs.rmSync(previousPath);
    fs.renameSync(filePath, previousPath);
  } catch (error: unknown) {
    process.stderr.write(`[command-ide-logger-error] rotation ${errorName(error)}\n`);
  }
}

function parseExternalRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeLevel(value: unknown): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value;
  if (value === "warning") return "warn";
  return "info";
}

function validTimestamp(value: string | undefined): value is string {
  return value !== undefined && Number.isFinite(Date.parse(value));
}

function boundedEvent(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 96) || "unknown";
}

function boundedIdentifier(value: string): string {
  return scrubText(value).slice(0, 128);
}

function scrubText(value: string): string {
  const home = os.homedir().replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value
    .replace(new RegExp(home, "giu"), "<home>")
    .replace(/(?:[A-Za-z]:\\|\/)(?:[^\s"']+[\\/])+[^\s"']*/gu, "<redacted-path>")
    .replace(/[\r\n\t]+/gu, " ")
    .slice(0, 300);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
