// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import {
  type ChildProcessWithoutNullStreams,
  spawn
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  CANCEL_REQUEST_METHOD,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
  type JsonRpcId,
  type JsonRpcNotification,
  type JsonRpcResponse
} from "@cmd-ide/contracts";
import { encodeFrame, FrameDecoder } from "./framing";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
  signal?: AbortSignal;
  abortListener?: () => void;
}

export interface WorkerClientOptions {
  javaExecutable: string;
  workerJar: string;
  requestTimeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
}

export interface WorkerRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class WorkerClient extends EventEmitter {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly requestTimeoutMs: number;
  private closed = false;

  constructor(options: WorkerClientOptions) {
    super();
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.child = spawn(options.javaExecutable, ["-jar", options.workerJar], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        ...options.environment,
        CMD_IDE_PROTOCOL_VERSION: "1.0"
      }
    });

    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.emit("workerLog", chunk.toString("utf8"));
    });
    this.child.on("error", (error) => this.closeWithError(error));
    this.child.on("exit", (code, signal) => {
      this.closeWithError(
        new Error(`Java worker exited (code=${String(code)}, signal=${String(signal)})`)
      );
    });
  }

  async request<T>(
    method: string,
    params: unknown,
    options: WorkerRequestOptions = {}
  ): Promise<T> {
    if (this.closed) {
      throw new Error("Java worker is not available");
    }
    if (options.signal?.aborted === true) {
      throw abortError();
    }

    const id = randomUUID();
    const request = { jsonrpc: "2.0", id, method, params } as const;

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.takePending(id);
        pending?.reject(new Error(`Java worker request timed out: ${method}`));
      }, options.timeoutMs ?? this.requestTimeoutMs);

      const pending: PendingRequest = {
        resolve: (value) => resolve(value as T),
        reject,
        timeout
      };
      if (options.signal !== undefined) {
        const abortListener = () => {
          const aborted = this.takePending(id);
          if (aborted === undefined) {
            return;
          }
          this.sendNotification(CANCEL_REQUEST_METHOD, { requestId: id });
          aborted.reject(abortError());
        };
        pending.signal = options.signal;
        pending.abortListener = abortListener;
        options.signal.addEventListener("abort", abortListener, { once: true });
      }
      this.pending.set(id, pending);

      this.child.stdin.write(encodeFrame(request), (error) => {
        if (error) {
          const pending = this.takePending(id);
          if (pending !== undefined) {
            pending.reject(error);
          }
        }
      });
    });
  }

  shutdown(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.child.stdin.end();
    if (!this.child.killed) {
      this.child.kill();
    }
    this.rejectAll(new Error("Java worker was shut down"));
  }

  private onStdout(chunk: Buffer): void {
    try {
      for (const value of this.decoder.push(chunk)) {
        if (typeof value === "object" && value !== null && "id" in value) {
          const response = JsonRpcResponseSchema.parse(value);
          this.handleResponse(response);
        } else {
          const notification: JsonRpcNotification = JsonRpcNotificationSchema.parse(value);
          this.emit("notification", notification);
        }
      }
    } catch (error) {
      this.closeWithError(
        error instanceof Error ? error : new Error("Invalid Java worker response")
      );
      this.child.kill();
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    if (response.id === null) {
      this.emit(
        "protocolError",
        "error" in response ? response.error : new Error("Response id cannot be null")
      );
      return;
    }

    const pending = this.takePending(response.id);
    if (pending === undefined) {
      this.emit("protocolError", new Error(`Unexpected response id: ${String(response.id)}`));
      return;
    }

    if ("error" in response) {
      pending.reject(new Error(`Worker error ${response.error.code}: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private closeWithError(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.rejectAll(error);
    this.emit("workerError", error);
  }

  private rejectAll(error: Error): void {
    for (const id of [...this.pending.keys()]) {
      const pending = this.takePending(id);
      if (pending === undefined) {
        continue;
      }
      pending.reject(error);
    }
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.closed) {
      this.child.stdin.write(encodeFrame({ jsonrpc: "2.0", method, params }));
    }
  }

  private takePending(id: JsonRpcId): PendingRequest | undefined {
    const pending = this.pending.get(id);
    if (pending === undefined) {
      return undefined;
    }
    this.pending.delete(id);
    clearTimeout(pending.timeout);
    if (pending.signal !== undefined && pending.abortListener !== undefined) {
      pending.signal.removeEventListener("abort", pending.abortListener);
    }
    return pending;
  }
}

function abortError(): Error {
  const error = new Error("Java worker request was cancelled");
  error.name = "AbortError";
  return error;
}
