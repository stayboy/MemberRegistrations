import { expect, open, seedSession, test } from './fixtures';

test.describe('shell', () => {
  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  test('renders the brand, the top navigation and the section sidebar', async ({ page }) => {
    await open(page, '/members');

    await expect(
      page.getByRole('link', {
        name: 'Church Register, Member Registrations, go to Members',
      }),
    ).toBeVisible();
    await expect(page.getByText('Church Register', { exact: true })).toBeVisible();

    const topNav = page.getByRole('navigation', { name: 'Sections' });
    await expect(topNav.getByRole('link')).toHaveCount(6);
    await expect(topNav.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const sidebar = page.getByRole('complementary', { name: 'Members navigation' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'All members' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Members');
  });

  test('navigates Members → Events → Imports → Shepherding → USSD → Admin', async ({ page }) => {
    await open(page, '/members');
    const topNav = page.getByRole('navigation', { name: 'Sections' });

    await topNav.getByRole('link', { name: 'Events' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
    await expect(page).toHaveURL(/#\/events$/);
    await expect(
      page.getByRole('complementary', { name: 'Events navigation' }).getByRole('link', {
        name: 'Events',
      }),
    ).toHaveAttribute('aria-current', 'page');

    await topNav.getByRole('link', { name: 'Imports' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Member database' })).toBeVisible();
    await expect(page).toHaveURL(/#\/imports\/members$/);

    await topNav.getByRole('link', { name: 'Shepherding' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Shepherding officers' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/#\/shepherding\/officers$/);

    await topNav.getByRole('link', { name: 'USSD' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'USSD codes' })).toBeVisible();
    await expect(page).toHaveURL(/#\/ussd\/codes$/);

    await topNav.getByRole('link', { name: 'Admin' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ministries' })).toBeVisible();
    await expect(page).toHaveURL(/#\/admin\/ministries$/);
  });
});

test.describe('shell at 360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await seedSession(page);
  });

  test('collapses the top navigation to Sections and navigates with it', async ({ page }) => {
    await open(page, '/members');

    // The desktop link cluster is replaced by the compact control.
    await expect(page.getByRole('navigation', { name: 'Sections' })).toHaveCount(0);
    const sections = page.getByRole('button', { name: 'Sections' });
    await expect(sections).toBeVisible();

    // The sidebar stays as a rail, so the section's items are still reachable.
    const sidebar = page.getByRole('complementary', { name: 'Members navigation' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'All members' })).toBeVisible();

    await sections.click();
    await page.getByRole('menuitem', { name: 'Events' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Events' })).toBeVisible();
    await expect(page).toHaveURL(/#\/events$/);
    await expect(page.getByRole('complementary', { name: 'Events navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sections' })).toBeVisible();
  });
});
