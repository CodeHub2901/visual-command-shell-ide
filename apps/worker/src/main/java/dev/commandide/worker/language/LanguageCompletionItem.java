// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

public record LanguageCompletionItem(
        String label,
        String insertText,
        String detail,
        String documentation,
        int kind,
        boolean snippet) {}
