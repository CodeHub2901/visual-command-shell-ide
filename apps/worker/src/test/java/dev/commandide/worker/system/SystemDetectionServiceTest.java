// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.system;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class SystemDetectionServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void detectsSupportedUbuntuAndBash() throws Exception {
        Path osRelease = temporaryDirectory.resolve("os-release");
        Files.writeString(osRelease, """
                ID=ubuntu
                VERSION_ID="24.04"
                PRETTY_NAME="Ubuntu 24.04.3 LTS"
                """);
        Properties properties = properties("Linux", "amd64");
        var service = new SystemDetectionService(
                Map.of("SHELL", "/bin/bash", "PATH", "/usr/local/bin:/usr/bin:/usr/bin"),
                properties,
                osRelease);

        SystemProfile profile = service.detect();

        assertEquals("linux", profile.operatingSystem());
        assertEquals("x86_64", profile.architecture());
        assertEquals("bash", profile.shell().dialect());
        assertEquals("ubuntu", profile.distro().family());
        assertTrue(profile.distro().supported());
        assertEquals(2, profile.pathEntries().size());
    }

    @Test
    void detectsSupportedFedora44() throws Exception {
        Path osRelease = temporaryDirectory.resolve("fedora-release");
        Files.writeString(osRelease, """
                ID=fedora
                VERSION_ID=44
                PRETTY_NAME='Fedora Linux 44 (Workstation Edition)'
                """);
        var service = new SystemDetectionService(
                Map.of("SHELL", "/usr/bin/bash"), properties("Linux", "x86_64"), osRelease);

        DistroTarget distro = service.detect().distro();
        assertEquals("fedora", distro.family());
        assertTrue(distro.supported());
    }

    @Test
    void marksOtherVersionsUnsupportedWithoutDroppingMetadata() throws Exception {
        Path osRelease = temporaryDirectory.resolve("future-release");
        Files.writeString(osRelease, "ID=ubuntu\nVERSION_ID=28.04\nPRETTY_NAME=Future\n");
        var service = new SystemDetectionService(
                Map.of("SHELL", "/bin/zsh"), properties("Linux", "aarch64"), osRelease);

        SystemProfile profile = service.detect();
        assertEquals("arm64", profile.architecture());
        assertEquals("zsh", profile.shell().dialect());
        assertFalse(profile.distro().supported());
        assertEquals("28.04", profile.distro().versionId());
    }

    private static Properties properties(String osName, String architecture) {
        Properties properties = new Properties();
        properties.setProperty("os.name", osName);
        properties.setProperty("os.arch", architecture);
        return properties;
    }
}

