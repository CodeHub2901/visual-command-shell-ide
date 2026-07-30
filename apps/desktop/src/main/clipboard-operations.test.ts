import { describe, expect, it, vi } from "vitest";
import { copyGeneratedCommand } from "./clipboard-operations";

describe("command clipboard boundary", () => {
  it("writes a validated generated script and reports the copied character count", () => {
    const writeText = vi.fn();

    expect(copyGeneratedCommand({
      script: "ls -al .",
      compacted: true,
      warnings: []
    }, writeText)).toEqual({
      copied: true,
      characters: 8
    });
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith("ls -al .");
  });

  it("does not call the native clipboard for malformed input", () => {
    const writeText = vi.fn();

    expect(() => copyGeneratedCommand({ script: "", compacted: false, warnings: [] }, writeText)).toThrow();
    expect(() => copyGeneratedCommand({
      script: "ls",
      compacted: false,
      warnings: [],
      html: "<b>ls</b>"
    }, writeText)).toThrow();
    expect(writeText).not.toHaveBeenCalled();
  });
});
