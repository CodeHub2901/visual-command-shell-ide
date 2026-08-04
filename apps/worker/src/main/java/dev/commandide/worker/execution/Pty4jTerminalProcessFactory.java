// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.execution;

import com.pty4j.PtyProcess;
import com.pty4j.PtyProcessBuilder;
import com.pty4j.WinSize;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class Pty4jTerminalProcessFactory implements TerminalProcessFactory {
    private static final Path POSIX_KILL = Path.of("/bin/kill");

    @Override
    public TerminalProcess start(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Path workingDirectory,
            int columns,
            int rows) throws Exception {
        List<String> command = new ArrayList<>(arguments.size() + 1);
        command.add(executable.toAbsolutePath().normalize().toString());
        command.addAll(arguments);
        PtyProcess process = new PtyProcessBuilder(command.toArray(String[]::new))
                .setEnvironment(environment)
                .setDirectory(workingDirectory.toString())
                .setInitialColumns(columns)
                .setInitialRows(rows)
                .setRedirectErrorStream(true)
                .start();
        return new Adapter(process);
    }

    private record Adapter(PtyProcess process) implements TerminalProcess {
        @Override
        public InputStream input() {
            return process.getInputStream();
        }

        @Override
        public OutputStream output() {
            return process.getOutputStream();
        }

        @Override
        public void resize(int columns, int rows) {
            process.setWinSize(new WinSize(columns, rows));
        }

        @Override
        public int waitFor() throws InterruptedException {
            return process.waitFor();
        }

        @Override
        public boolean isAlive() {
            return process.isAlive();
        }

        @Override
        public void terminateTree() throws InterruptedException {
            List<ProcessHandle> descendants = descendants(process);
            terminateDescendantsFromLeaves(descendants);
            // A shell waiting for a terminated child normally reaps it and
            // exits by itself. Preserve that short grace period before
            // signaling the PTY group leader.
            if (process.waitFor(600, TimeUnit.MILLISECONDS)) {
                waitForExit(descendants, 400);
                return;
            }
            boolean signaledProcessGroup = process.isAlive()
                    && signalPosixProcessGroup(process, "-TERM");
            process.destroy();
            if (!process.waitFor(300, TimeUnit.MILLISECONDS)) {
                descendants.forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                process.waitFor(700, TimeUnit.MILLISECONDS);
            }
            if (signaledProcessGroup) signalPosixProcessGroup(process, "-KILL");
            descendants.forEach(handle -> {
                if (handle.isAlive()) handle.destroyForcibly();
            });
            waitForExit(descendants, 700);
        }

        private static void terminateDescendantsFromLeaves(List<ProcessHandle> descendants)
                throws InterruptedException {
            List<ProcessHandle> remaining = new ArrayList<>(descendants);
            while (!remaining.isEmpty()) {
                List<ProcessHandle> leaves = remaining.stream()
                        .filter(candidate -> remaining.stream().noneMatch(other ->
                                other.parent().map(parent -> parent.pid() == candidate.pid()).orElse(false)))
                        .toList();
                if (leaves.isEmpty()) leaves = List.of(remaining.get(remaining.size() - 1));
                leaves.forEach(ProcessHandle::destroy);
                waitForExit(leaves, 400);
                remaining.removeAll(leaves);
            }
        }

        private static void waitForExit(List<ProcessHandle> processes, long timeoutMillis)
                throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
            while (processes.stream().anyMatch(ProcessHandle::isAlive)
                    && System.nanoTime() < deadline) {
                Thread.sleep(20);
            }
        }

        private static List<ProcessHandle> descendants(PtyProcess process) {
            try {
                return process.descendants().toList();
            } catch (UnsupportedOperationException ignored) {
                return List.of();
            }
        }

        private static boolean signalPosixProcessGroup(PtyProcess process, String signal)
                throws InterruptedException {
            if (!Files.isExecutable(POSIX_KILL)) return false;
            long processId = process.pid();
            if (processId <= 0) return false;
            try {
                Process signalProcess = new ProcessBuilder(
                        POSIX_KILL.toString(),
                        signal,
                        "--",
                        "-" + processId)
                        .redirectErrorStream(true)
                        .start();
                if (!signalProcess.waitFor(500, TimeUnit.MILLISECONDS)) {
                    signalProcess.destroyForcibly();
                    signalProcess.waitFor(500, TimeUnit.MILLISECONDS);
                    return false;
                }
                return signalProcess.exitValue() == 0;
            } catch (IOException | UnsupportedOperationException ignored) {
                return false;
            }
        }
    }
}
