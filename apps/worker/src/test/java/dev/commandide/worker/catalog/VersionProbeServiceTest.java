// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.process.ProcessRunner;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class VersionProbeServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void probesOnlyCatalogArgumentsAndCachesTheResult() throws Exception {
        Path ls = makeExecutable("ls");
        AtomicInteger calls = new AtomicInteger();
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            calls.incrementAndGet();
            assertEquals(ls.toAbsolutePath().normalize(), executable);
            assertEquals(List.of("--version"), arguments);
            return new ProcessRunner.ProcessResult(0, "\u001B[32mls (GNU coreutils) 9.5\u001B[0m\n", false, false);
        };
        VersionProbeService service = new VersionProbeService(catalog(), runner);

        VersionProbeResult first = service.probe("ls", false);
        VersionProbeResult second = service.probe("ls", false);

        assertEquals("ls (GNU coreutils) 9.5", first.version());
        assertFalse(first.cached());
        assertTrue(second.cached());
        assertEquals(1, calls.get());
    }

    @Test
    void forceBypassesTheCacheAndTimeoutsFailClosed() throws Exception {
        makeExecutable("ls");
        AtomicInteger calls = new AtomicInteger();
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            calls.incrementAndGet();
            return new ProcessRunner.ProcessResult(-1, "partial", true, false);
        };
        VersionProbeService service = new VersionProbeService(catalog(), runner);

        assertEquals("timed-out", service.probe("ls", false).status());
        assertEquals("timed-out", service.probe("ls", true).status());
        assertEquals(2, calls.get());
    }

    @Test
    void doesNotRunMissingCommands() {
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            throw new AssertionError("Missing commands must not execute");
        };

        assertEquals("unavailable", new VersionProbeService(catalog(), runner).probe("ls", false).status());
    }

    private Path makeExecutable(String name) throws Exception {
        Path path = temporaryDirectory.resolve(name);
        Files.writeString(path, "fixture");
        path.toFile().setExecutable(true);
        return path;
    }

    private CatalogService catalog() {
        return new CatalogService(new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
                List.of(temporaryDirectory.toString())));
    }
}
