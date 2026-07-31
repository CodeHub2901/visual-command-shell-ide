// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.language;

public record LanguageDiagnostic(
        LanguageRange range,
        String severity,
        String code,
        String message,
        String source) {}
