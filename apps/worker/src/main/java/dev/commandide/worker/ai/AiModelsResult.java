// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import java.util.List;

public record AiModelsResult(
        String status,
        List<AiModel> models,
        String reason) {}
