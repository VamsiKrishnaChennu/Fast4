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

## 2026-11-02 (Phase 6: rooms and lobby)

- **Rooms live in memory; MongoDB keeps a copy.** `roomManager` answers every request from memory. `roomPersistence` saves each change (best effort, never blocking) so rooms that were open when the server stopped are marked `abandoned` at start-up. The Room model has no TTL index: expired rooms (6 hours) are deleted by `purgeExpired` in the once-a-minute sweep, the same way expired sessions are removed in code. This also lets the tests run on the stand-in database, which has no TTL indexes.
- **Grace period.** A dropped player keeps their seat for 60 seconds. After that, in the lobby they are removed (and the host role moves on); after the game started they are marked `left`, keep their place in the standings and cannot come back.
- **A kicked player cannot rejoin that room** (`FORBIDDEN`). Added because without it a removed player could simply join again.
- **A player is in one room at a time.** Creating or joining another room leaves the first (lobby), which keeps `findByUser` and reconnects unambiguous.
- **Idle rooms.** The playbook says rooms with everyone disconnected are removed after 30 minutes. Because disconnected players are removed or marked left after 60 seconds, that rule would never trigger, so the sweep closes any room with no activity for 30 minutes and tells the players (`error:notice ROOM_CLOSED`).
- **`GET /rooms/:code` also returns `rounds` and the first five players** (nickname and colour) for the join screen preview.
- **`game:start` stops at the STARTING phase** until the game engine exists (Phase 7). Starting locks the room and shows a "Get ready!" screen.
- **Chat is not in the lobby yet.** The player lobby design shows a chat panel; it arrives with the chat service in Phase 9. Until then the player lobby shows the avatar row, the settings line and the waiting bar.
- **Round count is any whole number from 5 to 20** in rooms (the design's stepper), unlike solo, which offers 5, 10, 15 or 20.
- **Server shutdown** sends `error:notice SERVER_RESTARTING` to everyone before closing.

## 2026-11-13 (Phase 7: group game engine)

- **One engine per room, held by the room object** (`room.engine`, created in `roomManager.start`). It lives in `server/src/services/gameEngine.js` (the playbook's `game/` folder was not used because the room manager already lives in `services/`). It takes the clock, validation, letter picker, store and event senders as dependencies, so tests drive whole games with a fake clock and an in-memory store.
- **Each player gets their own `room:state` during a game** (instead of one broadcast), because it carries `myDraft` and `mySubmitted`. The lobby still uses one broadcast. The client screens render only from the snapshot, so a reload or reconnect needs nothing else.
- **Early finish.** When every connected player has pressed Done the round is judged at once (no 1.5 s wait). Otherwise it ends at 60 s, waits 1.5 s for late Done presses, then judges. A Done that arrives in that wait counts and ranks after everyone who was on time.
- **Bonus for a Done that is not all valid.** As in the playbook, the bonus goes to the earliest finisher with four valid answers; if that is nobody, nobody gets it. Players who never pressed Done are never eligible.
- **Players who are away.** A disconnected player's last draft is judged. If fewer than two players stay connected the game waits 30 seconds, then ends and ranks by current scores (`reason: alone`). A game that ends before any round was judged is saved as `abandoned` and changes no stats.
- **Play again** drops players who left, resets scores and returns the room to the lobby; the next `game:start` makes a new engine and a new `Game` document.
- **`roomId` is not stored on the Game** yet: rooms have no stable link to games before Phase 9 (history). Added to the Phase 9 list.
- **Test timings.** With `NODE_ENV=test` and `TEST_ROUND_SECONDS`, the pauses between phases also shrink (start 0.5 s, wait 0.3 s, review 5 s, results 2.5 s, alone 4 s) so end-to-end games take about 30 seconds. Production always uses the real values.
- **New shared constants:** `LIMITS.STARTING_SECONDS` (3), `LIMITS.ALONE_SECONDS` (30), `PHASES`, and the `answerSchema` used by `answer:draft` and `answer:submit`.
- **Review and results screens do not have the challenge flags yet** (Phase 8): the "N challenges left" chip, the flag buttons and the "Checking" row from the designs arrive with challenges.
- **Typed answers in group games** are saved on the server (drafts) instead of sessionStorage, so another device or a reload both restore them.

## 2026-11-13 (Phase 8: challenges and appeals)

- **Challenge logic lives in the game engine** (`engine.challenge`, `resolveChallenge`), next to the round's rows and the totals, so one place recomputes scores. `roomManager.challenge` only finds the player's room. The outside word check (`judge`) and the dictionary are injected, so tests use a fake judge.
- **Every successful or failed check uses up one of the 3 challenges** (overturned, upheld and inconclusive). Only a check that could not run (error or timeout) is given back. The playbook says "used up" for upheld and inconclusive and is silent on overturned; counting it keeps the rule simple ("3 per game"). Failed challenges (upheld or inconclusive) are tracked separately for the tie-break.
- **The acknowledgement comes right after validation**, not after the check, so the sender is not held for up to 6 seconds; the result arrives as `challenge:resolved`. A check that fails or times out sends `challenge:resolved` with `outcome: error` to the whole room; only the player who asked is shown "Could not check right now, try again".
- **Totals are recomputed, not patched.** Each round remembers what it added to a player's totals; after a verdict changes, `scoreRound` runs again on the final verdicts (including the first-finisher bonus, which can move to an earlier or later finisher) and the difference is applied.
- **Verdicts are saved once per round**, when the review ends (and at game end), through `store.updateRound`, which also updates `Round.bonusWinnerId`. Each finished check is saved as a `Challenge` document the moment it resolves; a duplicate insert is ignored. A check that could not run saves nothing.
- **Review timing.** At the end of the review time the review stays open while a check is running (`review.closing`, no new challenges), then moves on. The host cannot skip while one runs. In test mode the review lasts 12 seconds instead of 5 so end-to-end challenge tests are not racy.
- **`JudgeCache` has no TTL index**, like rooms and sessions: expired entries are ignored (and deleted) on read, and `sweep()` deletes the rest at start-up. This keeps the tests runnable on the stand-in database.
- **A won appeal adds the word as an `external` dictionary entry** and the in-memory set at once, so the next game accepts it without any check. An overturned challenge on a dictionary word only increments `overturnedCount`; the admin endpoints list and remove such words.
- **Reason shown for a removed answer.** A challenged answer that is overturned is stored with the reason `challenged` and shows "Removed after a check" with a "Removed" badge.
- **Single-player mode has no challenges** (playbook non-goal).
- The e2e server uses a fake judge (`tiger` invalid, words starting `tz` valid, everything else inconclusive); it never calls the internet.

## 2026-11-13 (Phase 9: chat, moderation, profile and group ranks)

- **Chat is a button and a bottom sheet, not an inline panel**, in the lobby as well as in review, results and game over. Reason: the desktop lobby grid is tuned to fit the window without scrolling, and a fixed chat button keeps that layout untouched. The sheet header links to the Terms of Use.
- **Delivery.** The room manager keeps the last 50 messages per room in memory, sends them as `chat:history` after join, create and rejoin, and sends each new message to every player who has not blocked the sender. Messages are also saved (`ChatMessage`) so a report can copy the text. `ChatMessage` has no TTL index (same reason as rooms and sessions); the server deletes messages older than 7 days at start-up and every minute.
- **Blocking only hides.** Nobody leaves the room and no score changes. The client also hides messages already on screen at once.
- **Reports** copy the message text (or the nickname) when sent, so later deletion or edits do not change what the admin sees. The reporter's 10 a day limit uses the server clock. Nobody can report themselves, and an admin account cannot be muted or banned through a report.
- **Ban** also deletes the player's refresh sessions and closes their sockets with an `ACCOUNT_SUSPENDED` notice.
- **`roomId` is still not stored on the Game.** The Game's `roomId` field is an ObjectId and room codes are not; history does not need it. Dropped from the list.
- **Group leaderboard** reads the players' running stats (`groupWins`, `groupTotalScore`) and ranks ties equally; suspended players and players with no group games are left out.
- **Not built in the screens:** reporting a nickname or an answer (API ready), and an admin screen for reports.

Decision update: Chat opens from a round chat button as a bottom sheet in every phase where it is allowed (lobby included), instead of an inline panel in the lobby.

## 2026-11-13 (Phase 10: polish and PWA)

- **Hand-written service worker instead of `vite-plugin-pwa`.** The playbook lists the plugin, but the worker we need is about 60 lines (shell and fingerprinted files only, no offline play) and a hand-written one adds no dependency and is easy to read. Pages are fetched network-first, so a new release shows at once; the saved copy is used only offline. Bump `VERSION` in `sw.js` to drop old caches.
- **Offline page is plain HTML and CSS** (`offline.html`, `offline.css`) because the Content-Security-Policy blocks inline styles and scripts.
- **Colour tokens changed for contrast (WCAG AA):** light link `#2557E0` (was `#2F66F5`), light red `#D43D36` (was `#E8473F`), dark red `#C4413B` (was `#D24A43`); category tile colours are unchanged. The Home play-card subtitle is no longer faded.
- **No route splitting:** initial JavaScript is about 144 KB gzipped, under the 250 KB limit.
- **`@axe-core/playwright`** added as a dev dependency for the accessibility specs (the Testing Playbook asks for axe-core).

Decision update: Phase 10 uses a hand-written service worker (no vite-plugin-pwa), and the light link, light red and dark red tokens were darkened for AA contrast.

## 2026-11-13 (Phase 11: hardening)

- **Sentry is a hook, not installed.** `errorReporter` loads `@sentry/node` only when `SENTRY_DSN` is set and the package exists, strips headers, cookies and bodies, and never throws. Adding the packages (server and client) adds a third-party service that receives error data, so it changes the privacy policy and the Data safety form. **Decided (2026-11-13): no Sentry packages.** Error visibility comes from the redacted pino logs and the metrics line, so the privacy policy and Data safety form are unchanged. The hook stays for later; the client hook (`VITE_SENTRY_DSN`) is not built.
- **Socket limit is per socket:** 30 events per 10 seconds (token bucket), answered with RATE_LIMITED; the older more-than-100-events-a-second disconnect stays as the flood guard.
- **Metrics** are in-process counters plus `GET /api/admin/metrics` for admins; no external monitoring service.
- **Soak script lives in `server/tests/soak/`** and uses the real socket test harness, so it needs a test MongoDB.

Decision update: Sockets are limited to 30 events per 10 seconds each, and no Sentry packages are installed (hook only).

## 2026-11-13 (Phase 12: Play Store readiness)

- **Play rules re-checked on 2026-11-13** (web; the owner must confirm in Play Console before submitting):
  - New apps and updates must target Android 16 (API level 36) since 31 August 2026 (extension to 1 November 2026 was available on request), so use a current Bubblewrap and check its target level.
  - A personal developer account created after 13 November 2023 needs a closed test with at least 12 testers opted in for 14 continuous days before applying for production access (organization accounts are exempt). Internal testing does not count.
  - July 2026 policy updates: unrated apps are not allowed (fill in the content rating questionnaire); anonymous and random chat apps come under the age-restricted and child-safety policies from 26 August 2026 (Fast Four has room-code chat between players who joined the same room, not anonymous or random chat, but read the policy and answer the Console questions with that in mind); apps must be registered in Play Console for Android developer verification.
- **One legal text, two outputs.** The privacy policy and terms are written once in `client/src/legal/` and rendered by the pages; `docs/legal/*.md` is generated (`npm run docs:legal`) and a test checks they match. They state Chennu Vamsi Krishna, India, as publisher, `creatiquework@gmail.com` as contact, governing law of India, and no Sentry (nothing in the policy about crash reports). They need a human review. One point for the reviewer: some laws set a higher age of digital consent than 13 (for example India's DPDP Act uses 18); the app is 13+ as decided.
- **Deleted group-game entries get a new random id per deleted player**, not one shared placeholder id. Two deleted players in the same game would otherwise break the unique `(roundId, userId)` index and be indistinguishable. The id belongs to no account.
- **Reports about a deleted player are deleted too**, along with reports they filed. A banned player who deletes the account loses the moderation record, but nothing stops them signing up again anyway.
- **Admin accounts cannot be deleted through the API.** Remove them by hand in the database.
- **Back-button guard instead of router blockers.** The app uses the plain browser router, which has no blocker hook, so a small history guard (`useBackGuard`) adds one history entry while a room or solo game is open. Every way out goes through its `exit` function so no stray page is left behind. Android's Back button in the TWA is the browser Back.
- **No `vite-plugin-pwa` or extra packages were added.** The delete confirmation, legal pages and guard use what was already installed.

Decision update: Phase 12 uses one legal text for the web pages and docs, per-player random ids for deleted group entries, no admin self-deletion through the API, and a history-based Back guard in rooms and solo games.
