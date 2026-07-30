import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { atomicWriteUtf8, MAX_ARTIFACT_BYTES, readBoundedUtf8 } from "./file-operations";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("bounded file operations", () => {
  it("writes UTF-8 atomically and reads regular project files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cmd-ide-files-"));
    directories.push(directory);
    const target = path.join(directory, "recipe.md");

    const bytes = await atomicWriteUtf8(target, "hello ✓\n");

    expect(bytes).toBe(Buffer.byteLength("hello ✓\n"));
    expect(await readFile(target, "utf8")).toBe("hello ✓\n");
    expect(await readBoundedUtf8(target)).toBe("hello ✓\n");
    await atomicWriteUtf8(target, "updated\n");
    expect(await readFile(target, "utf8")).toBe("updated\n");
  });

  it("rejects oversized imports and symbolic links", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "cmd-ide-files-"));
    directories.push(directory);
    const oversized = path.join(directory, "large.json");
    const target = path.join(directory, "target.json");
    const link = path.join(directory, "link.json");
    await writeFile(oversized, Buffer.alloc(MAX_ARTIFACT_BYTES + 1));
    await writeFile(target, "{}\n");
    await symlink(target, link, "file");

    await expect(readBoundedUtf8(oversized)).rejects.toThrow("2 MB");
    await expect(readBoundedUtf8(link)).rejects.toThrow("regular project file");
  });
});
