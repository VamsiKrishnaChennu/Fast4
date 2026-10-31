import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

async function signUp(page, { nickname, email, phone } = {}) {
  const id = unique();
  nickname ??= `Player${id}`;
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(nickname);
  if (phone) {
    await page.getByRole('radio', { name: 'Phone' }).click();
    await page.getByLabel('Phone').fill(phone);
  } else {
    await page.getByLabel('Email').fill(email ?? `${id}@example.com`);
  }
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  return nickname;
}

test('sign up by email, reload keeps the session, log out and log in again', async ({ page }) => {
  const id = unique();
  const email = `${id}@example.com`;
  const nickname = await signUp(page, { email });
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();

  await page.reload();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByText('Welcome back')).toBeVisible();

  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
});

test('sign up with a phone number', async ({ page }) => {
  const digits = String(Date.now()).slice(-9);
  const nickname = await signUp(page, { phone: `+1415${digits}` });
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
});

test('a taken nickname is reported on the field', async ({ page, browser }) => {
  const nickname = await signUp(page);
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  const other = await browser.newPage();
  await signUp(other, { nickname: nickname.toUpperCase() });
  await expect(other.getByText('That nickname is already in use.')).toBeVisible();
  await other.close();
});

test('wrong password shows the generic message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Wrong1234');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid credentials.');
});

test('signed-out visitors are sent to log in from a protected page', async ({ page }) => {
  await page.goto('/profile');
  await expect(page.getByText('Welcome back')).toBeVisible();
});

test('forgot password: email link sets a new password', async ({ page, request }) => {
  const id = unique();
  const email = `${id}@example.com`;
  const nickname = await signUp(page, { email });
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await page.getByRole('button', { name: 'Log out' }).click();

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('Check your email')).toBeVisible();

  let link;
  await expect
    .poll(async () => {
      const outbox = await (await request.get('/__e2e/outbox')).json();
      const mail = outbox.filter((m) => m.to === email).at(-1);
      link = mail?.text.match(/https?:\/\/\S+\/reset-password\?token=\S+/)?.[0];
      return Boolean(link);
    })
    .toBe(true);
  const url = new URL(link);
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByLabel('New password').fill('Brand-new1');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password updated')).toBeVisible();

  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByLabel('Email or phone').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Brand-new1');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();

  // A used link is refused when it is submitted again.
  await page.goto(`${url.pathname}${url.search}`);
  await page.getByLabel('New password').fill('Another-pass2');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('This link has expired')).toBeVisible();
});

test('dark mode switch changes the theme and survives a reload', async ({ page }) => {
  const nickname = await signUp(page);
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('switch', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('no page scrolls sideways at 360px and the console stays clean', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const check = async () => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  };
  for (const path of [
    '/',
    '/signup',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/nowhere',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await check();
  }
  const nickname = await signUp(page);
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  await check();
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await expect(page.getByRole('switch', { name: 'Dark mode' })).toBeVisible();
  await check();
  expect(errors).toEqual([]);
});

test('touch targets are at least 44px', async ({ page }) => {
  await page.goto('/signup');
  for (const locator of [
    page.getByRole('button', { name: 'Create account' }),
    page.getByRole('radio', { name: 'Email' }),
    page.getByRole('radio', { name: 'Colour 2' }),
    page.getByRole('button', { name: 'Show password' }),
    page.getByRole('link', { name: 'Back' }),
  ]) {
    const box = await locator.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
