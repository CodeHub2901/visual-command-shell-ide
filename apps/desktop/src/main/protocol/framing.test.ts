// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { encodeFrame, FrameDecoder } from "./framing";

describe("framed JSON-RPC transport", () => {
  it("decodes a frame split across chunks", () => {
    const frame = encodeFrame({ value: "hello" });
    const decoder = new FrameDecoder();

    expect(decoder.push(frame.subarray(0, 7))).toEqual([]);
    expect(decoder.push(frame.subarray(7))).toEqual([{ value: "hello" }]);
  });

  it("uses UTF-8 byte length", () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(encodeFrame({ value: "shell 🐚" }))).toEqual([
      { value: "shell 🐚" }
    ]);
  });

  it("decodes multiple frames from one chunk", () => {
    const decoder = new FrameDecoder();
    expect(decoder.push(Buffer.concat([encodeFrame({ id: 1 }), encodeFrame({ id: 2 })]))).toEqual([
      { id: 1 },
      { id: 2 }
    ]);
  });

  it("rejects ambiguous content lengths", () => {
    const decoder = new FrameDecoder();
    expect(() =>
      decoder.push(
        Buffer.from("Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}", "utf8")
      )
    ).toThrow(/exactly one/i);
  });
});

