// SPDX-FileCopyrightText: 2026 Divyang S Mistry
// SPDX-License-Identifier: Apache-2.0

import { open, lstat, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_ARTIFACT_BYTES = 2_000_000;

export async function readBoundedUtf8(filePath: string): Promise<string> {
  const metadata = await lstat(filePath);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1 || metadata.size > MAX_ARTIFACT_BYTES) {
    throw new Error("Import must be a regular project file no larger than 2 MB");
  }
  const handle = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile() || openedMetadata.size < 1 || openedMetadata.size > MAX_ARTIFACT_BYTES) {
      throw new Error("Import must remain a regular project file no larger than 2 MB");
    }
    const bytes = await handle.readFile();
    if (bytes.length < 1 || bytes.length > MAX_ARTIFACT_BYTES) {
      throw new Error("Import changed size or exceeds the 2 MB limit");
    }
    return bytes.toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function atomicWriteUtf8(filePath: string, content: string): Promise<number> {
  const bytes = Buffer.from(content, "utf8");
  if (bytes.length < 1 || bytes.length > MAX_ARTIFACT_BYTES) {
    throw new Error("Export exceeds the 2 MB limit");
  }
  try {
    const existing = await lstat(filePath);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      throw new Error("Export target must be a regular file");
    }
  } catch (error: unknown) {
    if (!isMissingFile(error)) throw error;
  }

  const directory = path.dirname(filePath);
  const directoryMetadata = await lstat(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error("Export directory must be a regular directory");
  }
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
    return bytes.length;
  } catch (error: unknown) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
