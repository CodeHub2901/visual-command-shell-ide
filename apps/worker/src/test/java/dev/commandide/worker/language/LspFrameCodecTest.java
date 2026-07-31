// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

final class LspFrameCodecTest {
    @Test
    void roundTripsUnicodeAndMultipleFrames() throws Exception {
        byte[] first = "{\"value\":\"shell 🐚\"}".getBytes(StandardCharsets.UTF_8);
        byte[] second = "{}".getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        LspFrameCodec.writeFrame(output, first);
        LspFrameCodec.writeFrame(output, second);
        ByteArrayInputStream input = new ByteArrayInputStream(output.toByteArray());

        assertArrayEquals(first, LspFrameCodec.readFrame(input));
        assertArrayEquals(second, LspFrameCodec.readFrame(input));
    }

    @Test
    void rejectsOversizedAndTruncatedFrames() {
        byte[] oversized = ("Content-Length: " + (LspFrameCodec.MAX_FRAME_BYTES + 1) + "\r\n\r\n")
                .getBytes(StandardCharsets.US_ASCII);
        byte[] truncated = "Content-Length: 5\r\n\r\n{}".getBytes(StandardCharsets.US_ASCII);

        assertThrows(IOException.class,
                () -> LspFrameCodec.readFrame(new ByteArrayInputStream(oversized)));
        assertThrows(IOException.class,
                () -> LspFrameCodec.readFrame(new ByteArrayInputStream(truncated)));
    }
}
