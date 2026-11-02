import { expect, test } from '@playwright/test';

const PASSWORD = 'Test1234!';
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`.slice(-9);

/* Words for the fixed letters the e2e server uses. Brazil is not in the fixture dictionary, so
   round five scores 30 (three valid answers, no time bonus). */
const WORDS = {
  T: ['Tara', 'Tokyo', 'Tiger', 'Table'],
  C: ['Chris', 'Canada', 'Cat', 'Cup'],
  S: ['Sam', 'Spain', 'Seal', 'Sofa'],
  A: ['Alex', 'Albania', 'Ant', 'Apple'],
  B: ['Ben', 'Brazil', 'Bear', 'Bus'],
};
const FIELDS = ['Name', 'Place', 'Animal', 'Thing'];

async function signUp(page) {
  const id = unique();
  const nickname = `Solo${id}`;
  await page.goto('/signup');
  await page.getByLabel('Nickname').fill(nickname);
  await page.getByLabel('Email').fill(`${id}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  return nickname;
}

async function startGame(page, rounds = 5) {
  await page.getByRole('link', { name: /Play solo/ }).click();
  await page.getByRole('radio', { name: `${rounds} rounds`, exact: true }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText(`Round 1 of ${rounds}`)).toBeVisible();
}

async function currentLetter(page) {
  await expect(page.getByLabel('Name')).toBeVisible(); // the toss is over
  const hint = await page.locator('.ff-write__hint').innerText();
  return hint.match(/start with ([A-Z])/)[1];
}

async function fillRound(page, letter) {
  const words = WORDS[letter];
  for (let i = 0; i < FIELDS.length; i += 1) await page.getByLabel(FIELDS[i]).fill(words[i]);
}

/** Plays every round and returns the round scores. Calls `onScreen(name)` on each new screen. */
async function playGame(page, rounds = 5, onScreen = async () => {}) {
  const scores = [];
  for (let i = 0; i < rounds; i += 1) {
    const letter = await currentLetter(page);
    await fillRound(page, letter);
    if (i === 0) await onScreen('writing');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('round-score')).toBeVisible();
    if (i === 0) await onScreen('result');
    scores.push(Number(await page.getByTestId('round-score').innerText()));
    await page
      .getByRole('button', { name: i === rounds - 1 ? 'See results' : 'Next round' })
      .click();
  }
  await expect(page.getByTestId('final-score')).toBeVisible();
  await onScreen('summary');
  return scores;
}

test('play a whole 5-round game, see the summary, the home best and the ranks', async ({
  page,
}) => {
  const nickname = await signUp(page);
  await startGame(page);
  const scores = await playGame(page);

  // Four full rounds score 40 plus a time bonus; round five has three valid answers.
  for (const s of scores.slice(0, 4)) {
    expect(s).toBeGreaterThanOrEqual(40);
    expect(s).toBeLessThanOrEqual(50);
  }
  expect(scores[4]).toBe(30);
  const total = scores.reduce((a, b) => a + b, 0);
  await expect(page.getByTestId('final-score')).toHaveText(String(total));
  await expect(page.getByTestId('pb')).toBeVisible();
  await expect(page.getByText('points in 5 rounds')).toBeVisible();
  await expect(page.getByText('19/20')).toBeVisible();
  // The e2e database is shared by every test, so the exact rank today depends on earlier games.
  await expect(page.getByText(/^#\d+$/)).toBeVisible();

  await page.getByRole('button', { name: 'Back to home' }).click();
  await expect(page.getByText(`Ready, ${nickname}?`)).toBeVisible();
  await expect(page.getByText(String(total), { exact: true })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ranks' }).click();
  await page.getByRole('button', { name: 'All time' }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /^Rounds:/ }).click();
  await expect(page.getByRole('button', { name: 'Rounds: 5. Press to change.' })).toBeVisible();
  const mine = page.getByTestId('you');
  await expect(mine.getByText(String(total))).toBeVisible();
  await expect(page.getByRole('list', { name: 'Ranks' }).getByText(nickname)).toBeVisible();
});

test('reloading in the middle of a round resumes it with the typed answers', async ({ page }) => {
  await signUp(page);
  await startGame(page);
  await currentLetter(page);
  await page.getByLabel('Name').fill('Tara');
  await page.reload();
  await expect(page.getByText('Round 1 of 5')).toBeVisible();
  await expect(page.getByLabel('Name')).toHaveValue('Tara');
  await expect(page.getByTestId('clock')).toHaveText(/^0:(0\d|10)$/);
});

test('letting the timer run out scores the round with what was typed', async ({ page }) => {
  await signUp(page);
  await startGame(page);
  await currentLetter(page);
  await page.getByLabel('Name').fill('Tara');
  await expect(page.getByTestId('round-score')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('round-score')).toHaveText('10');
  await expect(page.getByText('1 of 4 valid')).toBeVisible();
});

test('leaving a game asks first and then goes home', async ({ page }) => {
  await signUp(page);
  await startGame(page);
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByText('Round 1 of 5')).toBeVisible();
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByText(/Ready, /)).toBeVisible();
});

test('no page scrolls sideways at 360px during a game', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout only.');
  await signUp(page);
  await startGame(page);
  const sideways = async (label) => {
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(over, label).toBeLessThanOrEqual(0);
  };
  await playGame(page, 5, sideways);
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
      test(`${size.width}x${size.height} ${theme}`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('ff-theme', t), theme);
        await page.setViewportSize(size);
        await signUp(page);
        await page.getByRole('link', { name: /Play solo/ }).click();
        await expect(page.getByText('How many rounds?')).toBeVisible();
        await noScroll(page, 'setup');
        await page.getByRole('radio', { name: '5 rounds', exact: true }).click();
        await page.getByRole('button', { name: 'Start game' }).click();
        await expect(page.getByText('Get ready')).toBeVisible();
        await noScroll(page, 'toss');
        await playGame(page, 5, async (name) => {
          // Fill state matters most: every answer typed is the tallest the writing screen gets.
          await noScroll(page, name);
        });
        await page.getByRole('button', { name: 'Back to home' }).click();
        await expect(page.getByText(/Ready, /)).toBeVisible();
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Ranks' })
          .click();
        await page.waitForLoadState('networkidle');
        await noScroll(page, 'ranks');
      });
    }
  }
});
