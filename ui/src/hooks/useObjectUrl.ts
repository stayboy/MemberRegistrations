import { useEffect, useState } from 'react';

/**
 * An object URL for `blob` (MR-18), created after commit and revoked when the
 * blob changes or the last consumer unmounts.
 *
 * The URL is an external handle rather than derived data, so it cannot be built
 * during render: that would run a side effect in render, and Strict Mode would
 * discard the first URL without anything revoking it. The effect is the only
 * place left, and the assignment below is exempted from
 * `react-hooks/set-state-in-effect` on purpose: the effect synchronises the
 * browser's URL registry with the blob it was handed, and the state carries only
 * the resulting handle. The exemption lives here, once, for every consumer.
 */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  // The blob the URL was made from travels with it, so a URL from a previous blob
  // is never shown while the next one is being prepared.
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    // A null blob clears the handle as well as declining to make one: otherwise the
    // handle survives the gap and the same Blob instance coming back would match
    // `made.blob === blob` for a render, showing the URL the cleanup revoked.
    const next = blob ? { blob, url: URL.createObjectURL(blob) } : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see the hook comment
    setMade(next);
    return () => {
      if (next) URL.revokeObjectURL(next.url);
    };
  }, [blob]);

  return made && made.blob === blob ? made.url : null;
}
