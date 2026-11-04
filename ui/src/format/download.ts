/**
 * Triggers a browser download for an in-memory Blob and releases the object URL.
 *
 * Call sites:
 * - `pages/ImportsPage.tsx` — the member database Excel template.
 * - `pages/ImportsAttendancePage.tsx` — the attendance Excel template.
 *
 * Both imports fetch the template with the session bearer as a Blob, so a bare
 * `<a download>` cannot work (FR-41). The helper owns the whole lifecycle:
 * create the URL, click a detached anchor and revoke the URL on a later tick so
 * the browser has time to start the download.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
