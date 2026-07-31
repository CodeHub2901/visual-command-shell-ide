// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

public record BashLanguageServerLaunch(
        Path executable,
        List<String> arguments,
        Map<String, String> environment,
        String source,
        String displayPath) {
    static final String RUNTIME_ENVIRONMENT = "CMD_IDE_BLS_RUNTIME";
    static final String ENTRYPOINT_ENVIRONMENT = "CMD_IDE_BLS_ENTRYPOINT";
    private static final String ENTRYPOINT_SUFFIX =
            "/node_modules/bash-language-server/out/cli.js";
    private static final Map<String, String> ISOLATED_SERVER_ENVIRONMENT = Map.of(
            "SHELLCHECK_PATH", "",
            "SHFMT_PATH", "",
            "BACKGROUND_ANALYSIS_MAX_FILES", "0");

    public BashLanguageServerLaunch {
        executable = executable.toAbsolutePath().normalize();
        arguments = List.copyOf(arguments);
        environment = Map.copyOf(environment);
        if (arguments.isEmpty()) throw new IllegalArgumentException("Language server arguments are required");
        if (!source.equals("bundled") && !source.equals("system")) {
            throw new IllegalArgumentException("Unknown language server source");
        }
    }

    public static Optional<BashLanguageServerLaunch> resolve(SystemProfile profile) {
        return resolve(profile, System.getenv());
    }

    static Optional<BashLanguageServerLaunch> resolve(
            SystemProfile profile,
            Map<String, String> environment) {
        Optional<BashLanguageServerLaunch> bundled = bundled(environment);
        if (bundled.isPresent()) return bundled;
        return ExecutableDiscovery.find(
                        "bash-language-server",
                        profile.pathEntries(),
                        profile.operatingSystem())
                .map(path -> new BashLanguageServerLaunch(
                        path,
                        List.of("start"),
                        ISOLATED_SERVER_ENVIRONMENT,
                        "system",
                        path.toAbsolutePath().normalize().toString()));
    }

    private static Optional<BashLanguageServerLaunch> bundled(Map<String, String> environment) {
        String runtimeValue = environment.get(RUNTIME_ENVIRONMENT);
        String entrypointValue = environment.get(ENTRYPOINT_ENVIRONMENT);
        if (runtimeValue == null || runtimeValue.isBlank()
                || entrypointValue == null || entrypointValue.isBlank()) {
            return Optional.empty();
        }
        try {
            Path runtime = Path.of(runtimeValue);
            Path entrypoint = Path.of(entrypointValue);
            if (!runtime.isAbsolute() || !entrypoint.isAbsolute()) return Optional.empty();
            runtime = runtime.normalize();
            entrypoint = entrypoint.normalize();
            if (!Files.isRegularFile(runtime) || !Files.isExecutable(runtime)) return Optional.empty();
            if (!isTrustedEntrypoint(entrypoint)) return Optional.empty();
            return Optional.of(new BashLanguageServerLaunch(
                    runtime,
                    List.of(entrypoint.toString(), "start"),
                    Map.of(
                            "ELECTRON_RUN_AS_NODE", "1",
                            "SHELLCHECK_PATH", "",
                            "SHFMT_PATH", "",
                            "BACKGROUND_ANALYSIS_MAX_FILES", "0"),
                    "bundled",
                    entrypoint.toString()));
        } catch (InvalidPathException exception) {
            return Optional.empty();
        }
    }

    private static boolean isTrustedEntrypoint(Path entrypoint) {
        String portable = entrypoint.toString().replace('\\', '/').toLowerCase(Locale.ROOT);
        if (!portable.endsWith(ENTRYPOINT_SUFFIX)) return false;
        return (Files.isRegularFile(entrypoint) && Files.isReadable(entrypoint))
                || portable.contains(".asar/");
    }
}
