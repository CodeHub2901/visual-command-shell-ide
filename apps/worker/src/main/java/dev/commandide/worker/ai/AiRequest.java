// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

public record AiRequest(
        String provider,
        String endpoint,
        String model,
        boolean remoteEndpointConfirmed,
        String operation,
        String instruction,
        String source,
        String failureMessage) {}
