// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.commandide.worker.catalog.CatalogService;
import dev.commandide.worker.risk.RiskAssessmentService;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.BashParser;
import dev.commandide.worker.system.DistroTarget;
import dev.commandide.worker.system.ShellEnvironment;
import dev.commandide.worker.system.SystemProfile;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

final class AiServiceTest {
    @Test
    void validatesAndCanonicalizesProviderOutputThroughNormalSafetyServices() {
        FakeProvider provider = new FakeProvider(ProviderResponse.proposed(new RawAiProposal(
                "ls -a -l .",
                "Lists all directory entries.",
                List.of("The directory is readable."),
                List.of(),
                List.of("Read-only."))));
        AtomicReference<String> syntaxChecked = new AtomicReference<>();
        AiService service = service(provider, syntaxChecked);

        AiProposalResult result = service.propose(request("generateExample", null, null));

        assertEquals("proposed", result.status());
        assertEquals("ls -al .", result.proposal().proposedCode());
        assertEquals("low", result.proposal().assessment().level());
        assertTrue(result.proposal().warnings().contains(
                "Command IDE canonicalized supported Bash before review."));
        assertEquals("ls -al .", syntaxChecked.get());
        assertEquals("generateExample", provider.operation);
    }

    @Test
    void preservesRefusalsAndRejectsMalformedOrSecretBearingWork() {
        AiService refusedService = service(
                new FakeProvider(ProviderResponse.refused("Unsafe request.")),
                new AtomicReference<>());
        assertEquals("refused", refusedService.propose(
                request("generateExample", null, null)).status());

        AiService malformedService = service(
                new FakeProvider(ProviderResponse.proposed(new RawAiProposal(
                        "", "No code", List.of(), List.of(), List.of()))),
                new AtomicReference<>());
        assertEquals("failed", malformedService.propose(
                request("generateExample", null, null)).status());

        assertThrows(IllegalArgumentException.class, () -> malformedService.propose(new AiRequest(
                "ollama", "http://localhost:11434", "qwen3:8b", false,
                "improveScript", "Use OPENAI_API_KEY=sk-secret", "ls", null)));
    }

    @Test
    void allProviderInterfaceOperationsRemainProposalOnly() {
        assertEquals(8, AiProvider.class.getDeclaredMethods().length);
        assertTrue(java.util.Arrays.stream(AiProvider.class.getDeclaredMethods())
                .noneMatch(method -> method.getReturnType().getName().contains("Execution")));
        assertTrue(java.util.Arrays.stream(AiService.class.getDeclaredFields())
                .noneMatch(field -> field.getType().getName().contains("Execution")));
    }

    private AiService service(FakeProvider provider, AtomicReference<String> syntaxChecked) {
        SystemProfile profile = new SystemProfile(
                "linux",
                "x86_64",
                new ShellEnvironment("/bin/bash", "bash"),
                new DistroTarget("ubuntu", "24.04", "Ubuntu 24.04", "ubuntu", true),
                List.of());
        CatalogService catalog = new CatalogService(profile);
        BashGenerator generator = new BashGenerator(catalog);
        BashParser parser = new BashParser(catalog);
        return new AiService(
                Map.of("ollama", provider),
                profile,
                parser,
                generator,
                new RiskAssessmentService(catalog, generator),
                syntaxChecked::set);
    }

    private AiRequest request(String operation, String source, String failure) {
        return new AiRequest(
                "ollama",
                "http://localhost:11434",
                "qwen3:8b",
                false,
                operation,
                "Create a useful example.",
                source,
                failure);
    }

    private static final class FakeProvider implements AiProvider {
        private final ProviderResponse response;
        String operation;

        FakeProvider(ProviderResponse response) {
            this.response = response;
        }

        @Override
        public AiModelsResult listModels(AiProviderConfig config) {
            return new AiModelsResult(
                    "available", List.of(new AiModel("qwen3:8b", "qwen3:8b", null, null)), null);
        }

        @Override
        public AiConnectionResult testConnection(AiProviderConfig config) {
            return new AiConnectionResult("connected", null);
        }

        @Override
        public AiConnectionResult probeStructuredOutput(AiProviderConfig config) {
            return new AiConnectionResult("supported", null);
        }

        @Override
        public ProviderResponse generateExample(AiProviderConfig config, AiGenerationInput input) {
            operation = "generateExample";
            return response;
        }

        @Override
        public ProviderResponse explain(AiProviderConfig config, AiGenerationInput input) {
            operation = "explain";
            return response;
        }

        @Override
        public ProviderResponse completeScript(AiProviderConfig config, AiGenerationInput input) {
            operation = "completeScript";
            return response;
        }

        @Override
        public ProviderResponse improveScript(AiProviderConfig config, AiGenerationInput input) {
            operation = "improveScript";
            return response;
        }

        @Override
        public ProviderResponse explainFailure(AiProviderConfig config, AiGenerationInput input) {
            operation = "explainFailure";
            return response;
        }
    }
}
