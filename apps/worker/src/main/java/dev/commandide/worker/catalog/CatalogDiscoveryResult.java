// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogDiscoveryResult(
        int total,
        boolean truncated,
        boolean cached,
        int shadowedCount,
        int skippedUnsafeNames,
        List<DiscoveredExecutable> executables) {}
