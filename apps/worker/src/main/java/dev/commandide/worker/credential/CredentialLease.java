package dev.commandide.worker.credential;

import java.util.Arrays;

public final class CredentialLease implements AutoCloseable {
    private char[] value;

    CredentialLease(char[] value) {
        this.value = Arrays.copyOf(value, value.length);
    }

    public char[] value() {
        if (value == null) throw new IllegalStateException("Credential lease is closed");
        return value;
    }

    @Override
    public void close() {
        if (value != null) {
            Arrays.fill(value, '\0');
            value = null;
        }
    }
}

