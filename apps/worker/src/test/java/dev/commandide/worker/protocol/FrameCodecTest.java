// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.protocol;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

final class FrameCodecTest {
    @Test
    void roundTripsUnicodePayload() throws IOException {
        byte[] payload = "{\"value\":\"shell 🐚\"}".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FrameCodec.writeFrame(output, payload);

        assertArrayEquals(payload, FrameCodec.readFrame(new ByteArrayInputStream(output.toByteArray())));
    }

    @Test
    void rejectsDuplicateContentLength() {
        byte[] frame = "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}"
                .getBytes(StandardCharsets.UTF_8);

        assertThrows(
                IOException.class,
                () -> FrameCodec.readFrame(new ByteArrayInputStream(frame)));
    }

    @Test
    void rejectsTruncatedPayload() {
        byte[] frame = "Content-Length: 10\r\n\r\n{}".getBytes(StandardCharsets.UTF_8);

        assertThrows(
                IOException.class,
                () -> FrameCodec.readFrame(new ByteArrayInputStream(frame)));
    }
}

