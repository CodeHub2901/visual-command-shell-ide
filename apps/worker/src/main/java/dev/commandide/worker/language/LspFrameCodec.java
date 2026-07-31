// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

final class LspFrameCodec {
    static final int MAX_FRAME_BYTES = 4 * 1024 * 1024;
    private static final int MAX_HEADER_BYTES = 8 * 1024;

    private LspFrameCodec() {}

    static byte[] readFrame(InputStream input) throws IOException {
        String line = readAsciiLine(input);
        if (line == null) return null;

        int headerBytes = line.length() + 2;
        Integer contentLength = null;
        while (!line.isEmpty()) {
            int separator = line.indexOf(':');
            if (separator <= 0) throw new IOException("Malformed LSP header");
            String name = line.substring(0, separator).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(separator + 1).trim();
            if ("content-length".equals(name)) {
                if (contentLength != null) throw new IOException("Duplicate LSP Content-Length header");
                try {
                    long parsed = Long.parseLong(value);
                    if (parsed < 0 || parsed > MAX_FRAME_BYTES) {
                        throw new IOException("LSP frame length is outside the allowed range");
                    }
                    contentLength = (int) parsed;
                } catch (NumberFormatException exception) {
                    throw new IOException("Invalid LSP Content-Length header", exception);
                }
            }
            line = readAsciiLine(input);
            if (line == null) throw new EOFException("Unexpected end of LSP headers");
            headerBytes += line.length() + 2;
            if (headerBytes > MAX_HEADER_BYTES) throw new IOException("LSP headers exceed 8 KiB");
        }
        if (contentLength == null) throw new IOException("Missing LSP Content-Length header");
        byte[] payload = input.readNBytes(contentLength);
        if (payload.length != contentLength) throw new EOFException("Unexpected end of LSP payload");
        return payload;
    }

    static void writeFrame(OutputStream output, byte[] payload) throws IOException {
        if (payload.length > MAX_FRAME_BYTES) throw new IOException("LSP frame exceeds 4 MiB");
        output.write(("Content-Length: " + payload.length + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII));
        output.write(payload);
        output.flush();
    }

    private static String readAsciiLine(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int previous = -1;
        while (true) {
            int current = input.read();
            if (current == -1) {
                if (bytes.size() == 0 && previous == -1) return null;
                throw new EOFException("LSP header line is not CRLF terminated");
            }
            if (previous == '\r' && current == '\n') {
                byte[] line = bytes.toByteArray();
                return new String(line, 0, Math.max(0, line.length - 1), StandardCharsets.US_ASCII);
            }
            bytes.write(current);
            previous = current;
            if (bytes.size() > MAX_HEADER_BYTES) throw new IOException("LSP header line exceeds 8 KiB");
        }
    }
}
