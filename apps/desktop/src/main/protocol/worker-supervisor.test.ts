import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  WorkerSupervisor,
  type WorkerConnection
} from "./worker-supervisor";

class FakeConnection extends EventEmitter implements WorkerConnection {
  readonly shutdown = vi.fn();
  readonly request = vi.fn(async <T>(_method: string, _params: unknown): Promise<T> => {
    return { generation: this.generation } as T;
  });

  constructor(readonly generation: number) {
    super();
  }
}

describe("WorkerSupervisor", () => {
  it("recreates the worker for the next request after a crash", async () => {
    const connections: FakeConnection[] = [];
    const supervisor = new WorkerSupervisor(() => {
      const connection = new FakeConnection(connections.length + 1);
      connections.push(connection);
      return connection;
    });

    await expect(supervisor.request("v1.health.check", {})).resolves.toEqual({ generation: 1 });
    connections[0]?.emit("workerError", new Error("crashed"));
    await expect(supervisor.request("v1.health.check", {})).resolves.toEqual({ generation: 2 });
    expect(connections[0]?.shutdown).toHaveBeenCalledOnce();
  });

  it("rejects requests after application shutdown", async () => {
    const connection = new FakeConnection(1);
    const supervisor = new WorkerSupervisor(() => connection);
    supervisor.shutdown();

    await expect(supervisor.request("v1.health.check", {})).rejects.toThrow(/shut down/i);
    expect(connection.request).not.toHaveBeenCalled();
  });
});

