package dev.commandide.worker.ai;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Optional;

public final class OpenAiStructuredProposal {
    @JsonPropertyDescription("Schema version. Always 1.0.0.")
    @Schema(pattern = "^1\\.0\\.0$")
    public String schemaVersion;

    @JsonPropertyDescription("Use proposed for reviewable Bash, or refused when the request cannot be safely fulfilled.")
    @Schema(allowableValues = {"proposed", "refused"})
    public String status;

    @JsonPropertyDescription("Reviewable Bash without Markdown fences. Null when refused.")
    public Optional<String> proposedCode;

    @JsonPropertyDescription("Concise explanation of the proposed Bash. Null when refused.")
    public Optional<String> explanation;

    @ArraySchema(maxItems = 50)
    public List<String> assumptions;

    @ArraySchema(maxItems = 50)
    public List<String> warnings;

    @ArraySchema(maxItems = 50)
    public List<String> riskHints;

    @JsonPropertyDescription("Reason for refusal. Null when status is proposed.")
    public Optional<String> reason;
}
