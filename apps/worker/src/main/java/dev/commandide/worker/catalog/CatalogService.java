package dev.commandide.worker.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.commandide.worker.system.SystemProfile;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

public final class CatalogService {
    private static final String SUPPORTED_CATALOG_VERSION = "1.2.0";
    private static final String SUPPORTED_INDEX_VERSION = "1.0.0";
    private static final String SUPPORTED_OVERLAY_VERSION = "1.1.0";
    private static final String CATALOG_INDEX_RESOURCE = "/catalog/v1/index.json";
    private static final Set<String> CATEGORIES = Set.of(
            "Files", "Text", "Search", "Processes", "System", "Networking",
            "Storage", "Packages", "Permissions", "Users", "Development", "Other");
    private static final Set<String> PLATFORMS = Set.of("linux", "macos", "windows");
    private static final Set<String> DISTRO_FAMILIES = Set.of("ubuntu", "fedora", "other");
    private static final Set<String> RISK_TAGS = Set.of(
            "read-only", "filesystem-write", "network", "process-signal", "package-query",
            "system-change", "package-change", "privilege", "destructive");

    private final List<CatalogCommand> commands;
    private final String catalogVersion;
    private final String operatingSystem;
    private final String distroFamily;
    private final String distroVersion;
    private final List<String> pathEntries;
    private final List<CatalogOverlay> overlays;

    public CatalogService(SystemProfile systemProfile) {
        this(
                loadBundledCatalog(),
                systemProfile.operatingSystem(),
                systemProfile.distro() == null ? "other" : systemProfile.distro().family(),
                systemProfile.distro() == null ? null : systemProfile.distro().versionId(),
                systemProfile.pathEntries(),
                loadBundledOverlays());
    }

    CatalogService(
            List<CatalogCommand> commands,
            String operatingSystem,
            String distroFamily,
            List<String> pathEntries) {
        this(new CatalogDocument(SUPPORTED_CATALOG_VERSION, commands), operatingSystem, distroFamily, pathEntries);
    }

    CatalogService(
        CatalogDocument document,
        String operatingSystem,
        String distroFamily,
        List<String> pathEntries) {
        this(document, operatingSystem, distroFamily, null, pathEntries, List.of());
    }

    CatalogService(
            CatalogDocument document,
            String operatingSystem,
            String distroFamily,
            String distroVersion,
            List<String> pathEntries,
            List<CatalogOverlay> overlays) {
        validate(document);
        validateOverlays(overlays, document.commands());
        this.commands = List.copyOf(document.commands());
        this.catalogVersion = document.schemaVersion();
        this.operatingSystem = operatingSystem;
        this.distroFamily = distroFamily;
        this.distroVersion = distroVersion;
        this.pathEntries = List.copyOf(pathEntries);
        this.overlays = List.copyOf(overlays);
    }

    public CatalogSearchResult search(String rawQuery, int limit) {
        String query = rawQuery.strip().toLowerCase(Locale.ROOT);
        List<ScoredCommand> matches = commands.stream()
                .map(command -> new ScoredCommand(command, score(command, query)))
                .filter(match -> match.score() >= 0)
                .sorted(Comparator.comparingInt(ScoredCommand::score)
                        .thenComparing(match -> match.command().displayName()))
                .toList();
        List<CommandSpec> results = matches.stream()
                .limit(limit)
                .map(match -> enrich(match.command()))
                .toList();
        return new CatalogSearchResult(catalogVersion, matches.size(), results);
    }

    public Optional<CommandSpec> findById(String commandId) {
        return commands.stream()
                .filter(command -> command.id().equals(commandId))
                .findFirst()
                .map(this::enrich);
    }

    public Optional<CommandSpec> findByExecutable(String executable) {
        return commands.stream()
                .filter(command -> command.executable().equals(executable))
                .findFirst()
                .map(this::enrich);
    }

    public Optional<Path> resolveExecutable(String executable) {
        return ExecutableDiscovery.find(executable, pathEntries, operatingSystem);
    }

