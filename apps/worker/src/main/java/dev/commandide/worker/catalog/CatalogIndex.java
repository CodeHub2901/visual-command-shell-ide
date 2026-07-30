package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogIndex(
        String schemaVersion,
        List<String> packs,
        List<String> overlays) {}
