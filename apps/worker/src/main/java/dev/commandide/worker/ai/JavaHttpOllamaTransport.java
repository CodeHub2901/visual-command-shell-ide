// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.ai;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

final class JavaHttpOllamaTransport implements OllamaTransport {
    private static final int MAX_RESPONSE_BYTES = 2_000_000;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public Response get(URI uri, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Accept", "application/json")
                .GET()
                .build();
        return send(request);
    }

    @Override
    public Response post(URI uri, String body, Duration timeout) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        return send(request);
    }

    private Response send(HttpRequest request) throws Exception {
        HttpResponse<InputStream> response = client.send(
                request, HttpResponse.BodyHandlers.ofInputStream());
        try (InputStream input = response.body()) {
            byte[] body = input.readNBytes(MAX_RESPONSE_BYTES + 1);
            if (body.length > MAX_RESPONSE_BYTES) {
                throw new IllegalArgumentException("Ollama response exceeds 2 MB");
            }
            return new Response(
                    response.statusCode(), new String(body, StandardCharsets.UTF_8));
        }
    }
}
