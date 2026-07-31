// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.tooling;

public record ShfmtResult(
        String status,
        String source,
        boolean changed,
        String reason) {}
