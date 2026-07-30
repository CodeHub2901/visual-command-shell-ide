package dev.commandide.worker.catalog;

public record VersionProbeResult(
        String commandId,
        String status,
        String version,
        boolean cached,
        boolean truncated) {
    VersionProbeResult asCached() {
        return new VersionProbeResult(commandId, status, version, true, truncated);
    }
}
