import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

async function signUp(page, label) {
  const id = unique();
  const nickname = `${label}${id}`;
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByLabel('Email').fill(`${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  return nickname;
}

async function fitsWindow(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector('main');
    return (
      root.scrollHeight <= window.innerHeight + 1 &&
      root.scrollWidth <= window.innerWidth + 1 &&
      (main ? main.scrollHeight <= main.clientHeight + 1 : true)
    );
  });
}

async function twoInLobby(page, browser) {
  const hostName = await signUp(page, 'Host');
  await page.getByRole('link', { name: /Play with friends/ }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  const label = await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label');
  const code = label.replace('Room code ', '').replace(/ /g, '');
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  const guest = await context.newPage();
  const guestName = await signUp(guest, 'Gus');
  await guest.goto('/group?tab=join');
  await guest.getByLabel('Room code').fill(code.toLowerCase());
  await guest.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.getByText(`Waiting for ${hostName}`)).toBeVisible();
  return { hostName, guestName, guest };
}

test('lobby chat, report and block between two players', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const { hostName, guest } = await twoInLobby(page, browser);

  await page.getByRole('button', { name: /Open chat/ }).click();
  const hostChat = page.getByRole('dialog', { name: 'Chat' });
  await hostChat.getByRole('textbox', { name: 'Write a message' }).fill('hello <b>there</b>');
  await hostChat.getByRole('button', { name: 'Send' }).click();
  await expect(hostChat.getByText('hello <b>there</b>')).toBeVisible();

  await guest.getByRole('button', { name: /Open chat/ }).click();
  const guestChat = guest.getByRole('dialog', { name: 'Chat' });
  await expect(guestChat.getByText('hello <b>there</b>')).toBeVisible();

  // Report the message.
  await guestChat.getByRole('button', { name: `Actions for the message from ${hostName}` }).click();
  await guest.getByRole('button', { name: 'Report message' }).click();
  await guest.getByRole('radio', { name: 'Spam' }).check();
  await guest.getByRole('button', { name: 'Send report' }).click();
  await expect(guestChat.getByText('Thanks, we will take a look.')).toBeVisible();

  // Block the sender: the message disappears and new ones never show.
  await guestChat.getByRole('button', { name: `Actions for the message from ${hostName}` }).click();
  await guest.getByRole('button', { name: 'Block player' }).click();
  await guest.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(guestChat.getByText('hello <b>there</b>')).toHaveCount(0);
  await hostChat.getByRole('textbox', { name: 'Write a message' }).fill('second one');
  await hostChat.getByRole('button', { name: 'Send' }).click();
  await expect(hostChat.getByText('second one')).toBeVisible();
  await guest.waitForTimeout(500);
  await expect(guestChat.getByText('second one')).toHaveCount(0);

  // The blocked player is listed in Profile and can be unblocked.
  await guest.getByRole('button', { name: 'Close chat' }).click();
  await guest.goto('/profile/blocked');
  await expect(guest.getByTestId('blocked-row')).toContainText(hostName);
  await guest.getByRole('button', { name: `Unblock ${hostName}` }).click();
  await expect(guest.getByText('You have not blocked anyone.')).toBeVisible();
});

test('profile shows stats, lets you rename, and fits the desktop window', async ({ page }) => {
  const desktop = test.info().project.name === 'desktop-chrome';
  const nickname = await signUp(page, 'Pro');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click();
  await expect(page.getByRole('heading', { name: nickname })).toBeVisible();
  await expect(page.getByTestId('stats')).toBeVisible();
  await expect(page.getByText('No finished games yet.')).toBeVisible();
  if (desktop) expect(await fitsWindow(page)).toBe(true);
  const renamed = `Rn${unique()}`;
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.getByRole('textbox', { name: 'Nickname' }).fill(renamed);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: renamed })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ranks' }).click();
  await page.getByRole('radio', { name: 'Group' }).click();
  await expect(page.getByRole('button', { name: 'Points' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  if (desktop) expect(await fitsWindow(page)).toBe(true);
});
