// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.persistence;

import java.time.Instant;

public record StoredProject(
        String id,
        String name,
        String projectJson,
        int schemaVersion,
        Instant createdAt,
        Instant updatedAt) {}

