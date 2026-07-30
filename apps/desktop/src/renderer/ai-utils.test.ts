import { describe, expect, it } from "vitest";
import { isRemoteAiEndpoint } from "./ai-utils";

describe("AI endpoint classification", () => {
  it("recognizes supported loopback spellings", () => {
    expect(isRemoteAiEndpoint("http://localhost:11434")).toBe(false);
    expect(isRemoteAiEndpoint("http://127.0.0.1:11434")).toBe(false);
    expect(isRemoteAiEndpoint("http://[::1]:11434")).toBe(false);
  });

  it("requires explicit confirmation for non-loopback hosts", () => {
    expect(isRemoteAiEndpoint("https://ollama.example.test")).toBe(true);
  });
});

