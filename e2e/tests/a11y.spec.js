import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

async function signUp(page) {
  const id = unique();
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(`Ax${id}`);
  await page.getByLabel('Email').fill(`${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Ready, Ax${id}?`)).toBeVisible();
}

const found = [];
async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  for (const v of results.violations) {
    if (!['serious', 'critical'].includes(v.impact)) continue;
    found.push(
      `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
  }
}

for (const scheme of ['light', 'dark']) {
  test(`no serious accessibility violations on any screen (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of [
      '/',
      '/signup',
      '/login',
      '/forgot-password',
      '/privacy',
      '/terms',
      '/delete-account',
    ]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await scan(page, `${scheme} ${path}`);
    }
    await signUp(page);
    for (const path of ['/home', '/ranks', '/profile', '/profile/blocked', '/single', '/group']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await scan(page, `${scheme} ${path}`);
    }
    // The ranks Group tab and a lobby with the chat sheet open.
    await page.goto('/ranks');
    await page.getByRole('radio', { name: 'Group' }).click();
    await page.waitForLoadState('networkidle');
    await scan(page, `${scheme} ranks group`);
    await page.goto('/group');
    await page.getByRole('button', { name: 'Create room' }).click();
    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    await scan(page, `${scheme} lobby`);
    await page.getByRole('button', { name: /Open chat/ }).click();
    await scan(page, `${scheme} lobby chat`);
    expect(found).toEqual([]);
  });
}

test('a single-player round can be played with the keyboard alone', async ({ page }) => {
  test.setTimeout(90_000);
  await signUp(page);
  await page.goto('/single');
  await page.getByRole('radio', { name: '5 rounds', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /Start/ }).focus();
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await expect(name).toBeVisible({ timeout: 15_000 });
  await name.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Place', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Animal', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Thing', exact: true })).toBeFocused();
});
