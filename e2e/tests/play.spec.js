import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

async function signUp(page, label = 'Pl') {
  const id = unique();
  const nickname = `${label}${id}`;
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByLabel('Email').fill(`${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  return { nickname, email: `${id}@example.com` };
}

/** Desktop: nothing scrolls. Phones: long text scrolls down, but never sideways. */
const fits = (page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const desktop = window.innerWidth >= 900 && window.innerHeight >= 600;
    return (
      root.scrollWidth <= window.innerWidth + 1 &&
      (!desktop || root.scrollHeight <= window.innerHeight + 1)
    );
  });

for (const [path, heading] of [
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Use'],
  ['/delete-account', 'Delete account'],
]) {
  test(`${path} is public and does not overflow the window`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(await fits(page)).toBe(true);
    const viewport = page.viewportSize();
    if (viewport.width >= 900 && viewport.height >= 600) {
      // On desktop the text scrolls inside its own card.
      const card = page.locator('.ff-legaltext');
      await expect(card).toBeVisible();
      const box = await card.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
  });
}

test('the privacy policy and terms link to each other from signup and the footer', async ({
  page,
}) => {
  await page.goto('/signup');
  await page.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.getByTestId('privacy')).toContainText('support@example.com');
  await page.goBack();
  await page.getByRole('link', { name: 'Terms' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});

test('assetlinks.json is served for the Android app', async ({ request }) => {
  const res = await request.get('/.well-known/assetlinks.json');
  expect(res.status()).toBe(200);
  const [entry] = await res.json();
  expect(entry.target.package_name).toBe('com.npatarena.app');
  expect(entry.relation).toContain('delegate_permission/common.handle_all_urls');
});

test('deleting the account from Profile removes it for good', async ({ page }) => {
  const { email } = await signUp(page);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Delete account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Password', { exact: true }).fill('Wrong1234!');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('not right');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.goto('/home');
  await expect(page).toHaveURL(/\/login/);
});

test('the web page /delete-account works without the app: log in, delete', async ({ page }) => {
  const { email } = await signUp(page);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto('/delete-account');
  await page.getByRole('link', { name: 'Log in to delete my account' }).click();
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/delete-account/);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page
    .getByRole('dialog', { name: 'Delete your account?' })
    .getByLabel('Password', { exact: true })
    .fill(PASSWORD);
  await page
    .getByRole('dialog', { name: 'Delete your account?' })
    .getByRole('button', { name: 'Delete my account' })
    .click();
  await expect(page.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible();
});

test('a player who deletes the account leaves the live room', async ({ page, browser }) => {
  await signUp(page, 'Hos');
  await page.getByRole('link', { name: /Play with friends/ }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  const label = await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label');
  const code = label.replace('Room code ', '').replace(/ /g, '');
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  const guest = await context.newPage();
  const { nickname: guestName } = await signUp(guest, 'Gst');
  await guest.goto('/group?tab=join');
  await guest.getByLabel('Room code').fill(code.toLowerCase());
  await guest.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  await guest.goto('/profile');
  await guest.getByRole('button', { name: 'Delete account' }).click();
  const dialog = guest.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(guest.getByRole('heading', { name: 'Your account has been deleted' })).toBeVisible();
  await expect(page.getByText(guestName)).toHaveCount(0);
  await context.close();
});

test('the Back button asks before leaving a room, and Leave goes home', async ({ page }) => {
  await signUp(page);
  await page.getByRole('link', { name: /Play with friends/ }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  await page.goBack();
  const dialog = page.getByRole('dialog', { name: 'Leave this room?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();

  // The guard is back in place, so Back asks again.
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Leave room' }).click();
  await expect(page).toHaveURL(/\/home/);

  // No stray room page is left behind: Back from Home does not reopen the room.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/room\//);
});

test('the Back button asks before leaving a solo game', async ({ page }) => {
  test.setTimeout(60_000);
  await signUp(page);
  await page.goto('/single');
  await page.getByRole('button', { name: /Start/ }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Leave this game?' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible();
});
