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

/** FR-78/FR-81: the note's information button carries this exact sentence. */
const OWNERSHIP_INFO =
  'Owned values belong to this member. Linked values are shared from another member and stay with its owner.';

test('the Contacts action opens the flat contacts dialog', async ({ page }) => {
  await open(page, '/members');
  // A table-row control, not a page action: FR-9a scopes the menu to the action row.
  await page.getByRole('button', { name: 'Contacts · 2 for Kwame Asante (Male, 41y)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await expect(dialog).toBeVisible();
  // The whole note, not just its first sentence (FR-78).
  await expect(dialog.getByText(PRIVACY_NOTE, { exact: true })).toBeVisible();

  // FR-78/AC-47: one information affordance for the whole dialog, on the note and
  // named with the exact ownership sentence.
  const info = dialog.locator(`button[aria-label="${OWNERSHIP_INFO}"]`);
  await expect(info).toHaveCount(1);
  await expect(info).toBeVisible();

  // One flat list in the contract's kind order, each row carrying the kind, the
  // value and the owner/linked status at its right.
  const rows = dialog.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Phone');
  await expect(rows.nth(0)).toContainText('+233 20 000 0001');
  await expect(rows.nth(0)).toContainText('Owned');
  await expect(rows.nth(1)).toContainText('Email');
  await expect(rows.nth(1)).toContainText('kwame.asante@example.test');
  await expect(rows.nth(1)).toContainText('Owned');
  await expect(rows.nth(2)).toContainText('WhatsApp');
  await expect(rows.nth(2)).toContainText('+233 20 000 0009');
  await expect(rows.nth(2)).toContainText('Linked · M-1002');

  // AC-53's second half: the read-only call site offers no add, remove or edit.
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Add' })).toHaveCount(0);
  await expect(dialog.getByText('Add contact')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /^Remove / })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Contacts' })).toHaveCount(0);
});

/**
 * FR-78/AC-53: the member detail's dialog is the editable variant, and Save sends
 * `{ value }` only. The stubbed PUT rewrites the row, so the invalidated detail read
 * is what must show the new value.
 */
test('the member detail edits a contact value in place', async ({ page }) => {
  await open(page, '/members/M-1001');
  await page.getByRole('button', { name: 'View Contacts (2)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  await dialog.getByRole('button', { name: 'Edit phone +233 20 000 0001' }).click();

  const input = dialog.getByRole('textbox', { name: 'Edit contact value' });
  await expect(input).toHaveValue('+233 20 000 0001');
  await input.fill('+233 24 555 0101');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname === '/gateway/v1/members/M-1001/contacts/contact-1001-phone',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();

  const response = await saved;
  expect(response.status()).toBe(200);
  // The body is the value and nothing else: the kind stays uneditable this cycle.
  expect(response.request().postDataJSON()).toEqual({ value: '+233 24 555 0101' });

  // The row returns to display with the server's value.
  await expect(dialog.getByRole('listitem').filter({ hasText: '+233 24 555 0101' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Edit contact value' })).toHaveCount(0);
});

/**
 * AC-54: a duplicate value's 409 resolves its owner through the `contact` filter and
 * offers the household link; the linked row carries Unlink and no Remove, and
 * Unlink reverses it.
 */
test('a duplicate contact value offers the household link, then unlinks', async ({ page }) => {
  await open(page, '/members/M-1001');
  await page.getByRole('button', { name: 'View Contacts (2)' }).click();

  const dialog = page.getByRole('dialog', { name: 'Contacts' });
  // Owned by M-1002 in the fixture register.
  await dialog.getByRole('textbox', { name: 'Contact value' }).fill('+233 20 000 0002');
  await dialog.getByRole('button', { name: 'Add' }).click();

  // The inline error stands, and the offer names the owner and its member number.
  await expect(
    dialog.getByText('Contact value "+233 20 000 0002" already belongs to a member'),
  ).toBeVisible();
  await expect(dialog.getByText('Owned by Ama Mensah (Female) · M-1002')).toBeVisible();

  await dialog.getByRole('button', { name: "Link the household's value" }).click();

  const linkedRow = dialog.getByRole('listitem').filter({ hasText: '+233 20 000 0002' });
  await expect(linkedRow).toContainText('Linked · M-1002');
  await expect(
    linkedRow.getByRole('button', { name: 'Unlink phone +233 20 000 0002' }),
  ).toBeVisible();
  await expect(linkedRow.getByRole('button', { name: /^Remove / })).toHaveCount(0);

  await linkedRow.getByRole('button', { name: 'Unlink phone +233 20 000 0002' }).click();
  const confirm = page.getByRole('dialog', { name: 'Unlink +233 20 000 0002?' });
  await confirm.getByRole('button', { name: 'Unlink' }).click();

  // The value stays with M-1002 and leaves this member's list.
  await expect(dialog.getByRole('listitem').filter({ hasText: '+233 20 000 0002' })).toHaveCount(0);
});

test('the add-member route creates the member and lands on the detail', async ({ page }) => {
  await open(page, '/members/new');
  await expect(page.getByRole('heading', { level: 1, name: 'Add member' })).toBeVisible();

  await page.getByLabel('Member number').fill('M-1004');
  await page.getByLabel('First name').fill('Yaa');
  await page.getByLabel('Last name').fill('Owusu');
  // FR-29a: the three contact fields ride the one create request; the blank WhatsApp field
  // contributes no row at all.
  await page.getByLabel('Phone').fill('+233 24 555 0104');
  await page.getByLabel('Email').fill('yaa.owusu@example.test');

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
    contacts: [
      { kind: 'phone', value: '+233 24 555 0104' },
      { kind: 'email', value: 'yaa.owusu@example.test' },
    ],
  });

  // The created member is navigated to and fetched back by its route.
  await expect(page.getByRole('heading', { level: 1, name: 'Yaa Owusu' })).toBeVisible();
  await expect(page).toHaveURL(/#\/members\/M-1004$/);
  await expect(page.getByRole('tab', { name: /Overview/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Attendance/ })).toBeVisible();

  // AC-52's other half: the new member's detail shows them. The detail's own
  // View Contacts button opens the flat list, and the created value is read off a row.
  await page.getByRole('button', { name: 'View Contacts (2)' }).click();

  const contacts = page.getByRole('dialog', { name: 'Contacts' });
  await expect(contacts).toBeVisible();
  await expect(
    contacts.getByRole('listitem').filter({ hasText: '+233 24 555 0104' }),
  ).toBeVisible();
});

test('a contact value another member owns returns 409 against its field and keeps the form', async ({
  page,
}) => {
  await open(page, '/members/new');

  await page.getByLabel('Member number').fill('M-1007');
  await page.getByLabel('First name').fill('Akosua');
  await page.getByLabel('Last name').fill('Boateng');
  await page.getByLabel('Place of residence').fill('Adenta');
  // Owned by M-1002 in the fixture register.
  await page.getByLabel('Phone').fill('+233 20 000 0002');
  await page.getByLabel('Email').fill('akosua.boateng@example.test');

  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/gateway/v1/members',
  );

  await page.getByRole('button', { name: 'Create member' }).click();
  expect((await rejected).status()).toBe(409);

  // The message names the value and sits against that field (FR-29a/AC-52)…
  await expect(
    page.getByText('Contact value "+233 20 000 0002" already belongs to a member'),
  ).toBeVisible();
  await expect(page.getByLabel('Phone')).toHaveAttribute('aria-invalid', 'true');

  // …the create was atomic, so no member exists and the form stays open with every entered value…
  await expect(page).toHaveURL(/#\/members\/new$/);
  await expect(page.getByLabel('Member number')).toHaveValue('M-1007');
  await expect(page.getByLabel('First name')).toHaveValue('Akosua');
  await expect(page.getByLabel('Last name')).toHaveValue('Boateng');
  await expect(page.getByLabel('Place of residence')).toHaveValue('Adenta');
  await expect(page.getByLabel('Email')).toHaveValue('akosua.boateng@example.test');

  // …and the member-number field is not blamed for it.
  await expect(page.getByLabel('Member number')).not.toHaveAttribute('aria-invalid', 'true');
});
