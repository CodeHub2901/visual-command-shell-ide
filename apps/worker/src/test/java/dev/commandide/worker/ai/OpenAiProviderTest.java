// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.credential.CredentialService;
import java.util.List;
import org.junit.jupiter.api.Test;

final class OpenAiProviderTest {
    @Test
    void listsTheConfigurableModelFamilyAndRequiresAStoredCredential() {
        CredentialService credentials = CredentialService.sessionOnly();
        OpenAiProvider provider = new OpenAiProvider(
                credentials, "cmdide_0123456789abcdef0123456789abcdef", new FakeTransport());

        AiModelsResult models = provider.listModels(config(null));
        AiConnectionResult connection = provider.testConnection(config(null));

        assertEquals("available", models.status());
        assertEquals("gpt-5.6", models.models().getFirst().id());
        assertTrue(models.models().stream().anyMatch(model -> model.id().equals("gpt-5.6-terra")));
        assertEquals("unavailable", connection.status());
        assertTrue(connection.reason().contains("Configure"));
        assertThrows(IllegalArgumentException.class, () -> provider.listModels(
                new AiProviderConfig("https://attacker.example/v1", null, true)));
    }

    @Test
    void sendsAStablePrivacyIdentifierAndReturnsOnlyProposals() {
        CredentialService credentials = CredentialService.sessionOnly();
        credentials.store("openai", "sk-session-test".toCharArray());
        FakeTransport transport = new FakeTransport();
        transport.response = ProviderResponse.proposed(new RawAiProposal(
                "ls -al .",
                "Lists all entries.",
                List.of("The current directory is readable."),
                List.of(),
                List.of("Read-only command.")));
        String safetyIdentifier = "cmdide_0123456789abcdef0123456789abcdef";
        OpenAiProvider provider = new OpenAiProvider(credentials, safetyIdentifier, transport);

        assertEquals("supported", provider.probeStructuredOutput(config("gpt-5.6")).status());
        ProviderResponse result = provider.generateExample(
                config("gpt-5.6"),
                new AiGenerationInput("List files", null, null, "Linux Bash"));

        assertEquals("proposed", result.status());
        assertEquals("ls -al .", result.proposal().proposedCode());
        assertEquals("sk-session-test", transport.key);
        assertEquals(safetyIdentifier, transport.safetyIdentifier);
        assertEquals("gpt-5.6", transport.model);
        assertEquals("generateExample", transport.operation);
    }

    @Test
    void preservesRefusalTimeoutAndOfflineResultsWithoutExecutionAuthority() {
        CredentialService credentials = CredentialService.sessionOnly();
        credentials.store("openai", "sk-session-test".toCharArray());
        FakeTransport transport = new FakeTransport();
        OpenAiProvider provider = new OpenAiProvider(
                credentials, "cmdide_0123456789abcdef0123456789abcdef", transport);

        transport.response = ProviderResponse.refused("Request refused.");
        assertEquals("refused", provider.improveScript(
                config("gpt-5.6"),
                new AiGenerationInput("Improve", "ls", null, "Linux Bash")).status());

        transport.response = ProviderResponse.failed("OpenAI proposal generation failed or timed out.");
        assertEquals("failed", provider.completeScript(
                config("gpt-5.6"),
                new AiGenerationInput("Complete", "ls", null, "Linux Bash")).status());

        transport.probe = new AiConnectionResult("unavailable", "OpenAI is offline.");
        assertEquals("unavailable", provider.probeStructuredOutput(config("gpt-5.6")).status());
        assertTrue(java.util.Arrays.stream(OpenAiProvider.class.getDeclaredMethods())
                .noneMatch(method -> method.getReturnType().getName().contains("Execution")));
    }

    private AiProviderConfig config(String model) {
        return new AiProviderConfig(OpenAiProvider.DEFAULT_ENDPOINT, model, true);
    }

    private static final class FakeTransport implements OpenAiTransport {
        AiConnectionResult probe = new AiConnectionResult("supported", null);
        ProviderResponse response = ProviderResponse.failed("not configured");
        String key;
        String safetyIdentifier;
        String model;
        String operation;

        @Override
        public AiConnectionResult probe(
                char[] apiKey,
                String endpoint,
                String model,
                String safetyIdentifier) {
            key = new String(apiKey);
            this.safetyIdentifier = safetyIdentifier;
            this.model = model;
            return probe;
        }

        @Override
        public ProviderResponse generate(
                char[] apiKey,
                String endpoint,
                String model,
                String operation,
                AiGenerationInput input,
                String safetyIdentifier) {
            key = new String(apiKey);
            this.safetyIdentifier = safetyIdentifier;
            this.model = model;
            this.operation = operation;
            return response;
        }
    }
}

