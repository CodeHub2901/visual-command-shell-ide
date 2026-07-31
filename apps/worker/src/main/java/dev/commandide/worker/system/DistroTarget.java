// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.system;

public record DistroTarget(
        String id,
        String versionId,
        String prettyName,
        String family,
        boolean supported) {}

