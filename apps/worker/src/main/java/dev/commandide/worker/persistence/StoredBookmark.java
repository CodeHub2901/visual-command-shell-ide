// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.time.Instant;

public record StoredBookmark(
        String id,
        String name,
        String structuredSelectionJson,
        int schemaVersion,
        Instant createdAt,
        Instant updatedAt) {}

