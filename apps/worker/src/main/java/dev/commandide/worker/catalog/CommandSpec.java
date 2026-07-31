// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

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
