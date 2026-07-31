// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.bookmark;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.commandide.worker.persistence.BookmarkRepository;
import dev.commandide.worker.persistence.StoredBookmark;
import dev.commandide.worker.project.ScriptProject;
import dev.commandide.worker.security.SecretRedactor;
import dev.commandide.worker.shell.BashGenerator;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

public final class BookmarkService {
    private static final String BOOKMARK_VERSION = "1.0.0";
    private static final Pattern PARAMETER_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final Pattern SECRET_NAME = Pattern.compile(
            "(?i).*(api_?key|access_?token|token|password|passwd|secret).*");

    private final BookmarkRepository repository;
    private final BashGenerator generator;
    private final SecretRedactor redactor;
    private final Clock clock;
    private final ObjectMapper mapper;

    public BookmarkService(BookmarkRepository repository, BashGenerator generator) {
        this(repository, generator, Clock.systemUTC());
    }

    BookmarkService(BookmarkRepository repository, BashGenerator generator, Clock clock) {
        this.repository = repository;
        this.generator = generator;
        this.redactor = new SecretRedactor();
        this.clock = clock;
        this.mapper = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    }

    public StructuredBookmark save(BookmarkSaveRequest request) throws Exception {
        validateRequest(request);
        String bookmarkId = request.bookmarkId() == null
                ? UUID.randomUUID().toString()
                : request.bookmarkId();
        UUID.fromString(bookmarkId);

        Instant now = clock.instant();
        Instant createdAt = repository.findById(bookmarkId)
                .map(StoredBookmark::createdAt)
                .orElse(now);
        StructuredBookmark bookmark = new StructuredBookmark(
                BOOKMARK_VERSION,
                bookmarkId,
                request.name().strip(),
                request.program(),
                List.copyOf(request.parameters()),
                createdAt.toString(),
                now.toString());
        repository.save(new StoredBookmark(
                bookmark.bookmarkId(),
                bookmark.name(),
                mapper.writeValueAsString(bookmark),
                1,
                createdAt,
                now));
        return bookmark;
    }

    public List<StructuredBookmark> recent(int limit) throws Exception {
        return repository.recent(limit).stream().map(stored -> {
            try {
                if (stored.schemaVersion() != 1) {
                    throw new IllegalStateException("Unsupported stored bookmark schema");
                }
                StructuredBookmark bookmark = mapper.readValue(
                        stored.structuredSelectionJson(), StructuredBookmark.class);
                validateStored(bookmark);
                return bookmark;
            } catch (Exception exception) {
                throw new IllegalStateException("Stored bookmark is invalid", exception);
            }
        }).toList();
    }

    public boolean delete(String bookmarkId) throws Exception {
        UUID.fromString(bookmarkId);
        return repository.delete(bookmarkId);
    }

    private void validateRequest(BookmarkSaveRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()
                || request.name().strip().length() > 120
                || request.program() == null
                || request.parameters() == null || request.parameters().size() > 200) {
            throw new IllegalArgumentException("Invalid bookmark");
        }
        if (request.bookmarkId() != null) UUID.fromString(request.bookmarkId());
        validateProgram(request.program());
        validateParameters(request.parameters());
    }

    private void validateStored(StructuredBookmark bookmark) {
        if (bookmark == null || !BOOKMARK_VERSION.equals(bookmark.schemaVersion())) {
            throw new IllegalArgumentException("Invalid bookmark schema");
        }
        UUID.fromString(bookmark.bookmarkId());
        Instant.parse(bookmark.createdAt());
        Instant.parse(bookmark.updatedAt());
        validateRequest(new BookmarkSaveRequest(
                bookmark.bookmarkId(), bookmark.name(), bookmark.program(), bookmark.parameters()));
    }

    private void validateProgram(dev.commandide.worker.shell.ShellProgram program) {
        String script = generator.generate(program).script();
        if (!script.equals(redactor.redact(script))) {
            throw new IllegalArgumentException(
                    "Bookmarks cannot contain embedded credentials; use a sensitive parameter");
        }
    }

    private void validateParameters(List<ScriptProject.ProjectParameter> parameters) {
        Set<String> names = new HashSet<>();
        for (ScriptProject.ProjectParameter parameter : parameters) {
            if (parameter == null || parameter.name() == null
                    || !PARAMETER_NAME.matcher(parameter.name()).matches()
                    || !names.add(parameter.name())
                    || parameter.description() == null || parameter.description().length() > 1000
                    || parameter.defaultValue() != null && parameter.defaultValue().length() > 4096
                    || parameter.sensitive() && parameter.defaultValue() != null
                    || SECRET_NAME.matcher(parameter.name()).matches() && parameter.defaultValue() != null) {
                throw new IllegalArgumentException("Invalid or secret-bearing bookmark parameter");
            }
        }
    }
}
