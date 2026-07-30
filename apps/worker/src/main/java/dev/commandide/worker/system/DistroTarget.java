package dev.commandide.worker.system;

public record DistroTarget(
        String id,
        String versionId,
        String prettyName,
        String family,
        boolean supported) {}

