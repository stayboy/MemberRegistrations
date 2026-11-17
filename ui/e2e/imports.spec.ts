import type { Page, Request } from 'playwright/test';
import { expect, open, seedSession, SESSION_TOKEN, storedValues, test } from './fixtures';

/**
 * The member import, end to end (UI spec AC-18, AC-19; FR-35-FR-39). The panel parses the file in the
 * browser and sends nothing until the operator confirms, so the request log is the evidence for the
 * AC that says "sends no request". AC-20's attendance cases are parked with the panel's open/close
 * defect (`documents/backlog.md`, "Remaining behavioural ACs behind the v2 mock catalogues").
 */

/**
 * Every non-GET request to the imports family, preflight included, so "sends no request" covers a
 * submission to any import route and not just the one pathname the test happens to upload to. The
 * page's own `GET /v1/imports/formats` is not a submission and is excluded.
 */
function watchUploads(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/gateway/v1/imports') && request.method() !== 'GET') {
      requests.push(request);
    }
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
  const uploads = watchUploads(page);
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
  const uploads = watchUploads(page);
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
  const uploads = watchUploads(page);
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
  await expect(result.getByTitle(MEMBER_BATCH.createdAt, { exact: true })).toBeVisible();

  // One confirmed import, one POST.
  expect(uploads.filter((request) => request.method() === 'POST')).toHaveLength(1);

  // AC-19's "the file contents are discarded": no row text survives in the DOM, and the input no
  // longer holds the file. Storage alone would pass while both still did.
  for (const value of ['Zebulon', 'Nkrumah-Quartey', 'Adwoa', 'M-7701', 'M-7702']) {
    await expect(page.getByText(value, { exact: false })).toHaveCount(0);
  }
  const filesHeld = await page
    .getByTestId('import-file')
    .evaluate((input) => (input as HTMLInputElement).files?.length ?? 0);
  expect(filesHeld).toBe(0);

  // FR-39: the batch metadata may remain for this tab, the file's rows may not. The seeded session is
  // the sentinel that proves the scan is reading a populated store; the batch id is deliberately not
  // required, because FR-39 says "may remain", not "must".
  const stored = await storedValues(page);
  expect(stored.session).toContain(SESSION_TOKEN);
  for (const value of ['Zebulon', 'Nkrumah-Quartey', 'Adwoa', 'M-7701', 'M-7702']) {
    expect(stored.session).not.toContain(value);
    expect(stored.local).not.toContain(value);
  }
});
