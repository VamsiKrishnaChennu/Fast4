import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

/** Opens another signed-out browser, like a second person on their own device. */
async function newPerson(browser, page) {
  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  return { context, page: await context.newPage() };
}

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
  return { nickname, email: `${id}@example.com` };
}

/** Host creates a room from the Home screen; returns its code. */
async function createRoom(page, { rounds } = {}) {
  await page.getByRole('link', { name: /Play with friends/ }).click();
  if (rounds) {
    for (let i = 10; i > rounds; i -= 1)
      await page.getByRole('button', { name: 'Fewer rounds' }).click();
    await expect(page.getByTestId('rounds-value')).toHaveText(String(rounds));
  }
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const label = await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label');
  return label.replace('Room code ', '').replace(/ /g, '');
}

async function joinByCode(page, code) {
  await page.goto('/group?tab=join');
  await page.getByLabel('Room code').fill(code.toLowerCase());
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
}

test('create a room, join by code, edit settings, see who is there, then start', async ({
  page,
  browser,
}) => {
  const host = await signUp(page, 'Host');
  const code = await createRoom(page, { rounds: 7 });
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(page.getByTestId('player-count')).toHaveText('1 of 8');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled();
  await expect(page.getByText('You need at least 2 players to start.')).toBeVisible();

  const guest = await newPerson(browser, page);
  const guestUser = await signUp(guest.page, 'Guest');
  await guest.page.goto('/group?tab=join');
  await guest.page.getByLabel('Room code').fill(code.toLowerCase());
  await expect(guest.page.getByTestId('preview')).toContainText(`${host.nickname}'s room`);
  await expect(guest.page.getByTestId('preview')).toContainText('7 rounds, 1 of 8 players');
  await guest.page.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.page.getByText(`Waiting for ${host.nickname}`)).toBeVisible();
  await expect(guest.page.getByText('7 rounds, up to 8 players')).toBeVisible();

  await expect(page.getByTestId('player-count')).toHaveText('2 of 8');
  await expect(page.getByText(guestUser.nickname)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeEnabled();

  // The host changes the settings; the guest sees them at once.
  await page.getByRole('button', { name: 'Edit' }).click();
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Fewer players' }).click();
  await expect(page.getByTestId('players-value')).toHaveText('4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('7 rounds, up to 4 players').first()).toBeVisible();
  await expect(guest.page.getByText('7 rounds, up to 4 players')).toBeVisible();
  await expect(page.getByTestId('player-count')).toHaveText('2 of 4');

  // The number of players cannot go below who is already there.
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Fewer players' }).click();
  await page.getByRole('button', { name: 'Fewer players' }).click();
  await expect(page.getByTestId('players-value')).toHaveText('2');
  await expect(page.getByRole('button', { name: 'Fewer players' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('Get ready!')).toBeVisible();
  await expect(guest.page.getByText('Get ready!')).toBeVisible();
  await guest.context.close();
});

test('a share link joins after logging in, and a second tab takes over', async ({
  page,
  browser,
}) => {
  await signUp(page, 'Host');
  const code = await createRoom(page);

  const guest = await newPerson(browser, page);
  const guestUser = await signUp(guest.page, 'Guest');
  await guest.page.goto(`/room/${code}`);
  await expect(guest.page.getByText(/Waiting for /)).toBeVisible();

  // Someone with no session opens the link: log in first, then land in the room.
  const visitor = await newPerson(browser, page);
  await visitor.page.goto(`/room/${code}`);
  await expect(visitor.page.getByText('Welcome back')).toBeVisible();
  await visitor.page.getByLabel('Email or phone').fill(guestUser.email);
  await visitor.page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await visitor.page.getByRole('button', { name: 'Log in' }).click();
  await expect(visitor.page.getByText(/Waiting for /)).toBeVisible();

  // The first tab of that player was disconnected by the takeover.
  await expect(guest.page.getByText('Opened somewhere else')).toBeVisible();
  await guest.page.getByRole('button', { name: 'Back to home' }).click();
  await expect(guest.page.getByText(/Ready, /)).toBeVisible();
  await expect(page.getByTestId('player-count')).toHaveText('2 of 8');
  await guest.context.close();
  await visitor.context.close();
});

test('the host removes a player, who is told and cannot come back', async ({ page, browser }) => {
  const host = await signUp(page, 'Host');
  const code = await createRoom(page);
  const guest = await newPerson(browser, page);
  const guestUser = await signUp(guest.page, 'Guest');
  await joinByCode(guest.page, code);
  await expect(page.getByText(guestUser.nickname)).toBeVisible();

  await page.getByRole('button', { name: `Options for ${guestUser.nickname}` }).click();
  await page.getByRole('button', { name: 'Remove from room' }).click();
  await expect(page.getByTestId('player-count')).toHaveText('1 of 8');

  const dialog = guest.page.getByRole('dialog', { name: 'You were removed' });
  await expect(dialog).toContainText(`${host.nickname}'s room`);
  await dialog.getByRole('button', { name: 'Back to home' }).click();
  await expect(guest.page.getByText(/Ready, /)).toBeVisible();

  await guest.page.goto('/group?tab=join');
  await guest.page.getByLabel('Room code').fill(code);
  await guest.page.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.page.getByText('You were removed from this room.')).toBeVisible();
  await guest.context.close();
});

test('a closed browser shows as reconnecting, and a wrong code says room not found', async ({
  page,
  browser,
}) => {
  await signUp(page, 'Host');
  const code = await createRoom(page);
  const guest = await newPerson(browser, page);
  const guestUser = await signUp(guest.page, 'Guest');
  await joinByCode(guest.page, code);
  await expect(page.getByText(guestUser.nickname)).toBeVisible();

  await guest.context.close();
  await expect(page.getByText('Reconnecting')).toBeVisible();

  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByText(/Ready, /)).toBeVisible();
  await page.goto('/group?tab=join');
  await page.getByLabel('Room code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Join room' }).click();
  const dialog = page.getByRole('dialog', { name: 'Room not found' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/room/ZZZZZZ');
  await expect(page.getByRole('dialog', { name: 'Room not found' })).toBeVisible();
});

test('the scoring sheet opens from the lobby', async ({ page }) => {
  await signUp(page, 'Host');
  await createRoom(page);
  await page.getByRole('button', { name: 'How scoring works' }).click();
  const sheet = page.getByRole('dialog', { name: 'How scoring works' });
  await expect(sheet).toContainText('Nobody else wrote it');
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet).toBeHidden();
});

test('no page scrolls sideways at 360px in the room screens', async ({
  page,
  browser,
  isMobile,
}) => {
  test.skip(!isMobile, 'Phone layout only.');
  await signUp(page, 'Host');
  const sideways = async (label) => {
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, label).toBeLessThanOrEqual(0);
  };
  await page.getByRole('link', { name: /Play with friends/ }).click();
  await sideways('create');
  await page.getByRole('radio', { name: 'Join room' }).click();
  await sideways('join');
  await page.getByRole('radio', { name: 'Create room' }).click();
  await page.getByRole('button', { name: 'Create room', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await sideways('lobby host');
  const code = (await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label'))
    .replace('Room code ', '')
    .replace(/ /g, '');
  const guest = await newPerson(browser, page);
  await signUp(guest.page, 'Guest');
  await joinByCode(guest.page, code);
  const over = await guest.page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  await guest.context.close();
});

test.describe('desktop web fits the window with no scrollbar', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop layout only.');
  const sizes = [
    { width: 1366, height: 650 },
    { width: 1280, height: 620 },
    { width: 1920, height: 940 },
  ];
  const noScroll = async (page, label) => {
    const m = await page.evaluate(() => {
      const el = document.querySelector('.ff-page');
      return {
        doc: document.documentElement.scrollHeight - window.innerHeight,
        side: document.documentElement.scrollWidth - window.innerWidth,
        page: el ? el.scrollHeight - el.clientHeight : 0,
      };
    });
    expect(m, label).toEqual({ doc: 0, side: 0, page: 0 });
  };

  for (const size of sizes) {
    for (const theme of ['light', 'dark']) {
      test(`${size.width}x${size.height} ${theme}`, async ({ page, browser }) => {
        await page.addInitScript((t) => localStorage.setItem('ff-theme', t), theme);
        await page.setViewportSize(size);
        await signUp(page, 'Host');
        await page.getByRole('link', { name: /Play with friends/ }).click();
        await noScroll(page, 'create');
        await page.getByRole('radio', { name: 'Join room' }).click();
        await page.getByLabel('Room code').fill('K7Q2MX');
        await noScroll(page, 'join');
        await page.getByRole('radio', { name: 'Create room' }).click();
        await page.getByRole('button', { name: 'Create room', exact: true }).last().click();
        await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
        const code = (
          await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label')
        )
          .replace('Room code ', '')
          .replace(/ /g, '');
        // Seven more players fill the list, the tallest the lobby gets.
        const others = [];
        for (let i = 0; i < 7; i += 1) {
          const person = await newPerson(browser, page);
          await signUp(person.page, `P${i}`);
          await joinByCode(person.page, code);
          others.push(person);
        }
        await expect(page.getByTestId('player-count')).toHaveText('8 of 8');
        await noScroll(page, 'lobby host with 8 players');
        await expect(others[0].page.getByText(/Waiting for /)).toBeVisible();
        await others[0].page.setViewportSize(size);
        await noScroll(others[0].page, 'lobby player with 8 players');
        for (const o of others) await o.context.close();
      });
    }
  }
});
