// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

public record AiModel(
        String id,
        String displayName,
        String parameterSize,
        String quantization) {}
