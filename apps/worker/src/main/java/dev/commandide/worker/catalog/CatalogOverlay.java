package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogOverlay(
        String schemaVersion,
        String id,
        String distroFamily,
        List<String> versions,
        List<CommandOverride> commands) {

    public record CommandOverride(
            String commandId,
            String status,
            String note,
            List<String> unavailableOptionIds) {
        public CommandOverride {
            unavailableOptionIds = unavailableOptionIds == null
                    ? List.of()
                    : List.copyOf(unavailableOptionIds);
        }
    }
}
