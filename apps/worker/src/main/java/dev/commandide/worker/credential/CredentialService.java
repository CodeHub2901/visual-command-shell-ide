package dev.commandide.worker.credential;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

public final class CredentialService implements AutoCloseable {
    private static final Set<String> PROVIDERS = Set.of("openai");
    private static final int MAX_CREDENTIAL_LENGTH = 4096;
    private final SecureCredentialStore secure;
    private final SessionCredentialStore session = new SessionCredentialStore();

    CredentialService(SecureCredentialStore secure) {
        this.secure = secure;
    }

    public static CredentialService sessionOnly() {
        return new CredentialService(new SecureCredentialStore() {
            @Override
            public boolean available() {
                return false;
            }

            @Override
            public String backend() {
                return "none";
            }

            @Override
            public Optional<char[]> get(String provider) {
                return Optional.empty();
            }

            @Override
            public void put(String provider, char[] credential) {
                throw new IllegalStateException("Secure credential storage is unavailable");
            }

            @Override
            public boolean delete(String provider) {
                return false;
            }
        });
    }

    public CredentialStatus status(String provider) {
        requireProvider(provider);
        if (secure.available()) {
            try {
                Optional<char[]> stored = secure.get(provider);
                if (stored.isPresent()) {
                    Arrays.fill(stored.get(), '\0');
                    return status(provider, true, "secure", secure.backend(), null);
                }
                Optional<CredentialStatus> sessionStatus = sessionStatus(provider);
                if (sessionStatus.isPresent()) return sessionStatus.get();
                return status(provider, false, "secure", secure.backend(), null);
            } catch (Exception exception) {
                return sessionStatusOrUnavailable(provider);
            }
        }
        return sessionStatusOrUnavailable(provider);
    }

    public CredentialStatus store(String provider, char[] credential) {
        requireProvider(provider);
        requireCredential(credential);
        try {
            if (secure.available()) {
                secure.put(provider, credential);
                session.delete(provider);
                return status(provider, true, "secure", secure.backend(), null);
            }
        } catch (Exception ignored) {
            // A locked or failed OS store is unavailable for this operation.
        }
        session.put(provider, credential);
        return status(
                provider,
                true,
                "session",
                "session-memory",
                "Secure credential storage is unavailable; the key lasts only for this worker session.");
    }

    public CredentialStatus delete(String provider) {
        requireProvider(provider);
        session.delete(provider);
        if (secure.available()) {
            try {
                secure.delete(provider);
                return status(provider, false, "secure", secure.backend(), null);
            } catch (Exception exception) {
                return status(
                        provider,
                        false,
                        "unavailable",
                        secure.backend(),
                        "The operating-system credential store could not be updated.");
            }
        }
        return status(
                provider,
                false,
                "unavailable",
                "none",
                "Secure credential storage is unavailable.");
    }

    public Optional<CredentialLease> acquire(String provider) {
        requireProvider(provider);
        if (secure.available()) {
            try {
                Optional<char[]> stored = secure.get(provider);
                if (stored.isPresent()) {
                    char[] value = stored.get();
                    try {
                        return Optional.of(new CredentialLease(value));
                    } finally {
                        Arrays.fill(value, '\0');
                    }
                }
            } catch (Exception ignored) {
                // Fall back only to this process's explicitly stored session credential.
            }
        }
        Optional<char[]> stored = session.get(provider);
        if (stored.isEmpty()) return Optional.empty();
        char[] value = stored.get();
        try {
            return Optional.of(new CredentialLease(value));
        } finally {
            Arrays.fill(value, '\0');
        }
    }

    @Override
    public void close() {
        session.close();
    }

    private CredentialStatus sessionStatusOrUnavailable(String provider) {
        Optional<CredentialStatus> status = sessionStatus(provider);
        if (status.isPresent()) return status.get();
        return status(
                provider,
                false,
                "unavailable",
                secure.available() ? secure.backend() : "none",
                "Secure credential storage is unavailable.");
    }

    private Optional<CredentialStatus> sessionStatus(String provider) {
        Optional<char[]> stored = session.get(provider);
        if (stored.isPresent()) {
            Arrays.fill(stored.get(), '\0');
            return Optional.of(status(
                    provider,
                    true,
                    "session",
                    "session-memory",
                    "Secure credential storage is unavailable; the key lasts only for this worker session."));
        }
        return Optional.empty();
    }

    private CredentialStatus status(
            String provider,
            boolean configured,
            String storage,
            String backend,
            String reason) {
        return new CredentialStatus(provider, configured, storage, backend, reason);
    }

    private void requireProvider(String provider) {
        if (!PROVIDERS.contains(provider)) {
            throw new IllegalArgumentException("Unsupported credential provider");
        }
    }

    private void requireCredential(char[] credential) {
        if (credential == null
                || credential.length == 0
                || credential.length > MAX_CREDENTIAL_LENGTH) {
            throw new IllegalArgumentException("Invalid credential");
        }
        for (char character : credential) {
            if (Character.isISOControl(character)) {
                throw new IllegalArgumentException("Invalid credential");
            }
        }
    }
}
