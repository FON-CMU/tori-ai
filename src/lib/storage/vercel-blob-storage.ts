import "server-only";

import { del, get, put } from "@vercel/blob";

import type { ObjectStorage } from "@/lib/storage/provider";

/**
 * Object storage backed by Vercel Blob, for deployments whose filesystem is
 * read-only and not durable between invocations.
 *
 * The store must be created with private access — TOR documents are personal
 * HR records, and a public blob URL is readable forever by anyone who has it.
 */
export class VercelBlobStorage implements ObjectStorage {
  async put(key: string, bytes: Uint8Array) {
    // addRandomSuffix defaults to false, so pathname === key and the caller's
    // storageKey stays the authoritative lookup value. allowOverwrite is left
    // at its default so a repeated key throws, matching the local driver's
    // exclusive-create flag.
    // PutBody does not accept a bare Uint8Array.
    await put(key, Buffer.from(bytes), { access: "private", contentType: "application/octet-stream" });
  }

  async get(key: string) {
    const result = await get(key, { access: "private" });
    if (!result) throw new Error(`Storage object not found: ${key}`);
    if (result.statusCode !== 200) {
      throw new Error(`Storage object not readable: ${key} (status ${result.statusCode})`);
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }

  async delete(key: string) {
    // del() is a no-op on a missing blob, like rm({ force: true }).
    await del(key);
  }
}
