// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

import java.util.Optional;

interface SecureCredentialStore {
    boolean available();

    String backend();

    Optional<char[]> get(String provider) throws Exception;

    void put(String provider, char[] credential) throws Exception;

    boolean delete(String provider) throws Exception;
}

