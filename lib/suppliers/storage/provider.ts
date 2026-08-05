/**
 * StorageProvider — durable raw supplier payloads.
 * Swap db → filesystem → S3 without rewriting callers.
 */

import "server-only";

import { createHash } from "crypto";
import { mkdir, readFile, writeFile, unlink, access } from "fs/promises";
import path from "path";
import { Prisma, type SupplierName } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type StoredObject = {
  key: string;
  byteSize: number;
  checksum: string;
  contentType: string;
};

export interface StorageProvider {
  readonly id: string;
  put(key: string, data: string | Buffer, contentType?: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function checksumOf(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Default: store JSON inline on SupplierRawArtifact.inlineJson (keyed lookup). */
export class DbStorageProvider implements StorageProvider {
  readonly id = "db";

  async put(key: string, data: string | Buffer, contentType = "application/json"): Promise<StoredObject> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    return {
      key,
      byteSize: buf.byteLength,
      checksum: checksumOf(buf),
      contentType,
    };
  }

  async get(_key: string): Promise<Buffer | null> {
    // Payload retrieved via artifact.inlineJson by callers — not by key alone.
    return null;
  }

  async delete(_key: string): Promise<void> {}

  async exists(key: string): Promise<boolean> {
    const row = await prisma.supplierRawArtifact.findFirst({
      where: { storageKey: key },
      select: { id: true },
    });
    return Boolean(row);
  }
}

/** Local filesystem — bridge before object storage. */
export class FilesystemStorageProvider implements StorageProvider {
  readonly id = "filesystem";
  private root: string;

  constructor(rootDir?: string) {
    this.root = rootDir || path.join(process.cwd(), "data", "supplier-raw");
  }

  private resolve(key: string) {
    const safe = key.replace(/[^a-zA-Z0-9/_.,-]/g, "_");
    return path.join(this.root, safe);
  }

  async put(key: string, data: string | Buffer, contentType = "application/json"): Promise<StoredObject> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, buf);
    return { key, byteSize: buf.byteLength, checksum: checksumOf(buf), contentType };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      /* ignore */
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

/** Placeholder S3-compatible provider — implement with AWS SDK when ready. */
export class S3StorageProvider implements StorageProvider {
  readonly id = "s3";

  async put(key: string, data: string | Buffer, contentType = "application/json"): Promise<StoredObject> {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    // Intentionally not calling cloud yet — interface is stable for migration.
    throw new Error(
      `S3StorageProvider not configured. Set SUPPLIER_RAW_STORAGE=filesystem|db. Key=${key} size=${buf.byteLength} type=${contentType}`
    );
  }

  async get(): Promise<Buffer | null> {
    throw new Error("S3StorageProvider not configured");
  }

  async delete(): Promise<void> {
    throw new Error("S3StorageProvider not configured");
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const mode = (process.env.SUPPLIER_RAW_STORAGE || "db").toLowerCase();
  if (mode === "filesystem") cached = new FilesystemStorageProvider();
  else if (mode === "s3") cached = new S3StorageProvider();
  else cached = new DbStorageProvider();
  return cached;
}

export type PersistRawOpts = {
  supplier: SupplierName;
  supplierAccountId?: string | null;
  supplierProductId: string;
  payload: unknown;
  meta?: Record<string, unknown>;
};

/**
 * Persist raw supplier response: metadata in DB, body via StorageProvider.
 * Does not write large blobs onto Product.supplierRaw.
 */
export async function persistSupplierRaw(opts: PersistRawOpts): Promise<{
  artifactId: string;
  storageKey: string;
  storageProvider: string;
}> {
  const storage = getStorageProvider();
  const json = JSON.stringify(opts.payload ?? null);
  const storageKey = [
    opts.supplier,
    opts.supplierAccountId || "default",
    opts.supplierProductId,
    Date.now().toString(36),
  ].join("/");

  const stored = await storage.put(storageKey, json, "application/json");

  const artifact = await prisma.supplierRawArtifact.create({
    data: {
      supplier: opts.supplier,
      supplierAccountId: opts.supplierAccountId || null,
      supplierProductId: opts.supplierProductId,
      storageProvider: storage.id,
      storageKey: stored.key,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      checksum: stored.checksum,
      meta: (opts.meta || {}) as Prisma.InputJsonValue,
      inlineJson:
        storage.id === "db"
          ? (opts.payload as Prisma.InputJsonValue)
          : undefined,
    },
  });

  return {
    artifactId: artifact.id,
    storageKey: stored.key,
    storageProvider: storage.id,
  };
}

export async function loadSupplierRawPayload(artifactId: string): Promise<unknown | null> {
  const artifact = await prisma.supplierRawArtifact.findUnique({ where: { id: artifactId } });
  if (!artifact) return null;
  if (artifact.inlineJson != null) return artifact.inlineJson;

  const storage = getStorageProvider();
  // Prefer matching provider; fall back to filesystem if key was written there.
  if (artifact.storageProvider === "filesystem") {
    const fs = new FilesystemStorageProvider();
    const buf = await fs.get(artifact.storageKey);
    if (!buf) return null;
    return JSON.parse(buf.toString("utf8"));
  }
  if (artifact.storageProvider === storage.id) {
    const buf = await storage.get(artifact.storageKey);
    if (!buf) return null;
    return JSON.parse(buf.toString("utf8"));
  }
  return null;
}
