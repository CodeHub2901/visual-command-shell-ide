// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.catalog;

import java.util.List;

public record CatalogIndex(
        String schemaVersion,
        List<String> packs,
        List<String> overlays) {}
