// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.manual;

import dev.commandide.worker.catalog.CatalogCommand;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

final class ManualParser {
    private static final Pattern ANSI = Pattern.compile("\\u001B\\[[0-?]*[ -/]*[@-~]");
    private static final Pattern HEADING = Pattern.compile("[A-Z][A-Z0-9 ._-]{1,60}");
    private static final Set<String> SEMANTIC_HEADINGS = Set.of(
            "NAME", "SYNOPSIS", "DESCRIPTION", "OPTIONS", "EXAMPLES",
            "EXIT STATUS", "EXIT CODES", "FILES", "SEE ALSO");

    private ManualParser() {}

    static CatalogCommand.CommandManual parseMan(
            String raw,
            CatalogCommand.CommandManual fallback) {
        String text = sanitize(raw);
        List<CatalogCommand.ManualSection> sections = new ArrayList<>();
        String currentHeading = null;
        StringBuilder currentBody = new StringBuilder();
        for (String line : text.split("\\n", -1)) {
            String trimmed = line.strip();
            boolean semanticHeading = line.equals(line.stripLeading())
                    && HEADING.matcher(trimmed).matches()
                    && SEMANTIC_HEADINGS.contains(trimmed);
            if (semanticHeading) {
                flush(sections, currentHeading, currentBody);
                currentHeading = titleCase(trimmed);
                currentBody = new StringBuilder();
            } else if (currentHeading != null) {
                currentBody.append(line.stripTrailing()).append('\n');
            }
        }
        flush(sections, currentHeading, currentBody);
        if (sections.isEmpty()) {
            return null;
        }
        String synopsis = sections.stream()
                .filter(section -> section.heading().equals("Synopsis"))
                .map(CatalogCommand.ManualSection::body)
                .findFirst()
                .orElse(fallback.synopsis());
        return new CatalogCommand.CommandManual(limit(synopsis, 2_000), sections.stream().limit(32).toList());
    }

    static CatalogCommand.CommandManual parseHelp(
            String raw,
            CatalogCommand.CommandManual fallback) {
        String text = sanitize(raw).strip();
        if (text.isBlank()) {
            return null;
        }
        String synopsis = text.lines().filter(line -> !line.isBlank()).findFirst().orElse(fallback.synopsis());
        return new CatalogCommand.CommandManual(
                limit(synopsis.strip(), 2_000),
                List.of(new CatalogCommand.ManualSection("Help", limit(text, 200_000))));
    }

    static String sanitize(String raw) {
        String withoutAnsi = ANSI.matcher(raw == null ? "" : raw).replaceAll("");
        StringBuilder clean = new StringBuilder(withoutAnsi.length());
        for (int index = 0; index < withoutAnsi.length(); index++) {
            char character = withoutAnsi.charAt(index);
            if (character == '\b') {
                if (!clean.isEmpty()) clean.deleteCharAt(clean.length() - 1);
            } else if (character == '\r') {
                if (index + 1 >= withoutAnsi.length() || withoutAnsi.charAt(index + 1) != '\n') {
                    clean.append('\n');
                }
            } else if (character == '\n' || character == '\t' || !Character.isISOControl(character)) {
                clean.append(character);
            }
        }
        return clean.toString().replaceAll("[ \\t]+\\n", "\\n");
    }

    private static void flush(
            List<CatalogCommand.ManualSection> sections,
            String heading,
            StringBuilder body) {
        if (heading == null) return;
        String normalized = body.toString().strip().replaceAll("\\n{3,}", "\\n\\n");
        if (!normalized.isBlank()) {
            sections.add(new CatalogCommand.ManualSection(heading, limit(normalized, 200_000)));
        }
    }

    private static String titleCase(String value) {
        StringBuilder result = new StringBuilder();
        for (String word : value.toLowerCase(Locale.ROOT).split(" ")) {
            if (!result.isEmpty()) result.append(' ');
            result.append(Character.toUpperCase(word.charAt(0))).append(word.substring(1));
        }
        return result.toString();
    }

    private static String limit(String value, int maximum) {
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }
}
