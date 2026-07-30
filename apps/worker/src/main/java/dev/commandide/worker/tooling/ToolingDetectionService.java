package dev.commandide.worker.tooling;

import dev.commandide.worker.catalog.ExecutableDiscovery;
import dev.commandide.worker.language.BashLanguageServerLaunch;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Path;
import java.util.List;

public final class ToolingDetectionService {
    private final SystemProfile profile;

    public ToolingDetectionService(SystemProfile profile) {
        this.profile = profile;
    }

    public ToolingProfile detect() {
        return new ToolingProfile(List.of(
                detectBashLanguageServer(),
                detect(
                        "shellcheck",
                        "ShellCheck",
                        "shellcheck",
                        packageGuidance("ShellCheck", "shellcheck")),
                detect(
                        "shfmt",
                        "shfmt",
                        "shfmt",
                        packageGuidance("shfmt", "shfmt"))));
    }

    private ToolStatus detectBashLanguageServer() {
        BashLanguageServerLaunch launch = BashLanguageServerLaunch.resolve(profile).orElse(null);
        return new ToolStatus(
                "bash-language-server",
                "Bash Language Server",
                launch == null ? "missing" : "installed",
                launch == null ? "missing" : launch.source(),
                launch == null ? null : launch.displayPath(),
                launch == null
                        ? "The bundled Bash Language Server is unavailable. Reinstall Command IDE or install bash-language-server from a trusted package source."
                        : launch.source().equals("bundled")
                                ? "Bundled with Command IDE and launched locally through the application runtime."
                                : "Using a trusted Bash Language Server found on PATH.");
    }

    private ToolStatus detect(
            String id,
            String displayName,
            String executable,
            String guidance) {
        Path path = ExecutableDiscovery.find(
                executable, profile.pathEntries(), profile.operatingSystem()).orElse(null);
        return new ToolStatus(
                id,
                displayName,
                path == null ? "missing" : "installed",
                path == null ? "missing" : "system",
                path == null ? null : path.toString(),
                guidance);
    }

    private String packageGuidance(String displayName, String packageName) {
        String family = profile.distro() == null ? "other" : profile.distro().family();
        return switch (family) {
            case "ubuntu" -> "Install " + displayName
                    + " from the trusted Ubuntu package named '" + packageName + "', then refresh detection.";
            case "fedora" -> "Install " + displayName
                    + " from the trusted Fedora package named '" + packageName + "', then refresh detection.";
            default -> "Install " + displayName
                    + " from your operating system's trusted package source, then refresh detection.";
        };
    }
}
