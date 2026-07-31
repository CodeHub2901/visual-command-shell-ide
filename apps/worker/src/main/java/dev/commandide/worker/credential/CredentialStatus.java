// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

public record CredentialStatus(
        String provider,
        boolean configured,
        String storage,
        String backend,
        String reason) {}

