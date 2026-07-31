// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;

public final class CredentialStores {
    private CredentialStores() {}

    public static CredentialService create(SystemProfile profile) {
        SecureCredentialStore store;
        try {
            store = switch (profile.operatingSystem()) {
                case "windows" -> WindowsCredentialStore.create();
                case "macos" -> MacOsKeychainCredentialStore.create();
                case "linux" -> {
                    Path executable = ExecutableDiscovery.find(
                            "secret-tool", profile.pathEntries(), profile.operatingSystem()).orElse(null);
                    yield executable == null
                            ? UnavailableCredentialStore.INSTANCE
                            : new LinuxSecretServiceCredentialStore(executable);
                }
                default -> UnavailableCredentialStore.INSTANCE;
            };
        } catch (Throwable failure) {
            store = UnavailableCredentialStore.INSTANCE;
        }
        return new CredentialService(store);
    }

    private enum UnavailableCredentialStore implements SecureCredentialStore {
        INSTANCE;

        @Override
        public boolean available() {
            return false;
        }

        @Override
        public String backend() {
            return "none";
        }

        @Override
        public java.util.Optional<char[]> get(String provider) {
            return java.util.Optional.empty();
        }

        @Override
        public void put(String provider, char[] credential) {
            throw new IllegalStateException("Secure credential storage is unavailable");
        }

        @Override
        public boolean delete(String provider) {
            return false;
        }
    }
}

