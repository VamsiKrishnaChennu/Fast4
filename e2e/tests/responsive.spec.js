import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

const WIDTHS = [
  { width: 360, height: 740 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
];
const SCREENS = ['/home', '/ranks', '/profile', '/profile/blocked', '/single', '/group'];

async function signUp(page) {
  const id = unique();
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(`Rs${id}`);
  await page.getByLabel('Email').fill(`${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Ready, Rs${id}?`)).toBeVisible();
}

/** Buttons, radios and tabs that are narrower or shorter than 44 px (inline text links are exempt). */
const smallTargets = (page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll(
        'button, [role="radio"], [role="switch"], input, select, textarea, nav a, .ff-btn',
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const hit = el.closest('.ff-switch-hit') ?? el.closest('label') ?? el;
        const h = hit.getBoundingClientRect();
        return (
          r.width > 0 &&
          style.visibility !== 'hidden' &&
          (Math.max(r.width, h.width) < 44 || Math.max(r.height, h.height) < 44)
        );
      })
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 20)}"`,
      ),
  );

test('no sideways scroll and large enough tap targets at 360, 768 and 1280 wide', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    for (const path of ['/', ...SCREENS]) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `${size.width}px ${path} scrolls sideways`).toBeLessThanOrEqual(1);
      if (size.width < 900) {
        expect(await smallTargets(page), `${size.width}px ${path} small targets`).toEqual([]);
      }
    }
  }
});
