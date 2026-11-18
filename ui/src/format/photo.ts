/**
 * The client's photo pipeline (MR-15, MR-20).
 *
 * Everything the register stores is produced here: the source is checked
 * against the 10 MiB cap, centre-cropped to a square, scaled to 512 x 512 and
 * re-encoded to WebP (JPEG where WebP is unavailable) on a canvas. The re-encode
 * drops EXIF and the original filename, so neither can reach the API (MR-21).
 *
 * `assertPhotoSource` stays pure so the gates are unit-tested without a canvas;
 * the decode/crop/encode half is unit-tested against a stubbed bitmap and canvas,
 * and the Playwright lane does not exercise it.
 */

export const PHOTO_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const PHOTO_OUTPUT_SIZE = 512;
export const PHOTO_QUALITY = 0.85;

export type EncodedPhotoContentType = 'image/webp' | 'image/jpeg';

export interface EncodedPhoto {
  readonly blob: Blob;
  readonly contentType: EncodedPhotoContentType;
}

/** The chosen source is over 10 MiB, so it is refused before any decode (MR-15). */
export class PhotoTooLargeError extends Error {
  constructor() {
    super('Choose an image under 10 MiB. The photo is reduced before it is uploaded.');
    this.name = 'PhotoTooLargeError';
  }
}

/** The chosen file is empty or not an image at all. */
export class PhotoUnsupportedError extends Error {
  constructor(message = 'Choose a WebP, JPEG or PNG image.') {
    super(message);
    this.name = 'PhotoUnsupportedError';
  }
}

/**
 * The pre-decode gates: a non-empty image file of at most 10 MiB. The magic
 * bytes are the server's job (MR-16); the client only ensures it has an image
 * worth decoding.
 */
export function assertPhotoSource(file: Blob): void {
  if (file.size > PHOTO_MAX_SOURCE_BYTES) throw new PhotoTooLargeError();
  if (file.size === 0) throw new PhotoUnsupportedError('The chosen file is empty.');
  if (file.type && !file.type.startsWith('image/')) {
    throw new PhotoUnsupportedError();
  }
}

interface DecodedImage {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  close(): void;
}

async function decode(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  // Older browsers without createImageBitmap still decode through an object URL.
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new PhotoUnsupportedError('That image could not be read.'));
      image.src = url;
    });
    return {
      image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, PHOTO_QUALITY);
  });
}

/** The shared centre-crop, 512 scale and WebP/JPEG re-encode (MR-15, MR-20). */
export async function encodePhoto(file: Blob): Promise<EncodedPhoto> {
  assertPhotoSource(file);

  const decoded = await decode(file);
  try {
    const side = Math.min(decoded.width, decoded.height);
    if (side <= 0) throw new PhotoUnsupportedError('That image has no drawable area.');

    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_OUTPUT_SIZE;
    canvas.height = PHOTO_OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new PhotoUnsupportedError('This browser cannot prepare the photo.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      decoded.image,
      Math.floor((decoded.width - side) / 2),
      Math.floor((decoded.height - side) / 2),
      side,
      side,
      0,
      0,
      PHOTO_OUTPUT_SIZE,
      PHOTO_OUTPUT_SIZE,
    );

    let blob = await canvasToBlob(canvas, 'image/webp');
    if (blob && blob.type === 'image/webp') return { blob, contentType: 'image/webp' };

    blob = await canvasToBlob(canvas, 'image/jpeg');
    if (blob && blob.type === 'image/jpeg') return { blob, contentType: 'image/jpeg' };

    throw new PhotoUnsupportedError('The photo could not be re-encoded in this browser.');
  } finally {
    decoded.close();
  }
}
