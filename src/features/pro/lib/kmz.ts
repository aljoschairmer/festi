import "server-only";

import { inflateRawSync } from "node:zlib";

/**
 * Minimal, dependency-free KMZ (zipped KML) reader — enough to extract the
 * stage lines from Tissot's full-route KMZ files. Mirrors the vendored
 * package's philosophy of parsing simple formats without pulling in a runtime
 * dependency. Anything unexpected returns null/[] instead of throwing.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/** Extracts the first .kml entry from a KMZ archive, or null. */
export function extractKml(archive: ArrayBuffer): string | null {
  const bytes = new Uint8Array(archive);
  if (bytes.length < 22) return null;
  const view = new DataView(archive);

  let eocd = -1;
  const scanEnd = Math.max(0, bytes.length - 22 - 65535);
  for (let offset = bytes.length - 22; offset >= scanEnd; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return null;

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let entry = 0; entry < entryCount; entry++) {
    if (offset + 46 > bytes.length) break;
    if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(
      bytes.subarray(offset + 46, offset + 46 + nameLength),
    );
    offset += 46 + nameLength + extraLength + commentLength;

    if (!name.toLowerCase().endsWith(".kml")) continue;
    if (localOffset + 30 > bytes.length) continue;
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) continue;

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);

    try {
      if (method === 0) return decoder.decode(data);
      if (method === 8) return decoder.decode(inflateRawSync(data));
    } catch {
      return null;
    }
  }
  return null;
}

export type KmlLine = {
  name: string | null;
  /** `[lng, lat]` pairs. */
  points: [number, number][];
};

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/**
 * Pulls every Placemark containing line geometry out of a KML document.
 * Point-only placemarks (start/finish pins) are skipped.
 */
export function parseKmlLines(xml: string): KmlLine[] {
  const lines: KmlLine[] = [];
  const placemarks = xml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];

  for (const placemark of placemarks) {
    const nameMatch = placemark.match(/<name>([\s\S]*?)<\/name>/);
    const name = nameMatch ? stripCdata(nameMatch[1]).trim() || null : null;

    const points: [number, number][] = [];
    const blocks =
      placemark.match(/<coordinates>([\s\S]*?)<\/coordinates>/g) ?? [];
    for (const block of blocks) {
      const inner = block.replace(/<\/?coordinates>/g, "");
      for (const token of inner.trim().split(/\s+/)) {
        const [lng, lat] = token.split(",").map(Number);
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          points.push([lng, lat]);
        }
      }
    }

    if (points.length >= 2) {
      lines.push({ name, points });
    }
  }
  return lines;
}
