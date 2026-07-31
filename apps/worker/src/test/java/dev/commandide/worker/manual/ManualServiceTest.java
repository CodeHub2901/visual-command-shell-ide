// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.process.ProcessRunner;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ManualServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void prefersManAndCachesTheParsedResult() throws Exception {
        makeExecutable("man");
        makeExecutable("ls");
        AtomicInteger calls = new AtomicInteger();
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            calls.incrementAndGet();
            return new ProcessRunner.ProcessResult(
                    0, "SYNOPSIS\n    ls [OPTION]\n\nDESCRIPTION\n    Native manual.", false, false);
        };
        ManualService service = new ManualService(catalog(), profile(), runner);

        assertEquals("man", service.get("ls").source());
        assertEquals("man", service.get("ls").source());
        assertNotNull(service.get("ls").tldr());
        assertEquals("CC-BY 4.0", service.get("ls").tldr().attribution().license());
        assertEquals(1, calls.get());
    }

    @Test
    void fallsBackToHelpWhenManIsUnavailable() throws Exception {
        makeExecutable("ls");
        ProcessRunner runner = (executable, arguments, environment, timeout) ->
                new ProcessRunner.ProcessResult(
                        0, "Usage: ls [OPTION]\nNative help.", false, false);
        ManualService service = new ManualService(catalog(), profile(), runner);

        assertEquals("help", service.get("ls").source());
    }

    @Test
    void usesBundledContentWhenNoNativeSourceIsAvailable() {
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            throw new AssertionError("No native command should run");
        };
        ManualService service = new ManualService(catalog(), profile(), runner);

        assertEquals("bundled", service.get("ls").source());
    }

    @Test
    void servesSemanticBundledManualsForExpandedCommandsOffline() {
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            throw new AssertionError("No native command should run");
        };
        ManualService service = new ManualService(catalog(), profile(), runner);

        ManualResult findmnt = service.get("findmnt");
        ManualResult umount = service.get("umount");

        assertEquals("bundled", findmnt.source());
        assertEquals("findmnt [OPTION]... [DEVICE|MOUNTPOINT]", findmnt.manual().synopsis());
        assertTrue(findmnt.manual().sections().stream()
                .anyMatch(section -> section.heading().equals("Scripting")));
        assertEquals("bundled", umount.source());
        assertTrue(umount.manual().sections().stream()
                .anyMatch(section -> section.heading().equals("Risk")
                        && section.body().contains("recursive")));
        assertNotNull(findmnt.tldr());
        assertTrue(findmnt.tldr().attribution().pageUrl().contains("/pages/linux/findmnt.md"));
        assertNotNull(umount.tldr());
        assertTrue(umount.tldr().attribution().pageUrl().contains("/pages/linux/umount.md"));
    }

    @Test
    void loadsRevisionPinnedTldrPagesFromCommonAndLinuxNamespaces() {
        ProcessRunner runner = (executable, arguments, environment, timeout) -> {
            throw new AssertionError("No native command should run");
        };
        ManualService service = new ManualService(catalog(), profile(), runner);

        ManualResult free = service.get("free");
        ManualResult lsblk = service.get("lsblk");
        ManualResult git = service.get("git");

        assertTrue(free.tldr().attribution().pageUrl().contains("/pages/linux/free.md"));
        assertTrue(lsblk.tldr().attribution().pageUrl().contains("/pages/linux/lsblk.md"));
        assertTrue(git.tldr().attribution().pageUrl().contains("/pages/common/git.md"));
        assertEquals("CC-BY 4.0", free.tldr().attribution().license());
        assertEquals("5ca248e494fba9776274f74362440708849e411f",
                free.tldr().attribution().sourceRevision());
    }

    private Path makeExecutable(String name) throws Exception {
        Path path = temporaryDirectory.resolve(name);
        Files.writeString(path, "fixture");
        path.toFile().setExecutable(true);
        return path;
    }

    private CatalogService catalog() {
        return new CatalogService(profile());
    }

    private SystemProfile profile() {
        return new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
                List.of(temporaryDirectory.toString()));
    }
}
