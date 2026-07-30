package dev.commandide.worker.ai;

import java.net.URI;
import java.time.Duration;

interface OllamaTransport {
    Response get(URI uri, Duration timeout) throws Exception;

    Response post(URI uri, String body, Duration timeout) throws Exception;

    record Response(int statusCode, String body) {}
}
