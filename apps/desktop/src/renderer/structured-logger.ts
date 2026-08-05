// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export type RendererLogLevel = "debug" | "info" | "warn" | "error";
export type RendererLogContext = Readonly<Record<string, string | number | boolean | null | undefined>>;

const prefix = "[command-ide-renderer] ";
const sensitiveKey = /credential|password|token|secret|authorization|input|source|script|commandText|content|data|path|directory/iu;
const rendererSessionId = globalThis.crypto.randomUUID();

export const rendererLog = Object.freeze({
  debug: (event: string, context?: RendererLogContext, correlationId?: string) =>
    write("debug", event, context, correlationId),
  info: (event: string, context?: RendererLogContext, correlationId?: string) =>
    write("info", event, context, correlationId),
  warn: (event: string, context?: RendererLogContext, correlationId?: string) =>
    write("warn", event, context, correlationId),
  error: (event: string, context?: RendererLogContext, correlationId?: string) =>
    write("error", event, context, correlationId)
});

export function rendererErrorContext(error: unknown): RendererLogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessageCharacters: error.message.length
    };
  }
  return { errorName: typeof error };
}

function write(
  level: RendererLogLevel,
  event: string,
  context?: RendererLogContext,
  correlationId?: string
): void {
  const record = {
    level,
    event: event.replace(/[^a-zA-Z0-9._-]/gu, "_").slice(0, 96),
    correlationId: correlationId?.slice(0, 128) ?? rendererSessionId,
    context: context === undefined ? undefined : sanitizeContext(context)
  };
  const message = prefix + JSON.stringify(record);
  if (level === "error") {
    console.error(message);
  } else if (level === "warn") {
    console.warn(message);
  } else if (level === "debug") {
    console.debug(message);
  } else {
    console.info(message);
  }
}

function sanitizeContext(context: RendererLogContext): RendererLogContext {
  return Object.fromEntries(Object.entries(context).slice(0, 24).map(([key, value]) => {
    if (typeof value === "string" && sensitiveKey.test(key)) {
      return [key, `<redacted:${value.length} chars>`];
    }
    return [key, typeof value === "string" ? value.slice(0, 128) : value];
  }));
}
