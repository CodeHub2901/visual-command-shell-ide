// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.time.Instant;

public record ExecutionHistoryEntry(
        String id,
        Instant startedAt,
        Instant finishedAt,
        String workingDirectory,
        Integer exitStatus,
        String redactedCommandText,
        String riskLevel) {}
