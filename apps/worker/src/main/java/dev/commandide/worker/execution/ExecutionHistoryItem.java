// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

public record ExecutionHistoryItem(
        String executionId,
        String startedAt,
        String finishedAt,
        String workingDirectory,
        Integer exitStatus,
        String redactedCommandText,
        String riskLevel) {}
