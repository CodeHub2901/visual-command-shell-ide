// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

const HEADER_SEPARATOR = Buffer.from("\r\n\r\n", "ascii");
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

export function encodeFrame(value: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new Error(`Protocol frame exceeds ${MAX_FRAME_BYTES} bytes`);
  }

  const header = Buffer.from(`Content-Length: ${payload.byteLength}\r\n\r\n`, "ascii");
  return Buffer.concat([header, payload]);
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    if (chunk.byteLength === 0) {
      return [];
    }

    this.buffer = Buffer.concat([this.buffer, chunk]);
    const values: unknown[] = [];

    while (true) {
      const headerEnd = this.buffer.indexOf(HEADER_SEPARATOR);
      if (headerEnd < 0) {
        if (this.buffer.byteLength > 8 * 1024) {
          throw new Error("Protocol frame header exceeds 8 KiB");
        }
        break;
      }

      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(header);
      if (contentLength > MAX_FRAME_BYTES) {
        throw new Error(`Protocol frame exceeds ${MAX_FRAME_BYTES} bytes`);
      }

      const payloadStart = headerEnd + HEADER_SEPARATOR.byteLength;
      const frameEnd = payloadStart + contentLength;
      if (this.buffer.byteLength < frameEnd) {
        break;
      }

      const payload = this.buffer.subarray(payloadStart, frameEnd).toString("utf8");
      this.buffer = this.buffer.subarray(frameEnd);
      values.push(JSON.parse(payload) as unknown);
    }

    return values;
  }
}

function parseContentLength(header: string): number {
  const lines = header.split("\r\n");
  const matches = lines
    .map((line) => /^Content-Length:\s*(\d+)$/i.exec(line))
    .filter((match): match is RegExpExecArray => match !== null);

  if (matches.length !== 1) {
    throw new Error("Protocol frame must contain exactly one Content-Length header");
  }

  const rawLength = matches[0]?.[1];
  const length = rawLength === undefined ? Number.NaN : Number(rawLength);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error("Protocol Content-Length is invalid");
  }
  return length;
}

