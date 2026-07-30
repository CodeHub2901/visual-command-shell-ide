package dev.commandide.worker.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

final class SecretRedactorTest {
    private final SecretRedactor redactor = new SecretRedactor();

    @Test
    void redactsAssignmentsAndLongOptions() {
        assertEquals(
                "OPENAI_API_KEY=<redacted> curl --token=<redacted> --password <redacted>",
                redactor.redact("OPENAI_API_KEY='sk-test' curl --token=abc123 --password hunter2"));
    }

    @Test
    void redactsBearerTokens() {
        assertEquals(
                "Authorization: Bearer <redacted>",
                redactor.redact("Authorization: Bearer eyJhbGciOi.secret.signature"));
    }

    @Test
    void preservesOrdinaryArguments() {
        assertEquals("find /tmp -name token.txt", redactor.redact("find /tmp -name token.txt"));
    }
}

