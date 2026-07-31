// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

final class Pty4jTerminalProcessFactoryTest {
    private static final Path BASH = Path.of("/bin/bash");
    private static final Path KILL = Path.of("/bin/kill");

    @Test
    @Timeout(10)
    void runsAnInteractivePtyWithInputOutputAndResize() throws Exception {
        assumeTrue(Files.isExecutable(BASH), "Linux Bash is required for the native PTY integration");
        var environment = new HashMap<>(System.getenv());
        environment.put("TERM", "xterm-256color");
        TerminalProcess process = new Pty4jTerminalProcessFactory().start(
                BASH,
                List.of("--noprofile", "--norc", "-c", "printf ready; read -r value; printf ':%s' \"$value\""),
                environment,
                Path.of(System.getProperty("java.io.tmpdir")),
                80,
                24);

        process.resize(100, 32);
        process.output().write("hello\n".getBytes(StandardCharsets.UTF_8));
        process.output().flush();
        String output = new String(process.input().readAllBytes(), StandardCharsets.UTF_8);

        assertEquals(0, process.waitFor());
        assertTrue(output.contains("ready"));
        assertTrue(output.contains(":hello"));
    }

    @Test
    @Timeout(10)
    void terminatesThePtyProcessTree() throws Exception {
        assumeTrue(Files.isExecutable(BASH), "Linux Bash is required for the native PTY integration");
        assumeTrue(Files.isExecutable(KILL), "POSIX kill is required for process-group cancellation");
        TerminalProcess process = new Pty4jTerminalProcessFactory().start(
                BASH,
                List.of(
                        "--noprofile",
                        "--norc",
                        "-c",
                        "sleep 30 & child=$!; printf 'child=%s\\n' \"$child\"; wait \"$child\""),
                new HashMap<>(System.getenv()),
                Path.of(System.getProperty("java.io.tmpdir")),
                80,
                24);
        String childLine = new BufferedReader(
                new InputStreamReader(process.input(), StandardCharsets.UTF_8)).readLine();
        assertTrue(childLine.startsWith("child="), "PTY did not report its child process");
        long childProcessId = Long.parseLong(childLine.substring("child=".length()).trim());

        process.terminateTree();

        assertFalse(process.isAlive());
        assertFalse(
                ProcessHandle.of(childProcessId).map(ProcessHandle::isAlive).orElse(false),
                "PTY cancellation left its child process running");
    }

    @Test
    @Timeout(10)
    void reportsANativeNonzeroExitStatus() throws Exception {
        assumeTrue(Files.isExecutable(BASH), "Linux Bash is required for the native PTY integration");
        TerminalProcess process = new Pty4jTerminalProcessFactory().start(
                BASH,
                List.of("--noprofile", "--norc", "-c", "printf failed; exit 7"),
                new HashMap<>(System.getenv()),
                Path.of(System.getProperty("java.io.tmpdir")),
                80,
                24);

        String output = new String(process.input().readAllBytes(), StandardCharsets.UTF_8);

        assertEquals(7, process.waitFor());
        assertTrue(output.contains("failed"));
    }
}