    private CommandSpec enrich(CatalogCommand command) {
        CommandCompatibility compatibility = compatibility(command);
        CatalogOverlay.CommandOverride override = commandOverride(command.id());
        boolean applicable = !compatibility.status().equals("unsupported")
                && command.platforms().contains(operatingSystem)
                && (!operatingSystem.equals("linux") || command.distroFamilies().contains(distroFamily));
        Path path = applicable
                ? ExecutableDiscovery.find(command.executable(), pathEntries, operatingSystem).orElse(null)
                : null;
        String availability = !applicable ? "unknown" : path == null ? "missing" : "installed";
        List<CatalogCommand.CommandOption> availableOptions = override == null
                ? command.options()
                : command.options().stream()
                        .filter(option -> !override.unavailableOptionIds().contains(option.id()))
                        .toList();
        return new CommandSpec(
                command.id(),
                command.executable(),
                command.versionProbeArguments(),
                command.displayName(),
                command.summary(),
                command.category(),
                command.platforms(),
                command.distroFamilies(),
                command.arguments(),
                command.riskTags(),
                command.shortOptionPolicy(),
                availability,
                path == null ? null : path.toString(),
                compatibility,
                availableOptions,
                command.examples(),
                command.manual());
    }

    private CommandCompatibility compatibility(CatalogCommand command) {
        String target = operatingSystem.equals("linux")
                ? distroFamily + (distroVersion == null ? "" : " " + distroVersion)
                : operatingSystem;
        if (!command.platforms().contains(operatingSystem)) {
            return new CommandCompatibility("unsupported", target, "The command pack does not target this operating system.");
        }
        if (!operatingSystem.equals("linux")) {
            return new CommandCompatibility("supported", target, "The command pack includes this operating system.");
        }
        if (!command.distroFamilies().contains(distroFamily)) {
            return new CommandCompatibility("unsupported", target, "The command pack does not target this Linux distribution family.");
        }
        if (distroVersion == null) {
            return new CommandCompatibility("unknown", target, "The Linux version could not be matched to a tested overlay.");
        }
        CatalogOverlay overlay = overlays.stream()
                .filter(candidate -> candidate.distroFamily().equals(distroFamily)
                        && candidate.versions().contains(distroVersion))
                .findFirst()
                .orElse(null);
        if (overlay == null) {
            return new CommandCompatibility("unknown", target, "No tested catalog overlay exists for this Linux version.");
        }
        CatalogOverlay.CommandOverride override = commandOverride(command.id());
        if (override != null) {
            return new CommandCompatibility(override.status(), target, override.note());
        }
        return new CommandCompatibility(
                "supported", target, "Curated common syntax is covered by the " + overlay.id() + " overlay.");
    }

    private CatalogOverlay.CommandOverride commandOverride(String commandId) {
        if (!operatingSystem.equals("linux") || distroVersion == null) {
            return null;
        }
        return overlays.stream()
                .filter(candidate -> candidate.distroFamily().equals(distroFamily)
                        && candidate.versions().contains(distroVersion))
                .flatMap(candidate -> candidate.commands().stream())
                .filter(candidate -> candidate.commandId().equals(commandId))
                .findFirst()
                .orElse(null);
    }

    private int score(CatalogCommand command, String query) {
        if (query.isEmpty()) {
            return 10;
        }
        String executable = command.executable().toLowerCase(Locale.ROOT);
        String name = command.displayName().toLowerCase(Locale.ROOT);
        String summary = command.summary().toLowerCase(Locale.ROOT);
        String category = command.category().toLowerCase(Locale.ROOT);
        if (executable.equals(query) || name.equals(query)) return 0;
        if (executable.startsWith(query) || name.startsWith(query)) return 1;
        if (executable.contains(query) || name.contains(query)) return 2;
        if (summary.contains(query)) return 3;
        if (category.contains(query)) return 4;
        return -1;
    }

    private static CatalogDocument loadBundledCatalog() {
        CatalogIndex index = loadIndex();
        if (index == null || !SUPPORTED_INDEX_VERSION.equals(index.schemaVersion())
                || index.packs() == null || index.packs().isEmpty() || index.packs().size() > 100) {
            throw new IllegalStateException("Bundled catalog index is invalid");
        }
        List<CatalogCommand> merged = new java.util.ArrayList<>();
        for (String pack : index.packs()) {
            if (pack == null || !pack.matches("catalog/v1/[a-z0-9][a-z0-9._/-]*\\.json")
                    || pack.contains("..")) {
                throw new IllegalStateException("Bundled catalog index contains an invalid pack path");
            }
            CatalogDocument document = readResource("/" + pack, CatalogDocument.class);
            validate(document);
            merged.addAll(document.commands());
        }
        CatalogDocument document = new CatalogDocument(SUPPORTED_CATALOG_VERSION, List.copyOf(merged));
        validate(document);
        return document;
    }

