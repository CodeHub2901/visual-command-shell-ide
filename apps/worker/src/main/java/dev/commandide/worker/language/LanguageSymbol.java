// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

public record LanguageSymbol(
        String name,
        String detail,
        String containerName,
        int kind,
        LanguageRange range,
        LanguageRange selectionRange) {}
