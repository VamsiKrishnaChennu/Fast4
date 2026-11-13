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

async function typeAnswers(page, answers) {
  for (const [i, name] of ['Name', 'Place', 'Animal', 'Thing'].entries()) {
    await page.getByRole('textbox', { name, exact: true }).fill(answers[i]);
  }
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

// The e2e server asks a fake word check: "tiger" is invalid, words starting with "tz" are valid, other words cannot be decided.
test('a challenge removes a word and an appeal adds one, live for both players', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const desktop = test.info().project.name === 'desktop-chrome';
  const hostName = await signUp(page, 'Host');
  await page.getByRole('link', { name: /Play with friends/ }).click();
  for (let i = 10; i > 5; i -= 1) await page.getByRole('button', { name: 'Fewer rounds' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  const label = await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label');
  const code = label.replace('Room code ', '').replace(/ /g, '');

  const context = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: test.info().project.use.baseURL,
  });
  const guest = await context.newPage();
  await signUp(guest, 'Gus');
  await guest.goto('/group?tab=join');
  await guest.getByLabel('Room code').fill(code.toLowerCase());
  await guest.getByRole('button', { name: 'Join room' }).click();
  await expect(guest.getByText(`Waiting for ${hostName}`)).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();

  for (const p of [page, guest]) {
    await expect(p.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
      timeout: 15_000,
    });
  }
  await typeAnswers(page, ['Tara', 'Tokyo', 'Tiger', 'Table']);
  await page.getByRole('button', { name: 'Done' }).click();
  // A made-up word, different in every run, because a won appeal joins the dictionary for good.
  const madeUp = `Tz${unique().replace(/[^a-z]/g, '')}q`;
  await typeAnswers(guest, ['Tom', 'Tokyo', 'Tiger', madeUp]);
  await guest.getByRole('button', { name: 'Done' }).click();

  for (const p of [page, guest]) {
    await expect(p.getByText('Round 1 review')).toBeVisible({ timeout: 10_000 });
    await expect(p.getByTestId('challenges-left')).toHaveText('3 challenges left');
  }
  if (desktop) {
    expect(await fitsWindow(page)).toBe(true);
    expect(await fitsWindow(guest)).toBe(true);
  }

  // Gus challenges the host's Tiger. The check says it is not a real match, so it is removed.
  await guest
    .getByRole('region', { name: 'Animal' })
    .getByRole('button', { name: 'Challenge Tiger' })
    .click();
  await expect(guest.getByRole('dialog')).toContainText('You have 3 left');
  await guest.getByRole('button', { name: 'Check it' }).click();
  for (const p of [page, guest]) {
    const animal = p.getByRole('region', { name: 'Animal' });
    await expect(animal.getByTestId('checked-animal')).toHaveText('Removed');
  }
  await expect(guest.getByTestId('challenges-left')).toHaveText('2 challenges left');
  await expect(page.getByTestId('challenges-left')).toHaveText('3 challenges left');

  // Gus appeals the made-up word. The check says it is a word, so it is accepted.
  await guest.getByRole('button', { name: `Appeal ${madeUp}` }).click();
  await guest.getByRole('button', { name: 'Check it' }).click();
  await expect(
    guest.getByRole('region', { name: 'Thing' }).getByTestId('checked-thing'),
  ).toHaveText('Accepted');
  await expect(page.getByRole('region', { name: 'Thing' }).getByTestId('checked-thing')).toHaveText(
    'Accepted',
  );
  await expect(guest.getByTestId('challenges-left')).toHaveText('1 challenge left');
  if (desktop) expect(await fitsWindow(guest)).toBe(true);

  // Gus's Tiger is now unique and so is his made-up word; the host lost a Tiger and the bonus.
  await expect(page.getByTestId('review-bonus')).toContainText('Bonus: ');
  await page.getByRole('button', { name: 'Skip review' }).click();
  await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();
  await context.close();
});
