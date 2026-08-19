import "server-only";

import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2 storage client (S3-compatible).
 *
 * We talk to R2 over its S3 API using `aws4fetch`, which is tiny and runs on
 * the Cloudflare Workers runtime (unlike the full AWS SDK). Credentials come
 * from environment variables / Worker secrets.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let cached: { client: AwsClient; endpoint: string; publicUrl: string } | null =
  null;

function getR2() {
  if (cached) return cached;

  const accountId = requireEnv("R2_ACCOUNT_ID");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const bucket = requireEnv("R2_BUCKET_NAME");
  const publicUrl = requireEnv("R2_PUBLIC_URL").replace(/\/$/, "");

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

  cached = { client, endpoint, publicUrl };
  return cached;
}

/** Uploads (or overwrites) an object in R2 at the given key. */
export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const { client, endpoint } = getR2();
  const res = await client.fetch(`${endpoint}/${encodeKey(key)}`, {
    method: "PUT",
    body: body as BodyInit,
    headers: {
      "Content-Type": contentType,
      // Long cache; we bust it with a version query param on the stored URL.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${detail}`);
  }
}

/** Deletes an object from R2. Missing objects are treated as success. */
export async function deleteObject(key: string): Promise<void> {
  const { client, endpoint } = getR2();
  const res = await client.fetch(`${endpoint}/${encodeKey(key)}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 404) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 delete failed (${res.status}): ${detail}`);
  }
}

/** Builds the public URL for a stored object key. */
export function publicUrl(key: string): string {
  const { publicUrl } = getR2();
  return `${publicUrl}/${key}`;
}

/**
 * Recovers the object key from a stored public URL, so callers that only
 * kept the URL (every image row does) can still delete the object.
 * Returns null when the URL does not belong to our bucket.
 */
export function keyFromPublicUrl(url: string): string | null {
  const { publicUrl: base } = getR2();
  const prefix = `${base}/`;
  if (!url.startsWith(prefix)) return null;
  const encoded = url.slice(prefix.length).split("?")[0];
  try {
    return encoded.split("/").map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

// Encode each path segment but keep the slashes that define the folder layout.
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
