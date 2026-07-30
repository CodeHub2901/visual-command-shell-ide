package dev.commandide.worker.ai;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.openai.models.responses.ResponseCreateParams;
import com.openai.models.responses.StructuredResponseCreateParams;
import org.junit.jupiter.api.Test;

final class OpenAiStructuredProposalSchemaTest {
    @Test
    void officialSdkAcceptsTheProposalSchemaLocallyWithoutANetworkRequest() {
        StructuredResponseCreateParams<OpenAiStructuredProposal> parameters =
                ResponseCreateParams.builder()
                        .input("Return a harmless Bash proposal.")
                        .instructions("Use the supplied schema.")
                        .text(OpenAiStructuredProposal.class)
                        .model("gpt-5.6")
                        .safetyIdentifier("cmdide_0123456789abcdef0123456789abcdef")
                        .store(false)
                        .build();

        assertEquals(OpenAiStructuredProposal.class, parameters.responseType());
        assertFalse(parameters.rawParams().store().orElseThrow());
    }
}

