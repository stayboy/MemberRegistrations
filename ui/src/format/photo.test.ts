import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertPhotoSource,
  encodePhoto,
  PHOTO_MAX_SOURCE_BYTES,
  PHOTO_OUTPUT_SIZE,
  PHOTO_QUALITY,
  PhotoTooLargeError,
  PhotoUnsupportedError,
} from './photo';

/**
 * MR-15's gates and the crop/encode half. The gates never reach a decoder; the
 * canvas is stubbed with the two platform calls the pipeline makes
 * (`createImageBitmap` and `document.createElement('canvas')`), so this file
 * asserts the geometry and the encoder choice without a browser.
 */

function fileOf(size: number, name: string, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

interface CanvasStub {
  readonly canvas: {
    width: number;
    height: number;
    getContext: (contextId: string) => unknown;
    toBlob: (callback: BlobCallback, type?: string) => void;
  };
  readonly context: { imageSmoothingEnabled: boolean; imageSmoothingQuality: string };
  readonly drawImage: ReturnType<typeof vi.fn>;
  readonly toBlob: ReturnType<typeof vi.fn>;
}

/** Installs a canvas whose `toBlob` answers through `encode(type)`. */
function stubCanvas(encode: (type: string) => Blob | null): CanvasStub {
  const drawImage = vi.fn();
  const context = { imageSmoothingEnabled: false, imageSmoothingQuality: 'low', drawImage };
  const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
    callback(encode(type ?? ''));
  });
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob,
  };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  return { canvas, context, drawImage, toBlob };
}

function stubBitmap(width: number, height: number): { close: ReturnType<typeof vi.fn> } {
  const bitmap = { width, height, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap) as unknown as typeof createImageBitmap,
  );
  return bitmap;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('photo pipeline gates', () => {
  it('refuses a source over 10 MiB', async () => {
    const oversized = fileOf(12 * 1024 * 1024, 'family.png', 'image/png');
    expect(() => assertPhotoSource(oversized)).toThrow(PhotoTooLargeError);
    await expect(encodePhoto(oversized)).rejects.toBeInstanceOf(PhotoTooLargeError);
  });

  it('accepts exactly 10 MiB at the gate', () => {
    const atLimit = fileOf(PHOTO_MAX_SOURCE_BYTES, 'family.png', 'image/png');
    expect(() => assertPhotoSource(atLimit)).not.toThrow();
  });

  it('refuses a non-image file before decoding', async () => {
    const text = fileOf(64, 'notes.txt', 'text/plain');
    expect(() => assertPhotoSource(text)).toThrow(PhotoUnsupportedError);
    await expect(encodePhoto(text)).rejects.toBeInstanceOf(PhotoUnsupportedError);
  });

  it('refuses an empty file', async () => {
    const empty = fileOf(0, 'empty.png', 'image/png');
    expect(() => assertPhotoSource(empty)).toThrow(PhotoUnsupportedError);
    await expect(encodePhoto(empty)).rejects.toBeInstanceOf(PhotoUnsupportedError);
  });
});

describe('photo crop and encode (MR-15, MR-20)', () => {
  it('centre-crops the shorter side and draws one 512 square as WebP', async () => {
    const bitmap = stubBitmap(1600, 900);
    const stub = stubCanvas((type) => new Blob(['encoded'], { type }));

    const result = await encodePhoto(fileOf(2048, 'family.png', 'image/png'));

    expect(stub.canvas.width).toBe(PHOTO_OUTPUT_SIZE);
    expect(stub.canvas.height).toBe(PHOTO_OUTPUT_SIZE);
    // The square is the 900 px short side, centred: 350 px in from the left.
    expect(stub.drawImage).toHaveBeenCalledWith(bitmap, 350, 0, 900, 900, 0, 0, 512, 512);
    expect(stub.context.imageSmoothingEnabled).toBe(true);
    expect(stub.context.imageSmoothingQuality).toBe('high');
    expect(stub.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', PHOTO_QUALITY);
    expect(result.contentType).toBe('image/webp');
    expect(result.blob.type).toBe('image/webp');
    // The decoded bitmap is released whether or not an encoder answered.
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to JPEG when the canvas cannot produce WebP', async () => {
    stubBitmap(600, 600);
    const stub = stubCanvas((type) =>
      type === 'image/webp' ? null : new Blob(['jpeg'], { type }),
    );

    const result = await encodePhoto(fileOf(2048, 'family.png', 'image/png'));

    expect(stub.toBlob.mock.calls.map((call) => call[1])).toEqual(['image/webp', 'image/jpeg']);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.blob.type).toBe('image/jpeg');
  });

  it('refuses when neither encoder answers with the type it asked for', async () => {
    // A browser that silently ignores the requested type answers PNG both times.
    const bitmap = stubBitmap(400, 400);
    stubCanvas(() => new Blob(['png'], { type: 'image/png' }));

    await expect(encodePhoto(fileOf(2048, 'family.png', 'image/png'))).rejects.toBeInstanceOf(
      PhotoUnsupportedError,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });

  it('refuses a decoded image with no drawable area', async () => {
    const bitmap = stubBitmap(0, 0);
    stubCanvas((type) => new Blob(['encoded'], { type }));

    await expect(encodePhoto(fileOf(2048, 'family.png', 'image/png'))).rejects.toBeInstanceOf(
      PhotoUnsupportedError,
    );
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});
