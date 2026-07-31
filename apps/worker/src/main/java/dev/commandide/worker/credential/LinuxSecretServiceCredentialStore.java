// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.credential;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

final class LinuxSecretServiceCredentialStore implements SecureCredentialStore {
    private static final int MAX_SECRET_BYTES = 16_384;
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final Set<String> ALLOWED_ENVIRONMENT = Set.of(
            "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE",
            "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY");
    private final Path executable;

    LinuxSecretServiceCredentialStore(Path executable) {
        this.executable = executable.toAbsolutePath().normalize();
    }

    @Override
    public boolean available() {
        return true;
    }

    @Override
    public String backend() {
        return "linux-secret-service";
    }

    @Override
    public java.util.Optional<char[]> get(String provider) throws Exception {
        Result result = run(List.of(
                "lookup", "service", "dev.commandide", "provider", provider), null);
        if (result.exitCode() != 0) return java.util.Optional.empty();
        byte[] output = result.stdout();
        try {
            int length = output.length;
            while (length > 0 && (output[length - 1] == '\n' || output[length - 1] == '\r')) {
                length--;
            }
            if (length == 0) return java.util.Optional.empty();
            CharBuffer decoded = StandardCharsets.UTF_8.decode(ByteBuffer.wrap(output, 0, length));
            char[] value = new char[decoded.remaining()];
            decoded.get(value);
            return java.util.Optional.of(value);
        } finally {
            result.clear();
        }
    }

    @Override
    public void put(String provider, char[] credential) throws Exception {
        Result result = run(List.of(
                "store", "--label=Command IDE",
                "service", "dev.commandide", "provider", provider), credential);
        try {
            if (result.exitCode() != 0) {
                throw new IllegalStateException("Linux Secret Service write failed");
            }
        } finally {
            result.clear();
        }
    }

    @Override
    public boolean delete(String provider) throws Exception {
        Result result = run(List.of(
                "clear", "service", "dev.commandide", "provider", provider), null);
        try {
            return result.exitCode() == 0;
        } finally {
            result.clear();
        }
    }

    private Result run(List<String> arguments, char[] input) throws Exception {
        List<String> command = new ArrayList<>(arguments.size() + 1);
        command.add(executable.toString());
        command.addAll(arguments);
        ProcessBuilder builder = new ProcessBuilder(command);
        Map<String, String> environment = builder.environment();
        Map<String, String> inherited = System.getenv();
        environment.clear();
        inherited.forEach((name, value) -> {
            if (ALLOWED_ENVIRONMENT.contains(name.toUpperCase(java.util.Locale.ROOT))
                    || name.toUpperCase(java.util.Locale.ROOT).startsWith("LC_")) {
                environment.put(name, value);
            }
        });
        Process process = builder.start();
        AtomicReference<byte[]> stdout = new AtomicReference<>(new byte[0]);
        AtomicReference<byte[]> stderr = new AtomicReference<>(new byte[0]);
        Thread stdoutReader = Thread.ofVirtual().start(
                () -> stdout.set(readBounded(process.getInputStream())));
        Thread stderrReader = Thread.ofVirtual().start(
                () -> stderr.set(readBounded(process.getErrorStream())));
        try {
            try (OutputStream stream = process.getOutputStream()) {
                if (input != null) writeUtf8(stream, input);
            }
            if (!process.waitFor(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
                throw new IllegalStateException("Linux Secret Service timed out");
            }
            stdoutReader.join(1000);
            stderrReader.join(1000);
            return new Result(process.exitValue(), stdout.get(), stderr.get());
        } catch (Exception failure) {
            Arrays.fill(stdout.get(), (byte) 0);
            Arrays.fill(stderr.get(), (byte) 0);
            throw failure;
        }
    }

    private void writeUtf8(OutputStream output, char[] input) throws Exception {
        ByteBuffer buffer = StandardCharsets.UTF_8.encode(CharBuffer.wrap(input));
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);
        try {
            output.write(bytes);
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    private byte[] readBounded(InputStream input) {
        try (input) {
            byte[] result = input.readNBytes(MAX_SECRET_BYTES + 1);
            if (result.length > MAX_SECRET_BYTES) {
                Arrays.fill(result, (byte) 0);
                return new byte[0];
            }
            return result;
        } catch (Exception ignored) {
            return new byte[0];
        }
    }

    private record Result(int exitCode, byte[] stdout, byte[] stderr) {
        void clear() {
            Arrays.fill(stdout, (byte) 0);
            Arrays.fill(stderr, (byte) 0);
        }
    }
}

