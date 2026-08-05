// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.logging;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.util.Map;
import org.junit.jupiter.api.Test;

class StructuredLogTest {
    @Test
    void redactsContentAndPathsWhileKeepingOperationalValues() {
        Map<String, Object> sanitized = StructuredLog.sanitize(Map.of(
                "method", "v1.execution.start",
                "sessionId", "session-1",
                "script", "rm -rf private",
                "credential", "secret-value",
                "filePath", "/home/example/private.txt",
                "columns", 120));

        assertEquals("v1.execution.start", sanitized.get("method"));
        assertEquals("session-1", sanitized.get("sessionId"));
        assertEquals("<redacted:14 chars>", sanitized.get("script"));
        assertEquals("<redacted:12 chars>", sanitized.get("credential"));
        assertEquals("<redacted-path>", sanitized.get("filePath"));
        assertEquals(120, sanitized.get("columns"));
        assertFalse(sanitized.toString().contains("private"));
    }
}
