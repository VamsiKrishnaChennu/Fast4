import { expect, test } from '@playwright/test';

test('the manifest has what an installable app needs', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('json');
  const m = await res.json();
  expect(m).toMatchObject({
    name: 'Fast Four',
    short_name: 'Fast Four',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  });
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('the service worker keeps the app shell and never caches the API', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  // A live API call goes through and is not stored.
  const status = await page.evaluate(async () => (await fetch('/api/health')).status);
  expect(status).toBe(200);
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys())
        urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  expect(cached.some((u) => u.startsWith('/api') || u.startsWith('/socket.io'))).toBe(false);
  expect(cached).toContain('/offline.html');

  // Offline: the app opens from the saved shell.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You are offline')).toHaveCount(0);
});

test('the offline page is served from the worker', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  const res = await page.evaluate(async () => {
    const r = await fetch('/offline.html');
    return { ok: r.ok, text: await r.text() };
  });
  expect(res.ok).toBe(true);
  expect(res.text).toContain('You are offline');
  await context.setOffline(false);
});
