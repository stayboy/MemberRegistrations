import type { Page, Request } from 'playwright/test';
import { expect, open, seedSession, test } from './fixtures';

/**
 * The two imports, end to end (UI spec AC-18, AC-19, AC-20; FR-35–FR-39). The panel parses the file
 * in the browser and sends nothing until the operator confirms, so the request log is the evidence
 * for the ACs that say "no request" or "the register is unchanged".
 */

const MEMBERS_UPLOAD = '/gateway/v1/imports/members';

/** Every request whose path is the upload route, preflight included, so "sends nothing" is literal. */
function watchUploads(page: Page, path: string): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) requests.push(request);
  });
  return requests;
}

function csv(lines: readonly string[]): Buffer {
  return Buffer.from(lines.join('\n'), 'utf8');
}

/** One member row per number, in the published column order (`GET /v1/imports/formats`). */
function memberRows(count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return `M-${String(number).padStart(5, '0')},First${number},Last${number}`;
  });
}

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

// --- AC-18: the API's limits are enforced before anything is sent ---------------------------------

test('a member CSV over the 10,000-row limit shows split guidance and sends nothing', async ({
  page,
}) => {
  const uploads = watchUploads(page, MEMBERS_UPLOAD);
  await open(page, '/imports/members');
  await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();

  await page.getByTestId('import-file').setInputFiles({
    name: 'members-10001.csv',
    mimeType: 'text/csv',
    buffer: csv(['memberNo,firstName,lastName', ...memberRows(10_001)]),
  });

  await expect(page.getByText('This file is over the import limit')).toBeVisible();
  await expect(
    page.getByText(
      'This file has 10001 rows; an import accepts at most 10000. Split the file and import each part separately.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 10001 members' })).toBeDisabled();

  // FR-35: the UI never chunks by itself, so the file is rejected without a request.
  expect(uploads).toEqual([]);
});

test('a member CSV whose serialised body passes 1,048,576 bytes shows split guidance and sends nothing', async ({
  page,
}) => {
  const uploads = watchUploads(page, MEMBERS_UPLOAD);
  await open(page, '/imports/members');
  await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();

  // One valid row, but one published cell alone is past the per-request byte budget.
  await page.getByTestId('import-file').setInputFiles({
    name: 'members-oversized.csv',
    mimeType: 'text/csv',
    buffer: csv(['memberNo,firstName,lastName', `M-BIG-1,${'x'.repeat(1_100_000)},Asante`]),
  });

  await expect(page.getByText('This file is over the import limit')).toBeVisible();
  await expect(
    page.getByText(
      /The parsed rows are \d+ bytes; an import accepts at most 1048576\. Split the file and import each part separately\./,
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 1 members' })).toBeDisabled();

  expect(uploads).toEqual([]);
});

// --- AC-19: a confirmed member import -------------------------------------------------------------

const MEMBER_BATCH = {
  id: 'batch-e2e-members-19',
  kind: 'members',
  actor: 'officer-1',
  rowCount: 2,
  checksum: 'sha256:4f9e2c1b7a',
  createdAt: '2026-01-05T10:00:00.000Z',
} as const;

test('a confirmed member import shows the batch summary and keeps no file contents in browser storage', async ({
  page,
  gateway,
}) => {
  gateway.importReply = () => ({ status: 201, body: MEMBER_BATCH });
  const uploads = watchUploads(page, MEMBERS_UPLOAD);
  await open(page, '/imports/members');

  await page.getByTestId('import-file').setInputFiles({
    name: 'members-two.csv',
    mimeType: 'text/csv',
    buffer: csv([
      'memberNo,firstName,lastName',
      'M-7701,Zebulon,Nkrumah-Quartey',
      'M-7702,Adwoa,Nkrumah-Quartey',
    ]),
  });

  await expect(page.getByRole('table', { name: 'Import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 members' }).click();

  // FR-36: the returned batch is shown as id, kind, row count, checksum and created time.
  const result = page.getByRole('table', { name: 'Import result' });
  await expect(result).toBeVisible();
  await expect(result.getByText('Batch id', { exact: true })).toBeVisible();
  await expect(result.getByText(MEMBER_BATCH.id, { exact: true })).toBeVisible();
  await expect(result.getByText('Kind', { exact: true })).toBeVisible();
  await expect(result.getByText(MEMBER_BATCH.kind, { exact: true })).toBeVisible();
  await expect(result.getByText('Rows', { exact: true })).toBeVisible();
  await expect(result.getByText(String(MEMBER_BATCH.rowCount), { exact: true })).toBeVisible();
  await expect(result.getByText('Checksum', { exact: true })).toBeVisible();
  await expect(result.getByText(MEMBER_BATCH.checksum, { exact: true })).toBeVisible();
  await expect(result.getByText('Created', { exact: true })).toBeVisible();
  // The displayed time is the batch's instant; its `title` keeps the exact UTC value.
  await expect(page.getByTitle(MEMBER_BATCH.createdAt, { exact: true })).toBeVisible();

  // One confirmed import, one POST.
  expect(uploads.filter((request) => request.method() === 'POST')).toHaveLength(1);

  // FR-39: the batch metadata may remain for this tab, the file's rows may not. Nothing pins the
  // stored key names, so a different (still compliant) shape cannot make this pass or fail wrongly.
  const stored = await page.evaluate(() => {
    const dump = (storage: Storage): string => {
      const values: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) ?? '';
        values.push(`${key}=${storage.getItem(key) ?? ''}`);
      }
      return values.join('\n');
    };
    return { session: dump(sessionStorage), local: dump(localStorage) };
  });

  expect(stored.session).toContain(MEMBER_BATCH.id);
  for (const value of ['Zebulon', 'Nkrumah-Quartey', 'Adwoa', 'M-7701', 'M-7702']) {
    expect(stored.session).not.toContain(value);
    expect(stored.local).not.toContain(value);
  }
});
