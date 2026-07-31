// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

export interface WorkerConnection {
  request<T>(method: string, params: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  shutdown(): void;
  on(event: "workerError", listener: (error: Error) => void): this;
}

export type WorkerConnectionFactory = () => WorkerConnection;

export class WorkerSupervisor {
  private client: WorkerConnection | null = null;
  private stopped = false;

  constructor(private readonly factory: WorkerConnectionFactory) {}

  async request<T>(
    method: string,
    params: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<T> {
    if (this.stopped) {
      throw new Error("Java worker supervisor is shut down");
    }
    return await this.getOrStart().request<T>(method, params, options);
  }

  shutdown(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.client?.shutdown();
    this.client = null;
  }

  private getOrStart(): WorkerConnection {
    if (this.client !== null) {
      return this.client;
    }

    const candidate = this.factory();
    candidate.on("workerError", () => {
      if (this.client === candidate) {
        candidate.shutdown();
        this.client = null;
      }
    });
    this.client = candidate;
    return candidate;
  }
}
