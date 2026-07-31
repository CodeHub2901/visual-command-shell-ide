// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import dev.commandide.worker.export.BashSyntaxChecker;
import dev.commandide.worker.credential.CredentialService;
import dev.commandide.worker.risk.RiskAssessment;
import dev.commandide.worker.risk.RiskAssessmentService;
import dev.commandide.worker.security.SecretRedactor;
import dev.commandide.worker.shell.BashGenerator;
import dev.commandide.worker.shell.BashParser;
import dev.commandide.worker.shell.ShellGenerateResult;
import dev.commandide.worker.shell.ShellParseResult;
import dev.commandide.worker.system.SystemProfile;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AiService {
    private static final Set<String> OPERATIONS = Set.of(
            "generateExample", "explain", "completeScript",
            "improveScript", "explainFailure");
    private final Map<String, AiProvider> providers;
    private final SystemProfile profile;
    private final BashParser parser;
    private final BashGenerator generator;
    private final RiskAssessmentService risk;
    private final BashSyntaxChecker syntaxChecker;
    private final SecretRedactor redactor = new SecretRedactor();

    public AiService(
            SystemProfile profile,
            BashParser parser,
            BashGenerator generator,
            RiskAssessmentService risk,
            BashSyntaxChecker syntaxChecker) {
        this(
                Map.of("ollama", new OllamaAiProvider()),
                profile, parser, generator, risk, syntaxChecker);
    }

    public AiService(
            SystemProfile profile,
            BashParser parser,
            BashGenerator generator,
            RiskAssessmentService risk,
            BashSyntaxChecker syntaxChecker,
            CredentialService credentials,
            String safetyIdentifier) {
        this(
                Map.of(
                        "ollama", new OllamaAiProvider(),
                        "openai", new OpenAiProvider(credentials, safetyIdentifier)),
                profile, parser, generator, risk, syntaxChecker);
    }

    AiService(
            Map<String, AiProvider> providers,
            SystemProfile profile,
            BashParser parser,
            BashGenerator generator,
            RiskAssessmentService risk,
            BashSyntaxChecker syntaxChecker) {
        this.providers = Map.copyOf(providers);
        this.profile = profile;
        this.parser = parser;
        this.generator = generator;
        this.risk = risk;
        this.syntaxChecker = syntaxChecker;
    }

    public AiModelsResult listModels(
            String provider,
            String endpoint,
            boolean remoteEndpointConfirmed) {
        return provider(provider).listModels(
                new AiProviderConfig(endpoint, null, remoteEndpointConfirmed));
    }

    public AiConnectionResult testConnection(
            String provider,
            String endpoint,
            boolean remoteEndpointConfirmed) {
        return provider(provider).testConnection(
                new AiProviderConfig(endpoint, null, remoteEndpointConfirmed));
    }

    public AiConnectionResult probeModel(
            String provider,
            String endpoint,
            String model,
            boolean remoteEndpointConfirmed) {
        return provider(provider).probeStructuredOutput(
                new AiProviderConfig(endpoint, model, remoteEndpointConfirmed));
    }

    public AiProposalResult propose(AiRequest request) {
        validateRequest(request);
        AiProvider selectedProvider = provider(request.provider());
        AiProviderConfig config = new AiProviderConfig(
                request.endpoint(), request.model(), request.remoteEndpointConfirmed());
        AiConnectionResult capability = selectedProvider.probeStructuredOutput(config);
        if (!capability.status().equals("supported")) {
            return new AiProposalResult("failed", null, capability.reason());
        }
        AiGenerationInput input = new AiGenerationInput(
                request.instruction(),
                request.source(),
                request.failureMessage(),
                targetDescription());
        ProviderResponse response = switch (request.operation()) {
            case "generateExample" -> selectedProvider.generateExample(config, input);
            case "explain" -> selectedProvider.explain(config, input);
            case "completeScript" -> selectedProvider.completeScript(config, input);
            case "improveScript" -> selectedProvider.improveScript(config, input);
            case "explainFailure" -> selectedProvider.explainFailure(config, input);
            default -> throw new IllegalArgumentException("Unsupported AI operation");
        };
        if (response.status().equals("refused")) {
            return new AiProposalResult("refused", null, response.reason());
        }
        if (!response.status().equals("proposed") || response.proposal() == null) {
            return new AiProposalResult("failed", null, response.reason());
        }
        return validateProposal(request, response.proposal());
    }

    private AiProposalResult validateProposal(AiRequest request, RawAiProposal raw) {
        try {
            if (!raw.proposedCode().equals(redactor.redact(raw.proposedCode()))) {
                return new AiProposalResult(
                        "failed", null, "AI proposal contained an embedded credential.");
            }
            syntaxChecker.requireValid(raw.proposedCode());
            ShellParseResult parsed = parser.parse(raw.proposedCode());
            ShellGenerateResult generated = generator.generate(parsed.program());
            syntaxChecker.requireValid(generated.script());
            RiskAssessment assessment = risk.assess(parsed.program());
            List<String> warnings = new ArrayList<>(raw.warnings());
            if (!generated.script().equals(raw.proposedCode())) {
                warnings.add("Command IDE canonicalized supported Bash before review.");
            }
            warnings.addAll(generated.warnings());
            if (parsed.preservedRaw()) {
                warnings.add("Unsupported Bash remains exact raw code and receives Critical risk.");
            }
            AiProposal proposal = new AiProposal(
                    "1.0.0",
                    request.provider(),
                    request.model(),
                    request.operation(),
                    generated.script(),
                    raw.explanation(),
                    bounded(raw.assumptions(), 50),
                    bounded(warnings, 100),
                    bounded(raw.riskHints(), 50),
                    parsed.program(),
                    parsed.diagnostics(),
                    parsed.preservedRaw(),
                    assessment);
            return new AiProposalResult("proposed", proposal, null);
        } catch (Exception exception) {
            return new AiProposalResult(
                    "failed", null, "AI proposal did not pass Bash validation and risk analysis.");
        }
    }

    private void validateRequest(AiRequest request) {
        if (request == null
                || !OPERATIONS.contains(request.operation())
                || request.instruction() == null
                || request.instruction().isBlank()
                || request.instruction().length() > 10_000
                || (request.source() != null && request.source().length() > 1_000_000)
                || (request.failureMessage() != null && request.failureMessage().length() > 20_000)) {
            throw new IllegalArgumentException("Invalid AI request");
        }
        boolean needsSource = !request.operation().equals("generateExample");
        if (needsSource && (request.source() == null || request.source().isBlank())) {
            throw new IllegalArgumentException("This AI operation requires Bash source");
        }
        if (request.operation().equals("explainFailure")
                && (request.failureMessage() == null || request.failureMessage().isBlank())) {
            throw new IllegalArgumentException("Failure explanation requires failure text");
        }
        rejectSecrets(request.instruction());
        rejectSecrets(request.source());
        rejectSecrets(request.failureMessage());
    }

    private void rejectSecrets(String value) {
        if (value != null && !value.equals(redactor.redact(value))) {
            throw new IllegalArgumentException("AI requests cannot contain embedded credentials");
        }
    }

    private AiProvider provider(String provider) {
        AiProvider result = providers.get(provider);
        if (result == null) throw new IllegalArgumentException("Unsupported AI provider");
        return result;
    }

    private String targetDescription() {
        String distro = profile.distro() == null
                ? "unknown distribution"
                : profile.distro().id() + " " + profile.distro().versionId();
        return profile.operatingSystem() + " " + profile.architecture()
                + ", " + distro + ", Bash";
    }

    private List<String> bounded(List<String> values, int limit) {
        return List.copyOf(values.subList(0, Math.min(values.size(), limit)));
    }
}
