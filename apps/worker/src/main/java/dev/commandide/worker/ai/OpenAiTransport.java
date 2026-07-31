// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

interface OpenAiTransport {
    AiConnectionResult probe(
            char[] apiKey,
            String endpoint,
            String model,
            String safetyIdentifier);

    ProviderResponse generate(
            char[] apiKey,
            String endpoint,
            String model,
            String operation,
            AiGenerationInput input,
            String safetyIdentifier);
}

