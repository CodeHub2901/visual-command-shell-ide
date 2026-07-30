import { describe, expect, it } from "vitest";
import { criticalExecutionPolicy } from "./execution-policy";

const HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("critical execution policy", () => {
  it("allows non-critical scripts without typed confirmation", () => {
    expect(criticalExecutionPolicy("high", "Guided", HASH, "")).toEqual({
      phrase: "RUN 0123456789ab",
      blocked: false,
      ready: true
    });
  });

  it("always blocks critical scripts in Guided mode", () => {
    expect(criticalExecutionPolicy("critical", "Guided", HASH, "RUN 0123456789ab")).toEqual({
      phrase: "RUN 0123456789ab",
      blocked: true,
      ready: false
    });
  });

  it("requires the exact hash-bound phrase for critical Compact execution", () => {
    expect(criticalExecutionPolicy("critical", "Compact", HASH, "RUN wrong").ready).toBe(false);
    expect(criticalExecutionPolicy("critical", "Compact", HASH, "RUN 0123456789ab")).toEqual({
      phrase: "RUN 0123456789ab",
      blocked: false,
      ready: true
    });
  });
});
