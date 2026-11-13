import { expect, open, seedSession, test } from './fixtures';

test.beforeEach(async ({ page }) => {
  await seedSession(page);
});

test('the members list renders the fixture rows', async ({ page }) => {
  await open(page, '/members');

  const table = page.getByRole('table', { name: 'Members' });
  await expect(table).toBeVisible();
  // One header row plus the two fixture members.
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('link', { name: 'Kwame Asante (Male, 41y)' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Ama Mensah (Female)' })).toBeVisible();
  await expect(table.getByText('M-1001', { exact: true })).toBeVisible();
  await expect(table.getByText('M-1002', { exact: true })).toBeVisible();
  // The list carries counts only, never contact values (FR-78).
  await expect(page.getByText('+233 20 000 0001')).toHaveCount(0);
});

test('the Contacts action opens the grouped contacts dialog', async ({ page }) => {
  await open(page, '/members');
  // A table-row control, not a page action: FR-9a scopes the menu to the action row.
  await page.getByRole('button', { name: 'Contacts · 2 for Kwame Asante (Male, 41y)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Contact values are shown only after this explicit action.'),
  ).toBeVisible();

  await expect(dialog.getByRole('region', { name: 'Phone' })).toContainText('+233 20 000 0001');
  await expect(dialog.getByRole('region', { name: 'Email' })).toContainText(
    'kwame.asante@example.test',
  );
  const whatsapp = dialog.getByRole('region', { name: 'WhatsApp' });
  await expect(whatsapp).toContainText('+233 20 000 0009');
  await expect(whatsapp).toContainText('Linked · M-1002');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Contacts' })).toHaveCount(0);
});

test('the add-member route creates the member and lands on the detail', async ({ page }) => {
  await open(page, '/members/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add member' })).toBeVisible();

  await page.getByLabel('Member number').fill('M-1004');
  await page.getByLabel('First name').fill('Yaa');
  await page.getByLabel('Last name').fill('Owusu');

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/gateway/v1/members',
  );

  await page.getByRole('button', { name: 'Create member' }).click();
  const response = await created;

  expect(response.status()).toBe(201);
  expect(response.headers()['location']).toBe('/v1/members/M-1004');
  expect(response.request().postDataJSON()).toMatchObject({
    memberNo: 'M-1004',
    firstName: 'Yaa',
    lastName: 'Owusu',
  });

  // The created member is navigated to and fetched back by its route.
  await expect(page.getByRole('heading', { level: 1, name: 'Yaa Owusu' })).toBeVisible();
  await expect(page).toHaveURL(/#\/members\/M-1004$/);
  await expect(page.getByRole('tab', { name: /Overview/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Attendance/ })).toBeVisible();
});
