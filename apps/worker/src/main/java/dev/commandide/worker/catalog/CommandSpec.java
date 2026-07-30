package dev.commandide.worker.catalog;

import java.util.List;

public record CommandSpec(
        String id,
        String executable,
        List<String> versionProbeArguments,
        String displayName,
        String summary,
        String category,
        List<String> platforms,
        List<String> distroFamilies,
        List<CatalogCommand.CommandArgument> arguments,
        List<String> riskTags,
        String shortOptionPolicy,
        String availability,
        String executablePath,
        CommandCompatibility compatibility,
        List<CatalogCommand.CommandOption> options,
        List<String> examples,
        CatalogCommand.CommandManual manual) {}
