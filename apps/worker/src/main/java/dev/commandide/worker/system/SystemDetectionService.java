package dev.commandide.worker.system;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import java.util.regex.Pattern;

public final class SystemDetectionService {
    private static final Pattern OS_RELEASE_KEY = Pattern.compile("[A-Z][A-Z0-9_]*");
    private static final int MAX_PATH_ENTRIES = 512;

    private final Map<String, String> environment;
    private final Properties systemProperties;
    private final Path osReleasePath;

    public SystemDetectionService() {
        this(System.getenv(), System.getProperties(), Path.of("/etc/os-release"));
    }

    SystemDetectionService(
            Map<String, String> environment,
            Properties systemProperties,
            Path osReleasePath) {
        this.environment = Map.copyOf(environment);
        this.systemProperties = new Properties();
        this.systemProperties.putAll(systemProperties);
        this.osReleasePath = osReleasePath;
    }

    public SystemProfile detect() {
        String operatingSystem = normalizeOperatingSystem(systemProperties.getProperty("os.name", ""));
        String architecture = normalizeArchitecture(systemProperties.getProperty("os.arch", "unknown"));
        ShellEnvironment shell = detectShell();
        DistroTarget distro = operatingSystem.equals("linux") ? detectDistro() : null;
        return new SystemProfile(operatingSystem, architecture, shell, distro, pathEntries(operatingSystem));
    }

    private ShellEnvironment detectShell() {
        String executable = environment.getOrDefault("SHELL", "").trim();
        if (executable.isEmpty()) {
            executable = environment.getOrDefault("ComSpec", "").trim();
        }
        String lower = executable.toLowerCase(Locale.ROOT).replace('\\', '/');
        String name = lower.substring(lower.lastIndexOf('/') + 1);
        String dialect = switch (name) {
            case "bash", "bash.exe" -> "bash";
            case "zsh", "zsh.exe" -> "zsh";
            case "pwsh", "pwsh.exe", "powershell", "powershell.exe" -> "powershell";
            default -> "unknown";
        };
        return new ShellEnvironment(executable, dialect);
    }

    private DistroTarget detectDistro() {
        if (!Files.isRegularFile(osReleasePath)) {
            return null;
        }
        try {
            Map<String, String> values = parseOsRelease(Files.readAllLines(osReleasePath, StandardCharsets.UTF_8));
            String id = values.getOrDefault("ID", "unknown").toLowerCase(Locale.ROOT);
            String versionId = values.getOrDefault("VERSION_ID", "unknown");
            String prettyName = values.getOrDefault("PRETTY_NAME", id + " " + versionId);
            String family = distroFamily(id, values.getOrDefault("ID_LIKE", ""));
            boolean supported = (family.equals("ubuntu")
                    && (versionId.equals("24.04") || versionId.equals("26.04")))
                    || (family.equals("fedora") && versionId.equals("44"));
            return new DistroTarget(id, versionId, prettyName, family, supported);
        } catch (IOException exception) {
            System.err.println("Unable to read /etc/os-release: " + exception.getMessage());
            return null;
        }
    }

    static Map<String, String> parseOsRelease(List<String> lines) {
        var values = new java.util.LinkedHashMap<String, String>();
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            int separator = line.indexOf('=');
            if (separator <= 0) {
                continue;
            }
            String key = line.substring(0, separator).trim();
            if (!OS_RELEASE_KEY.matcher(key).matches()) {
                continue;
            }
            values.put(key, unquote(line.substring(separator + 1).trim()));
        }
        return Map.copyOf(values);
    }

    private static String unquote(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                value = value.substring(1, value.length() - 1);
            }
        }
        return value
                .replace("\\\"", "\"")
                .replace("\\'", "'")
                .replace("\\\\", "\\");
    }

    private List<String> pathEntries(String operatingSystem) {
        String rawPath = environment.getOrDefault("PATH", environment.getOrDefault("Path", ""));
        String separator = operatingSystem.equals("windows") ? ";" : ":";
        String[] entries = rawPath.split(Pattern.quote(separator), -1);
        List<String> result = new ArrayList<>();
        for (String entry : entries) {
            String trimmed = entry.trim();
            if (!trimmed.isEmpty() && !result.contains(trimmed)) {
                result.add(trimmed);
                if (result.size() == MAX_PATH_ENTRIES) {
                    break;
                }
            }
        }
        return List.copyOf(result);
    }

    private static String distroFamily(String id, String idLike) {
        String combined = id + " " + idLike.toLowerCase(Locale.ROOT);
        if (combined.contains("ubuntu")) {
            return "ubuntu";
        }
        if (combined.contains("fedora")) {
            return "fedora";
        }
        return "other";
    }

    private static String normalizeOperatingSystem(String value) {
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.contains("linux")) return "linux";
        if (lower.contains("mac") || lower.contains("darwin")) return "macos";
        if (lower.contains("windows")) return "windows";
        return "other";
    }

    private static String normalizeArchitecture(String value) {
        return switch (value.toLowerCase(Locale.ROOT)) {
            case "amd64", "x86_64" -> "x86_64";
            case "aarch64", "arm64" -> "arm64";
            default -> value.toLowerCase(Locale.ROOT);
        };
    }
}
