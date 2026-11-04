import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from './download';

interface FakeAnchor {
  href: string;
  download: string;
  rel: string;
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

describe('saveBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the object URL, clicks the anchor and revokes the URL afterwards', () => {
    const anchor: FakeAnchor = {
      href: '',
      download: '',
      rel: '',
      click: vi.fn(),
      remove: vi.fn(),
    };
    const append = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:template');
    const revokeObjectURL = vi.fn();
    let revokeLater: (() => void) | undefined;
    const setTimeout = vi.fn((handler: () => void) => {
      revokeLater = handler;
      return 1;
    });

    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('document', { body: { append }, createElement: vi.fn(() => anchor) });
    vi.stubGlobal('window', { setTimeout });

    const blob = new Blob(['xlsx']);

    saveBlob(blob, 'attendance-import-template.xlsx');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(anchor).toMatchObject({
      href: 'blob:template',
      download: 'attendance-import-template.xlsx',
      rel: 'noopener',
    });
    expect(append).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1_000);
    // The URL stays alive until the deferred callback runs.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    revokeLater?.();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:template');
  });
});
