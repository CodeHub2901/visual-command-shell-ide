// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import { rendererErrorContext, rendererLog } from "./structured-logger";

afterEach(() => vi.restoreAllMocks());

describe("rendererLog", () => {
  it("uses the native console path with structured redacted context", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    rendererLog.info("execution.requested", {
      sessionId: "session-1",
      script: "private command",
      rows: 24
    }, "request-1");

    expect(info).toHaveBeenCalledOnce();
    const message = String(info.mock.calls[0]?.[0]);
    expect(message).toContain("[command-ide-renderer]");
    expect(message).toContain('"event":"execution.requested"');
    expect(message).toContain('"correlationId":"request-1"');
    expect(message).toContain("<redacted:15 chars>");
    expect(message).not.toContain("private command");
  });

  it("reports error type and message length without exposing the message", () => {
    expect(rendererErrorContext(new Error("private path and command"))).toEqual({
      errorName: "Error",
      errorMessageCharacters: 24
    });
  });
});
