// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.security;

import java.util.List;
import java.util.regex.Pattern;

public final class SecretRedactor {
    private static final String REPLACEMENT = "<redacted>";
    private static final List<Rule> RULES = List.of(
            new Rule(
                    Pattern.compile("(?i)\\b([A-Z0-9_]*(?:api[_-]?key|access[_-]?token|token|password|passwd|secret)[A-Z0-9_]*\\s*=\\s*)(?:'[^']*'|\"[^\"]*\"|[^\\s;|&]+)"),
                    "$1" + REPLACEMENT),
            new Rule(
                    Pattern.compile("(?i)(--(?:api[_-]?key|token|password|secret)(?:=|\\s+))(?:'[^']*'|\"[^\"]*\"|[^\\s;|&]+)"),
                    "$1" + REPLACEMENT),
            new Rule(
                    Pattern.compile("(?i)(Authorization\\s*:\\s*Bearer\\s+)[A-Za-z0-9._~+/-]+={0,2}"),
                    "$1" + REPLACEMENT));

    public String redact(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String redacted = text;
        for (Rule rule : RULES) {
            redacted = rule.pattern().matcher(redacted).replaceAll(rule.replacement());
        }
        return redacted;
    }

    private record Rule(Pattern pattern, String replacement) {}
}
