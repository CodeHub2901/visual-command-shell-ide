// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

final class OpenAiSdkTransportTest {
    private final OpenAiSdkTransport transport = new OpenAiSdkTransport();

    @Test
    void convertsValidStructuredOutputIntoAProviderProposal() {
        OpenAiStructuredProposal structured = proposal();
        structured.proposedCode = Optional.of("printf '%s\\n' hello");
        structured.explanation = Optional.of("Prints one line.");

        ProviderResponse response = transport.parse(structured);

        assertEquals("proposed", response.status());
        assertEquals("printf '%s\\n' hello", response.proposal().proposedCode());
        assertEquals(List.of("The shell is Bash."), response.proposal().assumptions());
        assertNull(response.reason());
    }

    @Test
    void preservesAProviderRefusalWithoutInventingCode() {
        OpenAiStructuredProposal structured = proposal();
        structured.status = "refused";
        structured.reason = Optional.of("I cannot help with that request.");

        ProviderResponse response = transport.parse(structured);

        assertEquals("refused", response.status());
        assertNull(response.proposal());
        assertEquals("I cannot help with that request.", response.reason());
    }

    @Test
    void rejectsIncompleteContradictoryOrOversizedStructuredOutput() {
        assertEquals("failed", transport.parse(null).status());

        OpenAiStructuredProposal missingCode = proposal();
        missingCode.proposedCode = Optional.empty();
        missingCode.explanation = Optional.of("Missing code.");
        assertEquals("failed", transport.parse(missingCode).status());

        OpenAiStructuredProposal contradictory = proposal();
        contradictory.proposedCode = Optional.of("ls");
        contradictory.explanation = Optional.of("Lists files.");
        contradictory.reason = Optional.of("Unexpected refusal reason.");
        assertEquals("failed", transport.parse(contradictory).status());

        OpenAiStructuredProposal oversizedList = proposal();
        oversizedList.proposedCode = Optional.of("ls");
        oversizedList.explanation = Optional.of("Lists files.");
        oversizedList.assumptions = java.util.Collections.nCopies(51, "Assumption");
        assertEquals("failed", transport.parse(oversizedList).status());
    }

    private OpenAiStructuredProposal proposal() {
        OpenAiStructuredProposal result = new OpenAiStructuredProposal();
        result.schemaVersion = "1.0.0";
        result.status = "proposed";
        result.proposedCode = Optional.empty();
        result.explanation = Optional.empty();
        result.assumptions = List.of("The shell is Bash.");
        result.warnings = List.of();
        result.riskHints = List.of("Read-only command.");
        result.reason = Optional.empty();
        return result;
    }
}