    private static List<CatalogOverlay> loadBundledOverlays() {
        CatalogIndex index = loadIndex();
        if (index.overlays() == null || index.overlays().isEmpty() || index.overlays().size() > 100) {
            throw new IllegalStateException("Bundled catalog overlay index is invalid");
        }
        List<CatalogOverlay> loaded = new java.util.ArrayList<>();
        for (String overlay : index.overlays()) {
            if (!validResourcePath(overlay)) {
                throw new IllegalStateException("Bundled catalog index contains an invalid overlay path");
            }
            loaded.add(readResource("/" + overlay, CatalogOverlay.class));
        }
        return List.copyOf(loaded);
    }

    private static CatalogIndex loadIndex() {
        CatalogIndex index = readResource(CATALOG_INDEX_RESOURCE, CatalogIndex.class);
        if (index == null || !SUPPORTED_INDEX_VERSION.equals(index.schemaVersion())
                || index.packs() == null || index.packs().isEmpty() || index.packs().size() > 100) {
            throw new IllegalStateException("Bundled catalog index is invalid");
        }
        return index;
    }

    private static boolean validResourcePath(String resource) {
        return resource != null && resource.matches("catalog/v1/[a-z0-9][a-z0-9._/-]*\\.json")
                && !resource.contains("..");
    }

    private static <T> T readResource(String resource, Class<T> type) {
        try (InputStream input = CatalogService.class.getResourceAsStream(resource)) {
            if (input == null) {
                throw new IllegalStateException("Bundled catalog resource is missing: " + resource);
            }
            return new ObjectMapper().readValue(input, type);
        } catch (IOException exception) {
            throw new IllegalStateException("Bundled catalog resource is invalid: " + resource, exception);
        }
    }

    private static void validate(CatalogDocument document) {
        if (document == null || !SUPPORTED_CATALOG_VERSION.equals(document.schemaVersion())) {
            throw new IllegalArgumentException("Unsupported catalog schema version");
        }
        if (document.commands() == null || document.commands().isEmpty()) {
            throw new IllegalArgumentException("Catalog must contain commands");
        }
        Set<String> commandIds = new HashSet<>();
        for (CatalogCommand command : document.commands()) {
            if (command == null || blank(command.id()) || blank(command.executable())
                    || !command.id().matches("[a-z0-9][a-z0-9._-]*")
                    || !command.executable().matches("[A-Za-z0-9][A-Za-z0-9._+-]*")
                    || blank(command.displayName()) || blank(command.summary())
                    || !CATEGORIES.contains(command.category())
                    || command.versionProbeArguments() == null || command.versionProbeArguments().isEmpty()
                    || command.versionProbeArguments().size() > 4
                    || command.versionProbeArguments().stream().anyMatch(CatalogService::blank)
                    || command.platforms() == null || command.platforms().isEmpty()
                    || !PLATFORMS.containsAll(command.platforms())
                    || command.distroFamilies() == null || !DISTRO_FAMILIES.containsAll(command.distroFamilies())
                    || command.arguments() == null
                    || command.riskTags() == null || command.riskTags().isEmpty()
                    || !RISK_TAGS.containsAll(command.riskTags()) || command.options() == null
                    || command.examples() == null || command.examples().isEmpty()
                    || command.examples().stream().anyMatch(CatalogService::blank)
                    || command.manual() == null || blank(command.manual().synopsis())
                    || command.manual().sections() == null || command.manual().sections().isEmpty()
                    || command.manual().sections().stream().anyMatch(section ->
                    section == null || blank(section.heading()) || blank(section.body()))
                    || !Set.of("never", "combine-boolean").contains(command.shortOptionPolicy())) {
                throw new IllegalArgumentException("Invalid catalog command metadata");
            }
            if (!commandIds.add(command.id())) {
                throw new IllegalArgumentException("Duplicate command id: " + command.id());
            }
            validateOptions(command);
            validateArguments(command);
        }
    }

