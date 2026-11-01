# Decisions

Source of truth for the spec is the project transcript (Final decisions) and the three playbooks. Entries here record changes and choices made while building.

## 2026-10-30

- **Package id:** `com.npatarena.app` (permanent after first Play upload). A single word is not a valid Android package id; two or more dot-separated segments are required.
- **Publisher:** Chennu Vamsi Krishna, India. Personal Play developer account assumed (closed test of 12 testers for 14 days applies).
- **Contact email:** creatiquework@gmail.com for support, admin account and the Wikimedia User-Agent contact. It is public (privacy page, terms, delete-account page, Play listing).
- **Domain:** none. APP_ORIGIN is the hosting subdomain. Changing it later needs a new Android release.
- **Database name:** `npatarena` (local and Atlas).
- **Fonts:** Baloo 2 and Nunito, self-hosted through npm (@fontsource, latin subsets). No Google Fonts CDN, so players' IPs are not sent to Google and the strict CSP stays valid.
- **Forgot password:** kept in v1 (supersedes the playbook's Phase 2 deferral). Email reset only, sent through Gmail SMTP with an app password using the contact email. Phone-only accounts cannot self-reset and are told to email support. Email verification and SMS OTP stay out of v1 (OTP_VERIFICATION_ENABLED=false). The privacy policy and Data safety form must list Google (Gmail SMTP) as the processor of reset emails.
- **Dark mode:** a toggle row in Profile directly under "Avatar colour", switch on the right. Default follows the phone setting until the player toggles; the choice is saved on the device (localStorage key `ff-theme`).
- **Sounds:** skipped for now. Phase 10's sound toggle is removed.
- **Hosting (default):** Render, region Singapore; Atlas in a nearby Singapore region.
- **ESLint:** pinned to 9 (eslint-plugin-react does not support 10).
- **Designs still to create** (in the phase that needs them, in both themes): Forgot password, Check your email, Reset password, Link expired (Phase 2); Terms of use page, Edit nickname, About/WordNet notice, Profile dark-mode row (Phase 9/12).
- **Mongo URI:** `mongodb://localhost:27017/npatarena`. The string `mongodb://localhost:27017/npat/npatarena` is not valid because a database name cannot contain a slash; the first path segment would be taken as the database.
- **.env files** are git-ignored (`.env`, `.env.*`) and kept only on the local machine and in host secrets.
- **No `.env.example` files** (owner's decision, 2026-10-31). The playbooks and project guardrails asked for them; the setting names, defaults and meanings are documented in `docs/ENV.md` instead (names only, no values that are secret).
- **Phase 1 sandbox limit:** the build sandbox cannot download the MongoDB binary, so database-backed integration tests run in CI.

## 2026-10-31 (Phase 2)

- **Sessions collection.** Refresh sessions live in their own `Session` collection (userId, jti, expiresAt) instead of an array on the user. Rotation deletes the old session atomically, so a reused or simultaneous refresh with the same token fails. At most 10 sessions per account (oldest dropped); expired ones are pruned at login. No TTL index is used (kept portable).
- **Password reset.** Token is 32 random bytes, only its SHA-256 hash is stored on the user, valid 30 minutes, single use. A successful reset changes the password, bumps `tokenVersion` (all access tokens die) and deletes every session. `POST /auth/forgot` always answers 204, and sending happens in the background so timing does not reveal whether the email exists. Accounts with no email (phone only) get no email and are told to contact support.
- **Rate limits.** The strict 10 per 15 minutes limit applies to signup, login, forgot and reset. Refresh, logout and me use the general API limit, because refresh runs on every page load and several players can share one IP.
- **Session hint.** The client stores a harmless flag (`ff-session`) after a successful sign in. Without it an anonymous visitor makes no refresh request (no console error on first load). The access token itself is never stored.
- **After logout** the next login goes to Home, not to the page the player left.
- **CSP.** The theme-before-paint script is a separate file (`/theme-init.js`) because the strict CSP blocks inline scripts.
- **Mongoose `sanitizeFilter`** is on in production and in tests. Server filters that use `$` operators must wrap them in `mongoose.trusted(...)`.
- **Avatar palette:** 12 colours, in the order of the approved design (yellow, blue, green, red, navy, purple) plus six more.
- **Privacy follow-up (Phase 12):** the privacy policy and Data safety form must list Google (Gmail SMTP) as the processor of password reset emails.
- **Test database in the build sandbox.** MongoDB's binary cannot be downloaded there, so I ran the database tests against FerretDB (set `TEST_MONGODB_URI=mongodb://127.0.0.1:27018`). CI and normal machines use the real MongoDB through mongodb-memory-server.

## 2026-10-31 (Desktop web layout, standing rule for all phases)

- **Rule (owner):** on desktop web, every screen fits the browser window with no scrollbar. Home, for example, shows everything at once. The phone layout is approved and must not change.
- **How it works:** from 900 px wide the app uses a desktop layout: pages become two columns (picture or board on the left, content on the right), the back button sits in the top-left corner, the bottom tabs become a 96 px rail on the left, and controls are slightly more compact. In "fit mode" (window at least 600 px tall) the page itself never scrolls. A shorter window falls back to normal scrolling so nothing is unreachable. Phones and tablets under 900 px keep the phone layout.
- **Building blocks (client/src/styles/custom.css):** `ff-grid2` (two-column grid), `ff-g-art` (left column), `ff-g-head` (top-left header), `ff-g-main` (right column), `ff-contents-lg` (flatten a wrapper on desktop), `ff-desktop-only`, `ff-page--wide` and `ff-page--narrow`. New screens use these, and any screen that cannot fit is split or compacted rather than scrolled.
- **Checks:** the end-to-end suite measures that no page or document scrolls at 1366x650, 1280x620 and 1920x940 in light and dark, including the sign-up form with every error showing. Long lists that must scroll (leaderboards, chat, history) scroll inside their own panel, never the page.
- Signup, Welcome, Log in, Forgot password, Home and Profile were reworked for desktop; Reset password and the placeholder pages use a centred narrow card.

## 2026-11-01 (Phase 3)

- **Plural handling in the dictionary.** Typing a simple plural counts as the singular word: the validator tries the last word's singular forms ("tigers" finds "tiger", "horses" finds "horse", "cities" finds "city"). The playbook only said plurals fold for matching; without this, "Tigers" would be rejected because WordNet lists singular words.
- **`matchKey` also ignores spaces.** The playbook text and its own test table disagree ("ice cream" and "ice-cream" must match). The key removes spaces, hyphens and apostrophes, drops a leading "the" (places) and folds a simple plural on the last word. Words of three letters or fewer keep their final s (bus, gas). Known limit: "horse" and "horses" get different keys (the rule cannot tell horses from buses); they only lose the "shared" score.
- **Data sources.** Names: NLTK names list, SSA baby names when reachable, curated list. Places: Wikidata when reachable plus curated lists plus `world-countries`. Animals and things: WordNet 3.1 (`wordnet-db`). Build-only packages (`wordnet-db`, `world-countries`, `fflate`) are dev dependencies of the server.
- **Things exclude** animals, people and locations (WordNet branches) and anything already in the names, places or animals lists, except a short list of words that are also everyday things (apple, bat, seal, crane, cricket, jaguar, mercury).
- **Word check built early.** `judgeService` is fully implemented in Phase 3 (the accuracy spike needs it). It uses an in-memory cache until Phase 8 adds the MongoDB cache. Back-off: HTTP 429 blocks that source for the `Retry-After` time (2 seconds by default).
- **Wikidata class ids** (given name Q202444, male Q12308941, female Q11879590, unisex Q3409032, geographic location Q2221906, Animalia Q729) are from memory and are verified by the first step of `npm run judge:evaluate`.
- **`/ready`** now requires the database and a loaded dictionary with words in all four categories.

## 2026-11-01 (word-check accuracy run 1)

- The first live run showed the word check fails when asked too fast: HTTP 429 or timeouts, and the 2 second back-off then failed every following word. The evaluate script now paces itself and retries. In production, challenges are rare and one at a time per room, so the back-off is acceptable, but it must be watched in the logs (`JudgeUnavailableError.reason` records timeout, network or http status).
- The Wikidata place and animal queries were made lighter (single lookups instead of walking the whole class tree). The Wikidata class id for "geographic location" is no longer used.

## 2026-11-01 (word-check accuracy run 2)

- **Place rule** changed from "has coordinates, a country or an administrative parent" (too loose: 30% of everyday words passed) to "instance of a place class or a subclass within three steps". Only the three best Wikidata matches are examined.
- **Animal rule** uses the forward-walk hint to finish inside the time limit.
- **Open question for the owner (thing):** the Free Dictionary API says "not found" for some ordinary nouns (table, window, bottle, piano, guitar, clock, mirror, envelope). If run 3 confirms it, a challenge against such a word would wrongly remove it. Options to decide then: (a) treat "not found" as inconclusive so a challenge against a word the local dictionary accepts cannot overturn it on the API's word alone, (b) add a second source for things, or (c) accept the risk. (a) is the safe default.

## 2026-11-01 (word-check accuracy run 3)

- Place passes the accuracy target. Names passed in run 1.
- **Animals** now examine ten candidates (not three) and get a dictionary second opinion when Wikidata does not confirm the animal. This extends the playbook, which only used the dictionary when Wikidata was inconclusive. It trades a small risk of accepting a non-animal whose dictionary meaning mentions an animal word for far fewer wrongly rejected real animals.
- Things were resolved in run 4 and run 5 (see below).

## 2026-11-01 (word-check accuracy run 4)

- The Free Dictionary API returns an HTML "ERROR 404" page for some real words (window, piano). **Change to the Final decision "404 = invalid":** only the API's JSON "No Definitions Found" 404 is invalid; any other 404 is inconclusive (a failed challenge, never a wrong overturn). Animals use the same rule for the dictionary second opinion, and the animal query also follows "subclass of" links to Animalia.
- Second source for things: decided not to add one (see the entry below).

## 2026-11-01 (word-check accuracy accepted)

- Run 5 passed for animal and thing; all categories meet the Development Playbook 8.5 targets. Known limits: kangaroo and mongoose are wrongly rejected as animals, helmet is accepted. The thing check leaves some real nouns inconclusive (HTML 404 from the dictionary API). **No second source for things:** the dictionary API already gives 100% accuracy on definitive results; a Wikidata label check would add a new rule and a new failure mode (Wikidata lists many non-nouns and proper names as labels) to rescue words that are only inconclusive, which already leaves the verdict unchanged and costs the challenger nothing. Not worth the added design.

## 2026-11-01 (Phase 5: single-player mode)

- **Writing starts after the toss.** `rounds/next` returns the letter at once, but `startedAt` is "now + 4 seconds" (the toss) and `endsAt` is 60 seconds after that. The 60 seconds are never spent on the animation, and the time bonus is measured from `startedAt`. The playbook says the timer starts when the round is requested; this is the fairer reading of "the client runs the toss, then shows the letter".
- **Daily and weekly ranks are rolling windows** (last 24 hours, last 7 days), so they do not depend on a time zone. The game over screen's "Today" figure is the rank in the daily window.
- **Done needs four well-formed answers** (right first letter, 2 to 30 characters). When the timer runs out the screen sends whatever is typed, so a player can still score with partial answers.
- **The next round starts by itself 6 seconds after the result card** (playbook section 15), and the Next round button skips the wait.
- **Typed answers are kept in the browser tab** (sessionStorage) so a reload mid-round restores them. They are cleared with the tab; nothing is sent to the server until Done.
- **Added `SUBMIT_GRACE_MS` (1500)** to the shared limits for the playbook's "accepted until endsAt + 1.5 s". Added test-only `TEST_LETTER_REVEAL_MS` next to `TEST_ROUND_SECONDS`; both are ignored unless `NODE_ENV` is test.
- **Ranks use one flat index** `{ mode, status, settings.rounds, totalScore, totalTimeMs }` and a top-1,000 scan with one entry per player, instead of the playbook's `players.0.totalScore` index. The Ranks page ships with the Solo tab now; the Group tab says it arrives with group games (Phase 9).
- **Reload mid-game:** a round whose deadline plus grace has passed is scored 0 the next time the game is read or a round is requested, so a player who walks away cannot hold a game open.
