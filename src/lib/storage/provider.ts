import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array): Promise<void>;
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

export const objectStorage = new LocalFileStorage();
