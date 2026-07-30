package dev.commandide.worker.catalog;

public record CommandCompatibility(
        String status,
        String target,
        String note) {}
