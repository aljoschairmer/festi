import { describe, expect, it } from "vitest";
import { MAX_IMAGE_DIMENSION, validateImageUpload } from "./image";

/**
 * Guards the fix for A-16. `MAX_IMAGE_DIMENSION` was declared but never
 * enforced: the browser resizes before upload, so a client that skips the
 * browser could store a decompression bomb. The dimensions are read from the
 * file header rather than by decoding the image, so these fixtures are the
 * smallest byte sequences that carry a size.
 */

function pngWith(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function jpegWith(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(20);
  bytes.set([0xff, 0xd8, 0xff], 0);
  bytes[3] = 0xc0;
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 11);
  bytes[6] = 8;
  view.setUint16(7, height);
  view.setUint16(9, width);
  return bytes;
}

const asFile = (bytes: Uint8Array, type: string) =>
  new File([bytes as unknown as BlobPart], "upload", { type });

describe("validateImageUpload — dimensions", () => {
  it("accepts a PNG within the limit", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(1024, 768), "image/png"),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a PNG wider than the limit", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(MAX_IMAGE_DIMENSION + 1, 100), "image/png"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/at most/i);
  });

  it("rejects a PNG taller than the limit", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(100, MAX_IMAGE_DIMENSION + 1), "image/png"),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a decompression bomb — 30000 × 30000 in 33 bytes", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(30000, 30000), "image/png"),
    );
    expect(result.ok).toBe(false);
  });

  it("reads JPEG dimensions from the frame header", async () => {
    const ok = await validateImageUpload(
      asFile(jpegWith(800, 600), "image/jpeg"),
    );
    expect(ok.ok).toBe(true);

    const tooBig = await validateImageUpload(
      asFile(jpegWith(9000, 600), "image/jpeg"),
    );
    expect(tooBig.ok).toBe(false);
  });
});

describe("validateImageUpload — content sniffing", () => {
  it("rejects text renamed to .png, even with a matching MIME type", async () => {
    const text = new TextEncoder().encode("this is not an image at all");
    const result = await validateImageUpload(asFile(text, "image/png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/valid image/i);
  });

  it("rejects an empty file", async () => {
    const result = await validateImageUpload(
      asFile(new Uint8Array(0), "image/png"),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a disallowed MIME type", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(10, 10), "image/gif"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JPEG, PNG, or WebP/i);
  });

  it("reports the sniffed type, not the claimed one", async () => {
    const result = await validateImageUpload(
      asFile(pngWith(10, 10), "image/jpeg"),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contentType).toBe("image/png");
  });
});
