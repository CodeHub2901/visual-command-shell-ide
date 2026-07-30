package dev.commandide.worker.credential;

public record CredentialStatus(
        String provider,
        boolean configured,
        String storage,
        String backend,
        String reason) {}

