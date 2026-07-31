// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

package dev.commandide.worker.export;

@FunctionalInterface
public interface BashSyntaxChecker {
    void requireValid(String script) throws Exception;
}
