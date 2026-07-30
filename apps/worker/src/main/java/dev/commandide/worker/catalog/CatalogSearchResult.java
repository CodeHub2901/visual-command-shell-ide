package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogSearchResult(String catalogVersion, int total, List<CommandSpec> commands) {}