    private static void validateOverlays(List<CatalogOverlay> overlays, List<CatalogCommand> commands) {
        if (overlays == null || overlays.size() > 100) {
            throw new IllegalArgumentException("Invalid catalog overlays");
        }
        Set<String> commandIds = commands.stream().map(CatalogCommand::id).collect(java.util.stream.Collectors.toSet());
        Set<String> overlayIds = new HashSet<>();
        Set<String> targets = new HashSet<>();
        for (CatalogOverlay overlay : overlays) {
            if (overlay == null || !SUPPORTED_OVERLAY_VERSION.equals(overlay.schemaVersion())
                    || blank(overlay.id()) || !overlayIds.add(overlay.id())
                    || !Set.of("ubuntu", "fedora").contains(overlay.distroFamily())
                    || overlay.versions() == null || overlay.versions().isEmpty()
                    || overlay.commands() == null) {
                throw new IllegalArgumentException("Invalid catalog overlay");
            }
            for (String version : overlay.versions()) {
                if (blank(version) || !version.matches("[0-9]+(?:\\.[0-9]+)*")
                        || !targets.add(overlay.distroFamily() + ":" + version)) {
                    throw new IllegalArgumentException("Duplicate or invalid catalog overlay target");
                }
            }
            Set<String> overridden = new HashSet<>();
            for (CatalogOverlay.CommandOverride command : overlay.commands()) {
                if (command == null || !commandIds.contains(command.commandId())
                        || !overridden.add(command.commandId())
                        || !Set.of("supported", "limited", "unsupported").contains(command.status())
                        || blank(command.note()) || command.note().length() > 1000
                        || command.unavailableOptionIds() == null
                        || command.unavailableOptionIds().size() > 100
                        || command.unavailableOptionIds().stream().anyMatch(CatalogService::blank)
                        || command.unavailableOptionIds().size()
                        != new HashSet<>(command.unavailableOptionIds()).size()) {
                    throw new IllegalArgumentException("Invalid catalog overlay command override");
                }
                Set<String> optionIds = commands.stream()
                        .filter(candidate -> candidate.id().equals(command.commandId()))
                        .findFirst().orElseThrow().options().stream()
                        .map(CatalogCommand.CommandOption::id)
                        .collect(java.util.stream.Collectors.toSet());
                if (!optionIds.containsAll(command.unavailableOptionIds())) {
                    throw new IllegalArgumentException("Unknown unavailable option in catalog overlay");
                }
            }
        }
    }

    private static void validateOptions(CatalogCommand command) {
        Set<String> optionIds = new HashSet<>();
        Set<String> optionFlags = new HashSet<>();
        for (CatalogCommand.CommandOption option : command.options()) {
            if (option == null || blank(option.id()) || option.flags() == null || option.flags().isEmpty()
                    || blank(option.description())
                    || option.flags().stream().anyMatch(flag -> blank(flag)
                    || flag.length() > 64 || !flag.startsWith("-")
                    || flag.chars().anyMatch(character ->
                    Character.isWhitespace(character) || Character.isISOControl(character)))
                    || option.flags().stream().anyMatch(flag -> !optionFlags.add(flag))
                    || option.takesValue() != (option.valueName() != null)
                    || !optionIds.add(option.id())) {
                throw new IllegalArgumentException("Invalid option metadata for " + command.id());
            }
            if (option.combinable()
                    && (!command.shortOptionPolicy().equals("combine-boolean")
                    || option.takesValue()
                    || option.flags().stream().noneMatch(CatalogService::isSingleShortFlag))) {
                throw new IllegalArgumentException("Invalid combinable option for " + command.id());
            }
        }
        for (CatalogCommand.CommandOption option : command.options()) {
            if (!optionIds.containsAll(option.conflictsWith())) {
                throw new IllegalArgumentException("Unknown option conflict for " + command.id());
            }
        }
    }

    private static void validateArguments(CatalogCommand command) {
        Set<String> argumentIds = new HashSet<>();
        for (CatalogCommand.CommandArgument argument : command.arguments()) {
            if (argument == null || blank(argument.id()) || !argumentIds.add(argument.id())
                    || blank(argument.label()) || blank(argument.description())) {
                throw new IllegalArgumentException("Invalid argument metadata for " + command.id());
            }
        }
    }

    private static boolean isSingleShortFlag(String flag) {
        return flag != null && flag.length() == 2 && flag.charAt(0) == '-' && flag.charAt(1) != '-';
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record ScoredCommand(CatalogCommand command, int score) {}
}
