// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import {
  ClipboardCopyResultSchema,
  ShellGenerateResultSchema,
  type ClipboardCopyResult
} from "@cmd-ide/contracts";

export function copyGeneratedCommand(
  rawGenerated: unknown,
  writeText: (text: string) => void
): ClipboardCopyResult {
  const generated = ShellGenerateResultSchema.parse(rawGenerated);
  writeText(generated.script);
  return ClipboardCopyResultSchema.parse({
    copied: true,
    characters: generated.script.length
  });
}
