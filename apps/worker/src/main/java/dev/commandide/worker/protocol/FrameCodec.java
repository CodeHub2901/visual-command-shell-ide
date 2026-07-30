package dev.commandide.worker.protocol;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

public final class FrameCodec {
    public static final int MAX_FRAME_BYTES = 16 * 1024 * 1024;
    private static final int MAX_HEADER_BYTES = 8 * 1024;

    private FrameCodec() {}

    public static byte[] readFrame(InputStream input) throws IOException {
        String firstLine = readAsciiLine(input);
        if (firstLine == null) {
            return null;
        }

        int headerBytes = firstLine.length() + 2;
        Long contentLength = null;
        String line = firstLine;
        while (!line.isEmpty()) {
            int separator = line.indexOf(':');
            if (separator <= 0) {
                throw new IOException("Malformed protocol header");
            }

            String name = line.substring(0, separator).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(separator + 1).trim();
            if (name.equals("content-length")) {
                if (contentLength != null) {
                    throw new IOException("Duplicate Content-Length header");
                }
                try {
                    contentLength = Long.parseLong(value);
                } catch (NumberFormatException exception) {
                    throw new IOException("Invalid Content-Length header", exception);
                }
            }

            line = readAsciiLine(input);
            if (line == null) {
                throw new EOFException("Unexpected end of stream in protocol header");
            }
            headerBytes += line.length() + 2;
            if (headerBytes > MAX_HEADER_BYTES) {
                throw new IOException("Protocol header exceeds 8 KiB");
            }
        }

        if (contentLength == null) {
            throw new IOException("Missing Content-Length header");
        }
        if (contentLength < 0 || contentLength > MAX_FRAME_BYTES) {
            throw new IOException("Protocol frame length is outside the allowed range");
        }

        byte[] payload = input.readNBytes(contentLength.intValue());
        if (payload.length != contentLength.intValue()) {
            throw new EOFException("Unexpected end of stream in protocol payload");
        }
        return payload;
    }

    public static synchronized void writeFrame(OutputStream output, byte[] payload) throws IOException {
        if (payload.length > MAX_FRAME_BYTES) {
            throw new IOException("Protocol frame exceeds maximum size");
        }
        byte[] header = ("Content-Length: " + payload.length + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII);
        output.write(header);
        output.write(payload);
        output.flush();
    }

    private static String readAsciiLine(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        int previous = -1;
        while (true) {
            int current = input.read();
            if (current == -1) {
                if (bytes.size() == 0 && previous == -1) {
                    return null;
                }
                throw new EOFException("Protocol header line is not CRLF terminated");
            }

            if (previous == '\r' && current == '\n') {
                byte[] line = bytes.toByteArray();
                return new String(line, 0, Math.max(0, line.length - 1), StandardCharsets.US_ASCII);
            }

            bytes.write(current);
            previous = current;
            if (bytes.size() > MAX_HEADER_BYTES) {
                throw new IOException("Protocol header line exceeds 8 KiB");
            }
        }
    }
}

