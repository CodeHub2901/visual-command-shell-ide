package dev.commandide.worker.execution;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

final class Pty4jTerminalProcessFactoryTest {
    private static final Path BASH = Path.of("/bin/bash");

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
        TerminalProcess process = new Pty4jTerminalProcessFactory().start(
                BASH,
                List.of("--noprofile", "--norc", "-c", "sleep 30"),
                new HashMap<>(System.getenv()),
                Path.of(System.getProperty("java.io.tmpdir")),
                80,
                24);

        process.terminateTree();

        assertFalse(process.isAlive());
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
