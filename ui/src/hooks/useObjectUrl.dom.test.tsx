import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useObjectUrl } from './useObjectUrl';

let minted = 0;
const createObjectURL = vi.fn((_blob: Blob) => `blob:${++minted}`);
const revokeObjectURL = vi.fn();

beforeEach(() => {
  minted = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
});

describe('useObjectUrl (MR-18)', () => {
  it('makes a fresh URL when the same blob returns after a null gap', () => {
    const blob = new Blob(['photo-bytes'], { type: 'image/webp' });
    // Recorded per render: the bug is a *render* that returns the URL the cleanup
    // already revoked, which `result.current` after the effect can no longer show.
    const seen: Array<string | null> = [];
    const { result, rerender } = renderHook(
      ({ value }: { readonly value: Blob | null }) => {
        const url = useObjectUrl(value);
        seen.push(url);
        return url;
      },
      { initialProps: { value: blob as Blob | null } },
    );

    expect(result.current).toBe('blob:1');

    rerender({ value: null });
    expect(result.current).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:1');
    const afterGap = seen.length;

    // The registry entry is gone; handing back the identical instance must mint a
    // new URL rather than replay the revoked one for a render.
    rerender({ value: blob });
    expect(seen.slice(afterGap)).not.toContain('blob:1');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
    expect(result.current).toBe('blob:2');
    expect(result.current).not.toBe('blob:1');
  });
});
