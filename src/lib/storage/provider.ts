import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { del, get, put } from "@vercel/blob";

import { env } from "@/lib/env";

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType?: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export class LocalFileStorage implements ObjectStorage {
  private readonly root = path.resolve(env.LOCAL_STORAGE_PATH);

  private resolveKey(key: string) {
    const filePath = path.resolve(this.root, key);
    if (filePath !== this.root && !filePath.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Invalid storage key");
    }
    return filePath;
  }

  async put(key: string, bytes: Uint8Array) {
    const filePath = this.resolveKey(key);
    await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await writeFile(filePath, bytes, { mode: 0o600, flag: "wx" });
  }

  async get(key: string) {
    return new Uint8Array(await readFile(this.resolveKey(key)));
  }

  async delete(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }
}

export class VercelBlobStorage implements ObjectStorage {
  private token() {
    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel-blob");
    }
    return env.BLOB_READ_WRITE_TOKEN;
  }

  async put(key: string, bytes: Uint8Array, contentType = "application/octet-stream") {
    await put(key, Buffer.from(bytes), {
      access: "private",
      token: this.token(),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }

  async get(key: string) {
    const result = await get(key, { access: "private", token: this.token() });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`Blob not found: ${key}`);
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }

  async delete(key: string) {
    try {
      await del(key, { token: this.token() });
    } catch {
      // ignore missing blobs
    }
  }
}

function createObjectStorage(): ObjectStorage {
  if (env.STORAGE_DRIVER === "vercel-blob") {
    return new VercelBlobStorage();
  }
  return new LocalFileStorage();
}

export const objectStorage = createObjectStorage();
