// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogCommand(
        String id,
        String executable,
        List<String> versionProbeArguments,
        String displayName,
        String summary,
        String category,
        List<String> platforms,
        List<String> distroFamilies,
        List<CommandArgument> arguments,
        List<String> riskTags,
        String shortOptionPolicy,
        List<CommandOption> options,
        List<String> examples,
        CommandManual manual) {
    public record CommandOption(
            String id,
            List<String> flags,
            String description,
            boolean takesValue,
            String valueName,
            boolean repeatable,
            boolean combinable,
            List<String> conflictsWith) {
        public CommandOption {
            conflictsWith = conflictsWith == null ? List.of() : List.copyOf(conflictsWith);
        }
    }

    public record CommandArgument(
            String id,
            String label,
            String description,
            boolean required,
            boolean repeatable) {}

    public record CommandManual(String synopsis, List<ManualSection> sections) {}

    public record ManualSection(String heading, String body) {}
}
