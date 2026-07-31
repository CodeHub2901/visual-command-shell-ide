// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

final class SessionCredentialStore implements AutoCloseable {
    private final Map<String, char[]> values = new HashMap<>();

    synchronized Optional<char[]> get(String provider) {
        char[] value = values.get(provider);
        return value == null ? Optional.empty() : Optional.of(Arrays.copyOf(value, value.length));
    }

    synchronized void put(String provider, char[] credential) {
        char[] previous = values.put(provider, Arrays.copyOf(credential, credential.length));
        clear(previous);
    }

    synchronized boolean delete(String provider) {
        char[] previous = values.remove(provider);
        clear(previous);
        return previous != null;
    }

    @Override
    public synchronized void close() {
        values.values().forEach(SessionCredentialStore::clear);
        values.clear();
    }

    private static void clear(char[] value) {
        if (value != null) Arrays.fill(value, '\0');
    }
}

