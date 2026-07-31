// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.tooling;

public record ToolStatus(
        String id,
        String displayName,
        String status,
        String source,
        String executablePath,
        String installGuidance) {}
