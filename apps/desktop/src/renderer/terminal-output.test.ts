import { describe, expect, test } from "vitest";
import { TerminalOutputSanitizer } from "./terminal-output";

describe("TerminalOutputSanitizer", () => {
  test("preserves ordinary text and CSI terminal formatting", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    expect(sanitizer.push("ready\r\n\u001b[31merror\u001b[0m")).toBe(
      "ready\r\n\u001b[31merror\u001b[0m"
    );
  });

  test("strips BEL-terminated OSC title and clipboard sequences", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    expect(sanitizer.push(
      "before\u001b]0;host title\u0007middle\u001b]52;c;c2VjcmV0\u0007after"
    )).toBe("beforemiddleafter");
  });

  test("strips ST-terminated OSC sequences split across output chunks", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    expect(sanitizer.push("before\u001b")).toBe("before");
    expect(sanitizer.push("]8;;https://malicious.invalid")).toBe("");
    expect(sanitizer.push("\u001b")).toBe("");
    expect(sanitizer.push("\\linked text")).toBe("linked text");
  });

  test("strips C1 OSC and string terminator forms", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    expect(sanitizer.push("a\u009d52;c;payload\u009cb")).toBe("ab");
  });

  test("bounds unterminated control sequences and resumes visible output", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    const output = sanitizer.push(`start\u001b]52;c;${"x".repeat(8_300)}end`);

    expect(output).toContain("[blocked oversized terminal control sequence]");
    expect(output).toContain("end");
  });

  test("reset discards a partial sequence between sessions", () => {
    const sanitizer = new TerminalOutputSanitizer("[blocked oversized terminal control sequence]");

    expect(sanitizer.push("\u001b]52;c;partial")).toBe("");
    sanitizer.reset();
    expect(sanitizer.push("new session")).toBe("new session");
  });
});
