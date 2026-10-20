// Private object storage abstraction. Nothing stored here is publicly reachable:
// downloads go through /api/v1/files/[id], which checks authorization and a short-lived signature
// (for S3 the route then redirects to a 60-second pre-signed URL).
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Optional direct-download URL (only issued after the app has authorized the request). */
  presignedGetUrl?(key: string, opts: { fileName: string; contentType: string; ttlSeconds: number }): Promise<string>;
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]*[a-z0-9]$/i;

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

class LocalDriver implements StorageDriver {
  readonly name = "local";
  constructor(private root: string) {}
  private resolve(key: string) {
    assertKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data, { flag: "wx" });
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/**
 * Amazon S3 (or S3-compatible) driver.
 * Env: S3_BUCKET (required), S3_REGION, S3_ENDPOINT + S3_FORCE_PATH_STYLE=true for S3-compatible stores,
 * S3_SSE ("aws:kms" default, "AES256", or "none"), S3_KMS_KEY_ID (optional), S3_CONDITIONAL_PUT=false.
 * Credentials come from the standard AWS chain (ECS task role, or AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY env vars for S3-compatible stores) — never from code.
 */
export class S3Driver implements StorageDriver {
  readonly name = "s3";
  constructor(
    private client: S3Client,
    private bucket: string,
  ) {}
  async put(key: string, data: Buffer, contentType: string) {
    assertKey(key);
    // S3_SSE=none for S3-compatible stores that encrypt at rest themselves (e.g. Supabase Storage).
    const sse = (process.env.S3_SSE ?? "aws:kms") as "aws:kms" | "AES256" | "none";
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ...(sse !== "none" ? { ServerSideEncryption: sse } : {}),
        ...(sse === "aws:kms" && process.env.S3_KMS_KEY_ID ? { SSEKMSKeyId: process.env.S3_KMS_KEY_ID } : {}),
        // Never overwrite an existing object (keys are random; this guards against bugs).
        // S3_CONDITIONAL_PUT=false for stores that do not support If-None-Match on PUT.
        ...(process.env.S3_CONDITIONAL_PUT !== "false" ? { IfNoneMatch: "*" } : {}),
      }),
    );
  }
  async get(key: string) {
    assertKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Empty object body");
    return Buffer.from(await res.Body.transformToByteArray());
  }
  async delete(key: string) {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async presignedGetUrl(key: string, opts: { fileName: string; contentType: string; ttlSeconds: number }) {
    assertKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${opts.fileName.replace(/"/g, "")}"`,
        ResponseContentType: opts.contentType,
      }),
      { expiresIn: opts.ttlSeconds },
    );
  }
}

export function createS3Driver(client?: S3Client) {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
  return new S3Driver(
    client ??
      new S3Client({
        region: process.env.S3_REGION ?? process.env.AWS_REGION ?? "ap-south-1",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      }),
    bucket,
  );
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) {
    driver = (process.env.STORAGE_DRIVER ?? "local") === "s3" ? createS3Driver() : new LocalDriver(path.resolve(process.env.STORAGE_LOCAL_DIR ?? "./storage"));
  }
  return driver;
}

/** Test hook: replace (or reset with null) the active driver. */
export function setStorageForTesting(d: StorageDriver | null) {
  driver = d;
}
