"use client";

/**
 * Client-side image processing. Runs in the browser (canvas), so it works on
 * the Cloudflare Workers deployment where native libraries like `sharp` cannot.
 *
 * Resizing + re-encoding to WebP also strips EXIF/metadata and shrinks the
 * payload before it ever reaches the server.
 */

export const CLIENT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const CLIENT_MAX_INPUT_BYTES = 15 * 1024 * 1024;

export type ProcessImageOptions = {
  /** Max width/height of the output (image is scaled to fit, keeping ratio). */
  maxDimension?: number;
  /** WebP quality 0..1. */
  quality?: number;
  /** If true, crop to a centered square before resizing (avatars). */
  square?: boolean;
};

/**
 * Validates and converts a user-selected file into an optimized WebP `Blob`.
 * Throws with a user-friendly message on invalid input.
 */
export async function processImageToWebp(
  file: File,
  options: ProcessImageOptions = {},
): Promise<Blob> {
  const { maxDimension = 1024, quality = 0.82, square = false } = options;

  if (!CLIENT_ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Unsupported format. Use JPEG, PNG, or WebP.");
  }
  if (file.size > CLIENT_MAX_INPUT_BYTES) {
    throw new Error("Image is too large.");
  }

  const bitmap = await loadBitmap(file);

  try {
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;

    if (square) {
      const side = Math.min(bitmap.width, bitmap.height);
      sx = Math.floor((bitmap.width - side) / 2);
      sy = Math.floor((bitmap.height - side) / 2);
      sw = side;
      sh = side;
    }

    const scale = Math.min(1, maxDimension / Math.max(sw, sh));
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process image.");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("Could not process image.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error("File does not appear to be a valid image.");
  }
}
