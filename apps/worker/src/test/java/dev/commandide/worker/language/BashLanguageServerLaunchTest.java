// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class BashLanguageServerLaunchTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void prefersTheBundledEntrypointAndElectronNodeRuntime() throws Exception {
        Path runtime = executable("command-ide");
        Path entrypoint = temporaryDirectory
                .resolve("node_modules/bash-language-server/out/cli.js");
        Files.createDirectories(entrypoint.getParent());
        Files.writeString(entrypoint, "console.log('must not run during detection')");

        BashLanguageServerLaunch launch = BashLanguageServerLaunch.resolve(
                profile(List.of()),
                Map.of(
                        BashLanguageServerLaunch.RUNTIME_ENVIRONMENT, runtime.toString(),
                        BashLanguageServerLaunch.ENTRYPOINT_ENVIRONMENT, entrypoint.toString()))
                .orElseThrow();

        assertEquals("bundled", launch.source());
        assertEquals(runtime.toAbsolutePath().normalize(), launch.executable());
        assertEquals(List.of(entrypoint.toString(), "start"), launch.arguments());
        assertEquals(Map.of(
                "ELECTRON_RUN_AS_NODE", "1",
                "SHELLCHECK_PATH", "",
                "SHFMT_PATH", "",
                "BACKGROUND_ANALYSIS_MAX_FILES", "0"), launch.environment());
        assertEquals(entrypoint.toString(), launch.displayPath());
    }

    @Test
    void rejectsRelativeOrMissingBundledPathsAndFallsBackToPath() throws Exception {
        Path systemServer = executable("bash-language-server");

        BashLanguageServerLaunch launch = BashLanguageServerLaunch.resolve(
                profile(List.of(temporaryDirectory.toString())),
                Map.of(
                        BashLanguageServerLaunch.RUNTIME_ENVIRONMENT, "relative/electron",
                        BashLanguageServerLaunch.ENTRYPOINT_ENVIRONMENT, "relative/cli.js"))
                .orElseThrow();

        assertEquals("system", launch.source());
        assertEquals(systemServer.toAbsolutePath().normalize(), launch.executable());
        assertEquals(List.of("start"), launch.arguments());
        assertEquals(Map.of(
                "SHELLCHECK_PATH", "",
                "SHFMT_PATH", "",
                "BACKGROUND_ANALYSIS_MAX_FILES", "0"), launch.environment());
    }

    @Test
    void rejectsAnExistingButUnrecognizedJavascriptEntrypoint() throws Exception {
        Path runtime = executable("command-ide");
        Path untrustedEntrypoint = temporaryDirectory.resolve("untrusted.js");
        Files.writeString(untrustedEntrypoint, "console.log('must never run')");

        Optional<BashLanguageServerLaunch> launch = BashLanguageServerLaunch.resolve(
                profile(List.of()),
                Map.of(
                        BashLanguageServerLaunch.RUNTIME_ENVIRONMENT, runtime.toString(),
                        BashLanguageServerLaunch.ENTRYPOINT_ENVIRONMENT, untrustedEntrypoint.toString()));

        assertTrue(launch.isEmpty());
    }

    private Path executable(String name) throws Exception {
        Path executable = temporaryDirectory.resolve(name);
        Files.writeString(executable, "must not run during detection");
        executable.toFile().setExecutable(true);
        return executable;
    }

    private SystemProfile profile(List<String> pathEntries) {
        return new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
                pathEntries);
    }
}
