package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogDiscoveryResult(
        int total,
        boolean truncated,
        boolean cached,
        int shadowedCount,
        int skippedUnsafeNames,
        List<DiscoveredExecutable> executables) {}
