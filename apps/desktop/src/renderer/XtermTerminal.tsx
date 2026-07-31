// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ExecutionEvent } from "@cmd-ide/contracts";
import { TerminalOutputSanitizer } from "./terminal-output";
import { useI18n, type Translator } from "./i18n";
import "@xterm/xterm/css/xterm.css";

export function XtermTerminal({
  sessionId,
  onExit,
  onDimensions,
  onError
}: {
  sessionId: string | null;
  onExit: (exitStatus: number) => void;
  onDimensions: (columns: number, rows: number) => void;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const activeSessionRef = useRef<string | null>(sessionId);
  const exitRef = useRef(onExit);
  const dimensionsRef = useRef(onDimensions);
  const errorRef = useRef(onError);
  const pendingEventsRef = useRef(new Map<string, ExecutionEvent[]>());
  const outputSanitizerRef = useRef(new TerminalOutputSanitizer(t("terminal.blockedControl")));

  useEffect(() => { exitRef.current = onExit; }, [onExit]);
  useEffect(() => { dimensionsRef.current = onDimensions; }, [onDimensions]);
  useEffect(() => { errorRef.current = onError; }, [onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const terminal = new Terminal({
      convertEol: false,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      fontSize: 12,
      screenReaderMode: true,
      scrollback: 5000,
      theme: {
        background: "#090e15",
        foreground: "#d5dfec",
        cursor: "#8fb9f0",
        selectionBackground: "#304b70"
      }
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    terminalRef.current = terminal;
    terminal.writeln(`\x1b[90m${t("terminal.initialHint")}\x1b[0m`);

    const dataSubscription = terminal.onData((data) => {
      const activeSession = activeSessionRef.current;
      if (activeSession === null) return;
      void window.commandIde.execution.input(activeSession, data).catch((error: unknown) => {
        errorRef.current(error instanceof Error ? error.message : t("terminal.inputFailed"));
      });
    });
    const unsubscribe = window.commandIde.execution.onEvent((event) => {
      if (event.sessionId === activeSessionRef.current) {
        renderEvent(terminal, event, outputSanitizerRef.current, exitRef, errorRef, t);
        return;
      }
      const queued = pendingEventsRef.current.get(event.sessionId) ?? [];
      if (queued.length < 256) queued.push(event);
      pendingEventsRef.current.set(event.sessionId, queued);
    });

    let resizeFrame: number | null = null;
    const resize = () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        try {
          fit.fit();
          dimensionsRef.current(terminal.cols, terminal.rows);
          const activeSession = activeSessionRef.current;
          if (activeSession !== null) {
            void window.commandIde.execution.resize(activeSession, terminal.cols, terminal.rows)
              .catch((error: unknown) => {
                errorRef.current(error instanceof Error ? error.message : t("terminal.resizeFailed"));
              });
          }
        } catch {
          // The element can be temporarily hidden while the workspace resizes.
        }
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
      unsubscribe();
      dataSubscription.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, [t]);

  useEffect(() => {
    activeSessionRef.current = sessionId;
    const terminal = terminalRef.current;
    if (terminal === null || sessionId === null) return;
    outputSanitizerRef.current.reset();
    terminal.reset();
    terminal.writeln(`\x1b[90m${t("terminal.sessionStarted", {
      session: sessionId.slice(0, 8)
    })}\x1b[0m`);
    const queued = pendingEventsRef.current.get(sessionId) ?? [];
    queued.sort((left, right) => left.sequence - right.sequence)
      .forEach((event) => renderEvent(
        terminal,
        event,
        outputSanitizerRef.current,
        exitRef,
        errorRef,
        t
      ));
    pendingEventsRef.current.delete(sessionId);
    terminal.focus();
  }, [sessionId, t]);

  return <div className="xterm-terminal" ref={containerRef} aria-label={t("terminal.interactiveLabel")} />;
}

function renderEvent(
  terminal: Terminal,
  event: ExecutionEvent,
  outputSanitizer: TerminalOutputSanitizer,
  exitRef: MutableRefObject<(exitStatus: number) => void>,
  errorRef: MutableRefObject<(message: string) => void>,
  t: Translator["t"]
) {
  if (event.type === "output" && event.data !== null) {
    terminal.write(outputSanitizer.push(event.data));
  } else if (event.type === "error" && event.message !== null) {
    terminal.writeln(`\r\n\x1b[31m${event.message}\x1b[0m`);
    errorRef.current(event.message);
  } else if (event.type === "exit" && event.exitStatus !== null) {
    terminal.writeln(`\r\n\x1b[90m${t("terminal.processExited", {
      status: event.exitStatus
    })}\x1b[0m`);
    exitRef.current(event.exitStatus);
  }
}
