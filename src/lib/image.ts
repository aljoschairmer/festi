/**
 * Shared image constraints and server-side validation, used by the upload
 * server actions. Client-side processing (resize + WebP conversion) happens in
 * `imageProcessing.ts`; this module is the trusted server-side gate.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2000;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ImageValidationResult =
  | { ok: true; bytes: Uint8Array; contentType: string }
  | { ok: false; error: string };

/**
 * Validates an uploaded file: presence, MIME type, size, and magic-bytes
 * sniffing so a mislabeled content-type can't slip through.
 */
export async function validateImageUpload(
  file: unknown,
): Promise<ImageValidationResult> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No image file was provided." };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be 5MB or smaller." };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as never)) {
    return {
      ok: false,
      error: "Unsupported format. Use JPEG, PNG, or WebP.",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return { ok: false, error: "File does not appear to be a valid image." };
  }

  const size = readImageSize(bytes, sniffed);
  if (
    size &&
    (size.width > MAX_IMAGE_DIMENSION || size.height > MAX_IMAGE_DIMENSION)
  ) {
    return {
      ok: false,
      error: `Image must be at most ${MAX_IMAGE_DIMENSION}px on each side.`,
    };
  }

  return { ok: true, bytes, contentType: sniffed };
}

/**
 * Pixel dimensions straight from the file header. Returns null when they
 * cannot be determined — callers treat that as "cannot rule it out", not as
 * a failure, so an unusual but valid file is not rejected outright.
 */
function readImageSize(
  bytes: Uint8Array,
  contentType: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (contentType === "image/png") {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (contentType === "image/jpeg") {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = bytes[offset + 1];

        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          marker !== 0xc4 &&
          marker !== 0xc8 &&
          marker !== 0xcc
        ) {
          return {
            height: view.getUint16(offset + 5),
            width: view.getUint16(offset + 7),
          };
        }
        offset += 2 + view.getUint16(offset + 2);
      }
      return null;
    }
    if (contentType === "image/webp") {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === "VP8X") {
        const w = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
        const h = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
        return { width: w + 1, height: h + 1 };
      }
      if (chunk === "VP8 ") {
        return {
          width: view.getUint16(26, true) & 0x3fff,
          height: view.getUint16(28, true) & 0x3fff,
        };
      }
      if (chunk === "VP8L") {
        const bits =
          bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1,
        };
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Detects the real image type from magic bytes. Returns null if unknown. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
