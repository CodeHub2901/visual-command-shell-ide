// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

public record ExecutionStartResult(
        String sessionId,
        String riskLevel,
        String reviewHash,
        String startedAt) {}
