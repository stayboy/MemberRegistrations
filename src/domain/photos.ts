/**
 * The photo contract shared by the route and its tests (MR-16).
 *
 * The browser re-encodes the image, so the stored bytes are always one of these
 * three media types. The server trusts the magic bytes, never the client's
 * Content-Type alone, and never decodes or rewrites the payload.
 */

export const PHOTO_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

/** 2 MiB, the wire ceiling; the client's 512-square encode is far smaller. */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function startsWith(bytes: Uint8Array, prefix: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((value, index) => bytes[offset + index] === value);
}

/**
 * The media type the bytes themselves declare, or null when they are not a
 * WebP, JPEG or PNG. WEBP is `RIFF....WEBP`, JPEG starts `FF D8 FF`, and PNG
 * starts with its eight-byte signature.
 */
export function sniffPhotoType(bytes: Uint8Array): PhotoContentType | null {
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46], 0) &&
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  return null;
}

/** A wire Content-Type without parameters, lowercased, or the empty string. */
export function mediaTypeOf(header: string | undefined): string {
  return (header ?? '').split(';')[0]!.trim().toLowerCase();
}

export function isPhotoContentType(value: string): value is PhotoContentType {
  return (PHOTO_CONTENT_TYPES as readonly string[]).includes(value);
}
