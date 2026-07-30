package dev.commandide.worker.system;

import java.util.List;

public record SystemProfile(
        String operatingSystem,
        String architecture,
        ShellEnvironment shell,
        DistroTarget distro,
        List<String> pathEntries) {}

