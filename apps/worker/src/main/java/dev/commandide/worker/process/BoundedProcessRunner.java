// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.process;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public final class BoundedProcessRunner implements ProcessRunner {
    private static final int MAX_OUTPUT_BYTES = 512_000;
    private static final int MAX_INPUT_BYTES = 1_000_000;
    private static final Set<String> SAFE_INHERITED_ENVIRONMENT = Set.of(
            "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC",
            "HOME", "USERPROFILE", "USER", "USERNAME", "LOGNAME",
            "LANG", "LC_ALL", "LC_CTYPE", "TMP", "TEMP", "TMPDIR",
            "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME");

    @Override
    public ProcessResult run(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Duration timeout) throws Exception {
        return runWithInput(executable, arguments, environment, timeout, "");
    }

    @Override
    public ProcessResult runWithInput(
            Path executable,
            List<String> arguments,
            Map<String, String> environment,
            Duration timeout,
            String input) throws Exception {
        byte[] inputBytes = input == null ? new byte[0] : input.getBytes(StandardCharsets.UTF_8);
        if (inputBytes.length > MAX_INPUT_BYTES) {
            throw new IllegalArgumentException("Process input exceeds the bounded limit");
        }
        List<String> command = new ArrayList<>(arguments.size() + 1);
        command.add(executable.toAbsolutePath().normalize().toString());
        command.addAll(arguments);
        ProcessBuilder builder = new ProcessBuilder(command).redirectErrorStream(true);
        Map<String, String> childEnvironment = builder.environment();
        Map<String, String> inherited = System.getenv();
        childEnvironment.clear();
        inherited.forEach((name, value) -> {
            String upper = name.toUpperCase(java.util.Locale.ROOT);
            if (SAFE_INHERITED_ENVIRONMENT.contains(upper) || upper.startsWith("LC_")) {
                childEnvironment.put(name, value);
            }
        });
        childEnvironment.putAll(environment);
        Process process = builder.start();

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        AtomicBoolean truncated = new AtomicBoolean(false);
        Thread reader = Thread.ofVirtual().name("bounded-process-output-reader").start(
                () -> copyBounded(process.getInputStream(), output, truncated));

        try (OutputStream stdin = process.getOutputStream()) {
            stdin.write(inputBytes);
        } catch (IOException exception) {
            terminateTree(process);
            throw exception;
        }

        boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
        if (!finished) terminateTree(process);
        reader.join(1_000);
        if (reader.isAlive()) reader.interrupt();
        return new ProcessResult(
                finished ? process.exitValue() : -1,
                output.toString(StandardCharsets.UTF_8),
                !finished,
                truncated.get());
    }

    private static void copyBounded(
            InputStream input,
            ByteArrayOutputStream output,
            AtomicBoolean truncated) {
        byte[] buffer = new byte[8192];
        try (input) {
            int read;
            while ((read = input.read(buffer)) != -1) {
                int remaining = MAX_OUTPUT_BYTES - output.size();
                if (remaining > 0) output.write(buffer, 0, Math.min(read, remaining));
                if (read > remaining) truncated.set(true);
            }
        } catch (IOException ignored) {
            // A forced timeout closes the stream while the reader is active.
        }
    }

    private static void terminateTree(Process process) throws InterruptedException {
        process.descendants().forEach(ProcessHandle::destroy);
        process.destroy();
        if (!process.waitFor(200, TimeUnit.MILLISECONDS)) {
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
            process.waitFor(500, TimeUnit.MILLISECONDS);
        }
    }
}
