package dev.commandide.worker.tooling;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ToolingDetectionServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void detectsToolsByFilesystemInspectionWithoutLaunchingThem() throws Exception {
        Path shellcheck = temporaryDirectory.resolve("shellcheck");
        Files.writeString(shellcheck, "this must never be launched");
        shellcheck.toFile().setExecutable(true);
        SystemProfile profile = new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
                List.of(temporaryDirectory.toString()));

        ToolingProfile result = new ToolingDetectionService(profile).detect();
        ToolStatus detected = result.tools().stream()
                .filter(tool -> tool.id().equals("shellcheck"))
                .findFirst().orElseThrow();

        assertEquals("installed", detected.status());
        assertEquals("system", detected.source());
        assertEquals(shellcheck.toAbsolutePath().normalize().toString(), detected.executablePath());
        assertTrue(detected.installGuidance().contains("Ubuntu"));
    }

    @Test
    void reportsMissingToolsWithNoInventedPath() {
        SystemProfile profile = new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("fedora", "44", "Fedora 44", "fedora", true),
                List.of(temporaryDirectory.toString()));

        ToolingProfile result = new ToolingDetectionService(profile).detect();

        assertEquals(3, result.tools().size());
        assertTrue(result.tools().stream().allMatch(tool -> tool.status().equals("missing")));
        assertTrue(result.tools().stream().allMatch(tool -> tool.source().equals("missing")));
        assertTrue(result.tools().stream().allMatch(tool -> tool.executablePath() == null));
        assertNull(result.tools().getFirst().executablePath());
    }
}
