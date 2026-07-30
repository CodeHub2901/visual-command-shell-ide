package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogDocument(String schemaVersion, List<CatalogCommand> commands) {}
