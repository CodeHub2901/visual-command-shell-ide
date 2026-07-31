// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.export;

import java.util.List;

public record ExportArtifact(
        String format,
        String suggestedFileName,
        String mediaType,
        String content,
        String syntaxValidation,
        List<String> warnings) {}
