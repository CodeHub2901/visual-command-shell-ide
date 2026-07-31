// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

public record ExecutionEvent(
        String sessionId,
        long sequence,
        String type,
        String data,
        Integer exitStatus,
        String message,
        String occurredAt) {}
