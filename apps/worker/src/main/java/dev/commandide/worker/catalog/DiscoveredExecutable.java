// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

public record DiscoveredExecutable(
        String executable,
        String path,
        String catalogCommandId,
        String category,
        String summary) {}
