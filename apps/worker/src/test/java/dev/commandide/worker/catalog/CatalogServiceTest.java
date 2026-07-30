package dev.commandide.worker.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class CatalogServiceTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void ranksExactCommandNamesBeforeDescriptionMatches() throws Exception {
        CatalogService service = new CatalogService(
                List.of(command("grep", "Search text with patterns"), command("search-help", "Help for grep")),
                "linux",
                "ubuntu",
                List.of());

        CatalogSearchResult result = service.search("grep", 10);

        assertEquals(List.of("grep", "search-help"), result.commands().stream().map(CommandSpec::id).toList());
    }

    @Test
    void discoversExecutablesWithoutRunningThem() throws Exception {
        Path executable = temporaryDirectory.resolve("sample-command");
        Files.writeString(executable, "not a real executable");
        executable.toFile().setExecutable(true);
        CatalogService service = new CatalogService(
                List.of(command("sample-command", "Test command")),
                "linux",
                "ubuntu",
                List.of(temporaryDirectory.toString()));

        CommandSpec result = service.search("", 10).commands().get(0);

        assertEquals("installed", result.availability());
        assertEquals(executable.toAbsolutePath().normalize().toString(), result.executablePath());
    }

    @Test
    void marksCommandsForAnotherPlatformAsUnknown() {
        CatalogCommand command = new CatalogCommand(
                "unix-only", "unix-only", List.of("--version"), "unix-only", "Unix command", "Other",
                List.of("linux"), List.of("ubuntu"), List.of(), List.of("read-only"), "never",
                List.of(), List.of("unix-only"), manual());
        CatalogService service = new CatalogService(List.of(command), "windows", "other", List.of());

        CommandSpec result = service.search("", 10).commands().get(0);

        assertEquals("unknown", result.availability());
        assertNull(result.executablePath());
    }

    @Test
    void rejectsUnsupportedCatalogSchemaVersions() {
        CatalogDocument document = new CatalogDocument("2.0.0", List.of(command("sample", "Sample")));

        assertThrows(IllegalArgumentException.class,
                () -> new CatalogService(document, "linux", "ubuntu", List.of()));
    }

    @Test
    void rejectsConflictsThatReferenceUnknownOptions() {
        CatalogCommand.CommandOption option = new CatalogCommand.CommandOption(
                "all", List.of("-a"), "Show all.", false, null, false, true, List.of("missing"));
        CatalogCommand invalid = new CatalogCommand(
                "sample", "sample", List.of("--version"), "sample", "Sample", "Other", List.of("linux"),
                List.of("ubuntu"), List.of(), List.of("read-only"), "combine-boolean",
                List.of(option), List.of("sample"), manual());

        assertThrows(IllegalArgumentException.class,
                () -> new CatalogService(List.of(invalid), "linux", "ubuntu", List.of()));
    }

    @Test
    void rejectsDuplicateOrMalformedOptionFlags() {
        CatalogCommand.CommandOption first = new CatalogCommand.CommandOption(
                "first", List.of("-a"), "First flag.", false, null, false, true, List.of());
        CatalogCommand.CommandOption duplicate = new CatalogCommand.CommandOption(
                "duplicate", List.of("-a"), "Duplicate flag.", false, null, false, true, List.of());
        CatalogCommand invalid = new CatalogCommand(
                "sample", "sample", List.of("--version"), "sample", "Sample", "Other", List.of("linux"),
                List.of("ubuntu"), List.of(), List.of("read-only"), "combine-boolean",
                List.of(first, duplicate), List.of("sample"), manual());

        assertThrows(IllegalArgumentException.class,
                () -> new CatalogService(List.of(invalid), "linux", "ubuntu", List.of()));
    }

    @Test
    void appliesExactUbuntuAndFedoraCompatibilityOverlays() {
        CatalogService ubuntu24 = bundled("ubuntu", "24.04");
        CatalogService ubuntu26 = bundled("ubuntu", "26.04");
        CatalogService fedora44 = bundled("fedora", "44");
        CatalogService unknown = bundled("ubuntu", "25.10");

        assertEquals("supported", ubuntu24.findById("apt").orElseThrow().compatibility().status());
        assertTrue(ubuntu24.findById("apt").orElseThrow().compatibility().note().contains("24.04"));
        assertEquals("supported", ubuntu26.findById("apt").orElseThrow().compatibility().status());
        assertEquals("unsupported", ubuntu26.findById("dnf").orElseThrow().compatibility().status());
        assertEquals("limited", fedora44.findById("dnf").orElseThrow().compatibility().status());
        assertTrue(fedora44.findById("dnf").orElseThrow().compatibility().note().contains("DNF5"));
        assertEquals("supported", ubuntu24.findById("lsblk").orElseThrow().compatibility().status());
        assertTrue(ubuntu24.findById("lsblk").orElseThrow().compatibility().note().contains("24.04"));
        assertTrue(ubuntu24.findById("lsblk").orElseThrow().options().stream()
                .noneMatch(option -> option.id().equals("filter")));
        assertEquals("supported", ubuntu26.findById("mount").orElseThrow().compatibility().status());
        assertTrue(ubuntu26.findById("mount").orElseThrow().compatibility().note().contains("26.04"));
        assertTrue(ubuntu26.findById("lsblk").orElseThrow().options().stream()
                .anyMatch(option -> option.id().equals("filter")));
        assertEquals("supported", fedora44.findById("ping").orElseThrow().compatibility().status());
        assertTrue(fedora44.findById("ping").orElseThrow().compatibility().note().contains("Fedora 44"));
        assertTrue(fedora44.findById("lsblk").orElseThrow().options().stream()
                .anyMatch(option -> option.id().equals("filter")));
        assertEquals("supported", ubuntu24.findById("findmnt").orElseThrow().compatibility().status());
        assertEquals("supported", fedora44.findById("make").orElseThrow().compatibility().status());
        assertEquals("unknown", unknown.findById("ls").orElseThrow().compatibility().status());
    }

    @Test
    void bundledCatalogCoversTheLinuxFoundationFamiliesAndProductCategories() {
        CatalogService service = bundled("ubuntu", "24.04");

        CatalogSearchResult result = service.search("", 100);
        Set<String> ids = result.commands().stream().map(CommandSpec::id)
                .collect(java.util.stream.Collectors.toSet());
        Set<String> categories = result.commands().stream().map(CommandSpec::category)
                .collect(java.util.stream.Collectors.toSet());

        assertEquals(62, result.total());
        assertEquals(62, result.commands().size());
        assertTrue(ids.containsAll(Set.of(
                "mv", "touch", "head", "tail", "wc", "sort",
                "free", "uptime", "lsblk", "mount", "chown", "whoami",
                "ping", "git", "env", "gzip", "sudo",
                "pwd", "ln", "readlink", "realpath", "basename", "dirname",
                "cut", "tr", "uniq", "tee", "xargs", "locate",
                "pgrep", "pkill", "top", "hostnamectl", "timedatectl", "loginctl",
                "blkid", "findmnt", "umount", "wget", "xz", "make")));
        assertTrue(categories.containsAll(Set.of(
                "Files", "Text", "Search", "Processes", "System", "Networking",
                "Storage", "Packages", "Permissions", "Users", "Development", "Other")));
        assertEquals("Search", service.findById("find").orElseThrow().category());
        assertEquals(List.of("system-change", "privilege"),
                service.findById("umount").orElseThrow().riskTags());
        assertEquals("combine-boolean", service.findById("uniq").orElseThrow().shortOptionPolicy());
        assertTrue(service.findById("cut").orElseThrow().options().stream()
                .filter(option -> option.id().equals("delimiter"))
                .allMatch(option -> option.takesValue() && !option.combinable()));
    }

    @Test
    void rejectsOverlayOverridesForUnknownCommands() {
        CatalogOverlay invalid = new CatalogOverlay(
                "1.1.0", "ubuntu-test", "ubuntu", List.of("24.04"),
                List.of(new CatalogOverlay.CommandOverride(
                        "missing", "supported", "Invalid reference.", List.of())));

        assertThrows(IllegalArgumentException.class, () -> new CatalogService(
                new CatalogDocument("1.2.0", List.of(command("sample", "Sample"))),
                "linux", "ubuntu", "24.04", List.of(), List.of(invalid)));
    }

    @Test
    void rejectsOverlayOptionReferencesThatDoNotExistInTheCommand() {
        CatalogOverlay invalid = new CatalogOverlay(
                "1.1.0", "ubuntu-test", "ubuntu", List.of("24.04"),
                List.of(new CatalogOverlay.CommandOverride(
                        "sample", "supported", "Invalid option reference.", List.of("missing"))));

        assertThrows(IllegalArgumentException.class, () -> new CatalogService(
                new CatalogDocument("1.2.0", List.of(command("sample", "Sample"))),
                "linux", "ubuntu", "24.04", List.of(), List.of(invalid)));
    }

    private CatalogService bundled(String family, String version) {
        return new CatalogService(new SystemProfile(
                "linux", "x86_64", new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget(family, version, family + " " + version, family, true), List.of()));
    }

    private CatalogCommand command(String name, String summary) {
        return new CatalogCommand(
                name, name, List.of("--version"), name, summary, "Other", List.of("linux"), List.of("ubuntu"),
                List.of(), List.of("read-only"), "never", List.of(), List.of(name), manual());
    }

    private CatalogCommand.CommandManual manual() {
        return new CatalogCommand.CommandManual(
                "command [OPTION]", List.of(new CatalogCommand.ManualSection("Description", "Test command.")));
    }
}
