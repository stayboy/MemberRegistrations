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

test('the toolbar carries the adopted switch and the pager, and a row opens its own menu', async ({
  page,
}) => {
  await open(page, '/members');

  // The switch replaces the status dropdown (triage: adopt), and the route still says which view it is.
  const includeArchived = page.getByRole('switch', { name: 'Archived' });
  await expect(includeArchived).toBeVisible();
  await expect(includeArchived).not.toBeChecked();

  // Paging is Prev/Next over the cursor, not a "load more".
  await expect(page.getByRole('button', { name: 'Prev' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();

  // The row action is one overflow menu, holding the row’s own actions.
  await page.getByRole('button', { name: 'More actions for Ama Mensah (Female) (M-1002)' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open member' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Contacts' })).toBeVisible();
});

test('the Include archived switch moves to the archived view', async ({ page }) => {
  await open(page, '/members');
  await page.getByRole('switch', { name: 'Archived' }).click();
  await expect(page).toHaveURL(/\/members\/archived/);
});

/** FR-78 fixes the note as one string; the test spells it out rather than importing it. */
const PRIVACY_NOTE =
  'Contact values are shown only after this explicit action. The members list returns a count, not the values; opening this dialog is the only way to see them here.';

/** FR-78/FR-81: each group's information button is named with this exact sentence. */
const GROUP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

test('the Contacts action opens the grouped contacts dialog', async ({ page }) => {
  await open(page, '/members');
  // A table-row control, not a page action: FR-9a scopes the menu to the action row.
  await page.getByRole('button', { name: 'Contacts · 2 for Kwame Asante (Male, 41y)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  // The whole note, not just its first sentence (FR-78).
  await expect(dialog.getByText(PRIVACY_NOTE, { exact: true })).toBeVisible();

  const phone = dialog.getByRole('region', { name: 'Phone' });
  const email = dialog.getByRole('region', { name: 'Email' });
  const whatsapp = dialog.getByRole('region', { name: 'WhatsApp' });

  // Every rendered group is a heading carrying the shared owned/linked affordance (FR-78).
  for (const [group, name] of [
    [phone, 'Phone'],
    [email, 'Email'],
    [whatsapp, 'WhatsApp'],
  ] as const) {
    const heading = group.getByRole('heading', { level: 3, name });
    await expect(heading).toBeVisible();
    // FR-78 puts the affordance on the heading row, not elsewhere in the group.
    await expect(
      heading.locator('xpath=..').getByRole('button', { name: GROUP_INFO, exact: true }),
    ).toBeVisible();
    // …and exactly one per group, so the row is the only place it lives.
    await expect(group.getByRole('button', { name: GROUP_INFO, exact: true })).toHaveCount(1);
  }

  await expect(phone).toContainText('+233 20 000 0001');
  await expect(email).toContainText('kwame.asante@example.test');
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
