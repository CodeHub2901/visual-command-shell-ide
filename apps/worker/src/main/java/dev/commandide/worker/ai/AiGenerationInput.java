// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

public record AiGenerationInput(
        String instruction,
        String source,
        String failureMessage,
        String targetDescription) {}
