import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

// The e2e server uses the letters T, C, S, A, B and a small test dictionary.
const ROUNDS = [
  ['T', ['Tara', 'Tokyo', 'Tiger', 'Table']],
  ['C', ['Chris', 'Canada', 'Cat', 'Cup']],
  ['S', ['Sam', 'Spain', 'Seal', 'Sofa']],
  ['A', ['Alex', 'Albania', 'Ant', 'Apple']],
  ['B', ['Ben', 'Brazil', 'Bear', 'Bus']], // Brazil is not in the test dictionary
];

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
  return nickname;
}

async function typeAnswers(page, answers) {
  for (const [i, name] of ['Name', 'Place', 'Animal', 'Thing'].entries()) {
    await page.getByRole('textbox', { name, exact: true }).fill(answers[i]);
  }
}

/** True when neither the window nor the page itself has a scrollbar (desktop fit rule). */
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

test('three players play a five-round game from the lobby to the podium', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const desktop = test.info().project.name === 'desktop-chrome';
  const hostName = await signUp(page, 'Host');
  await page.getByRole('link', { name: /Play with friends/ }).click();
  for (let i = 10; i > 5; i -= 1) await page.getByRole('button', { name: 'Fewer rounds' }).click();
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  const label = await page.getByRole('img', { name: /^Room code/ }).getAttribute('aria-label');
  const code = label.replace('Room code ', '').replace(/ /g, '');

  const guests = [];
  for (const who of ['Ann', 'Bo']) {
    const person = await newPerson(browser, page);
    await signUp(person.page, who);
    await person.page.goto('/group?tab=join');
    await person.page.getByLabel('Room code').fill(code.toLowerCase());
    await person.page.getByRole('button', { name: 'Join room' }).click();
    await expect(person.page.getByText(`Waiting for ${hostName}`)).toBeVisible();
    guests.push(person);
  }
  const everyone = [page, ...guests.map((g) => g.page)];
  await expect(page.getByTestId('player-count')).toHaveText('3 of 8');
  await page.getByRole('button', { name: 'Start game' }).click();

  for (const [index, [letter, answers]] of ROUNDS.entries()) {
    for (const p of everyone) {
      await expect(p.getByText(`Round ${index + 1} of 5`)).toBeVisible();
      await expect(p.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(p.getByText(`Every answer must start with ${letter}.`)).toBeVisible();
    }

    if (index === 0) {
      // A reload in the middle of writing brings the typed answers back.
      const guest = guests[0].page;
      await guest.getByRole('textbox', { name: 'Name', exact: true }).fill('Tara');
      await guest.waitForTimeout(800);
      await guest.reload();
      await expect(guest.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Tara');
    }

    // The host presses Done first, then the others.
    await typeAnswers(page, answers);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('finished-banner')).toContainText('You finished first');
    if (desktop && index === 0) expect(await fitsWindow(page)).toBe(true);
    for (const g of guests) {
      await typeAnswers(g.page, answers);
      await g.page.getByRole('button', { name: 'Done' }).click();
      // The last Done ends the round at once, so only the earlier finishers see the banner.
      if (g !== guests.at(-1)) {
        await expect(g.page.getByTestId('finished-banner')).toContainText('You finished');
      }
    }

    // Everyone is done, so the round ends at once and the review opens.
    for (const p of everyone) {
      await expect(p.getByText(`Round ${index + 1} review`)).toBeVisible({ timeout: 10_000 });
    }
    const name = page.getByRole('region', { name: 'Name' });
    await expect(name.getByText(answers[0], { exact: true })).toHaveCount(3);
    await expect(name.getByText('Shared 5')).toHaveCount(3);
    const bonusHolder = index < 4 ? 'Bonus: You' : 'No bonus this round';
    await expect(page.getByTestId('review-bonus')).toContainText(bonusHolder);
    if (index === 4) {
      await expect(page.getByRole('region', { name: 'Place' }).getByText('Invalid 0')).toHaveCount(
        3,
      );
    }
    if (index === 0) {
      if (desktop) expect(await fitsWindow(page)).toBe(true);
      await expect(guests[0].page.getByRole('button', { name: 'Skip review' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Skip review' }).click();

    for (const p of everyone) {
      await expect(p.getByRole('heading', { name: 'Standings' })).toBeVisible();
    }
    if (index === 0) {
      await expect(page.getByTestId('my-round-score')).toHaveText('25');
      await expect(guests[0].page.getByTestId('my-round-score')).toHaveText('20');
      if (desktop) expect(await fitsWindow(page)).toBe(true);
    }
  }

  // The host won with four bonuses: 4 x 25 + 15. The others have 4 x 20 + 15.
  await expect(page.getByTestId('game-over-title')).toHaveText('You won!', { timeout: 15_000 });
  await expect(page.getByTestId('game-over-you')).toHaveText('You came first with 115 points.');
  for (const g of guests) {
    await expect(g.page.getByTestId('game-over-title')).toHaveText(`${hostName} wins!`);
    await expect(g.page.getByRole('button', { name: 'Play again' })).toHaveCount(0);
  }
  if (desktop) expect(await fitsWindow(page)).toBe(true);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(sideways).toBe(false);

  // Play again returns everyone to the lobby, scores cleared.
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  await expect(guests[0].page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
  for (const g of guests) await g.context.close();
});
