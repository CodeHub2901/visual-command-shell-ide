package dev.commandide.worker.credential;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import java.util.Optional;
import org.junit.jupiter.api.Test;

final class CredentialServiceTest {
    @Test
    void storesInTheOperatingSystemBackendAndReturnsOnlyMetadata() {
        FakeSecureStore secure = new FakeSecureStore(true, false);
        CredentialService service = new CredentialService(secure);
        char[] input = "sk-test-value".toCharArray();

        CredentialStatus empty = service.status("openai");
        CredentialStatus stored = service.store("openai", input);

        assertEquals("secure", empty.storage());
        assertEquals("test-secure-store", empty.backend());
        assertFalse(empty.configured());
        assertEquals("secure", stored.storage());
        assertEquals("test-secure-store", stored.backend());
        assertTrue(stored.configured());
        assertArrayEquals("sk-test-value".toCharArray(), secure.value);
        assertFalse(stored.toString().contains("sk-test-value"));
        try (CredentialLease lease = service.acquire("openai").orElseThrow()) {
            assertArrayEquals(input, lease.value());
        }
        assertFalse(java.util.Arrays.stream(CredentialService.class.getDeclaredFields())
                .anyMatch(field -> field.getType().getName().contains("SettingsRepository")));
    }

    @Test
    void fallsBackToMemoryOnlyAndClearsItAtWorkerShutdown() {
        CredentialService service = new CredentialService(new FakeSecureStore(false, false));
        CredentialStatus stored = service.store("openai", "session-key".toCharArray());

        assertEquals("session", stored.storage());
        assertTrue(stored.reason().contains("worker session"));
        assertTrue(service.acquire("openai").isPresent());

        service.close();

        assertTrue(service.acquire("openai").isEmpty());
    }

    @Test
    void usesSessionFallbackWhenAnAvailableStoreIsLockedAndValidatesInputs() {
        CredentialService service = new CredentialService(new FakeSecureStore(true, true));
        assertEquals("session", service.store("openai", "temporary".toCharArray()).storage());
        assertThrows(IllegalArgumentException.class, () -> service.store("ollama", "key".toCharArray()));
        assertThrows(IllegalArgumentException.class, () -> service.store("openai", new char[0]));
        assertThrows(IllegalArgumentException.class, () -> service.store(
                "openai", "line\nbreak".toCharArray()));
        assertEquals("unavailable", service.delete("openai").storage());
        assertTrue(service.acquire("openai").isEmpty());
    }

    private static final class FakeSecureStore implements SecureCredentialStore {
        private final boolean available;
        private final boolean fails;
        private char[] value;

        FakeSecureStore(boolean available, boolean fails) {
            this.available = available;
            this.fails = fails;
        }

        @Override
        public boolean available() {
            return available;
        }

        @Override
        public String backend() {
            return "test-secure-store";
        }

        @Override
        public Optional<char[]> get(String provider) {
            failIfNeeded();
            return value == null ? Optional.empty() : Optional.of(Arrays.copyOf(value, value.length));
        }

        @Override
        public void put(String provider, char[] credential) {
            failIfNeeded();
            value = Arrays.copyOf(credential, credential.length);
        }

        @Override
        public boolean delete(String provider) {
            failIfNeeded();
            boolean existed = value != null;
            if (value != null) Arrays.fill(value, '\0');
            value = null;
            return existed;
        }

        private void failIfNeeded() {
            if (fails) throw new IllegalStateException("locked");
        }
    }
}
