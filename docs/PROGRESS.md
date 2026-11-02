# Progress

| Phase                                                                  | Status           |
| ---------------------------------------------------------------------- | ---------------- |
| 0. Bootstrap                                                           | done (see notes) |
| 1. Server foundation                                                   | not started      |
| 2. Authentication (includes forgot/reset password)                     | not started      |
| 3. Dictionary and validation                                           | done (see notes) |
| 4. Scoring engine                                                      | done (see notes) |
| 5. Single-player mode                                                  | done (see notes) |
| 6. Rooms and lobby                                                     | done (see notes) |
| 7. Group game engine                                                   | not started      |
| 8. Challenges and appeals                                              | not started      |
| 9. Chat, moderation, leaderboards, profile (includes dark-mode toggle) | not started      |
| 10. Polish and PWA (no sounds)                                         | not started      |
| 11. Hardening                                                          | not started      |
| 12. Play Store readiness                                               | not started      |
| 13. Release readiness                                                  | not started      |

## Phase 0 notes

- Built: npm workspaces monorepo (shared, server, client), ESLint 9 flat config, Prettier, husky and lint-staged, CI workflow, Dockerfile, docker-compose, shared constants/events/error codes, theme CSS variables (light and dark), self-hosted fonts, logo, favicon and app icons.
- Known: Docker image not built in the build sandbox yet; first CI run happens after the repo is pushed.
- ESLint is pinned to 9 because eslint-plugin-react does not yet support ESLint 10.

## Phase 1 notes

- Built: zod-validated env (names every bad variable, exits with a clear message), pino logger with redaction, Mongo connection with 5 retries and backoff (autoIndex off in production, sanitizeFilter on), Express app (helmet CSP, HSTS in production, Permissions-Policy, CORS in development only, compression, hpp, 10 KB JSON limit, API rate limit, request ids), central error handler, JSON 404, `/health`, `/ready`, `/api/meta/config`, static client serving with cache headers and SPA fallback, graceful shutdown.
- Tests: 40 server tests, coverage 96% lines / 93% branches (gate: 85/80).
- `/ready` currently checks the database only. The dictionary check is added in Phase 3.
- Real-database integration tests (mongodb-memory-server) cannot download the MongoDB binary in the build sandbox, so they run in CI. Nothing in Phase 1 needs a live database in tests.
- Mongoose is pinned to 8 and Express to 4, as in the playbook.

## Phase 2 notes

- Server: User and Session models; signup (age and terms confirmation, nickname rules, profanity and reserved names, hashed passwords), login (generic error, constant-time compare), refresh with rotation (old token stops working at once), logout, me, forgot and reset password by email, auth middleware (`requireAuth`, `requireAdmin`), shared zod schemas. Email providers: console, Gmail SMTP and an in-memory one for tests.
- Client: Welcome, Sign up, Log in, Forgot password, Reset password, Home shell with bottom tabs, a minimal Profile (name, dark mode switch, log out), silent session restore, axios refresh interceptor (parallel requests share one refresh), route guards, light and dark themes, theme applied before first paint (`client/public/theme-init.js`).
- Tests: shared 11, server 98 (auth integration tests run against a real database), client 40 (coverage 96%), end-to-end 9 scenarios on desktop and a 360 px phone viewport (sign up, log out and in, phone sign up, duplicate nickname, wrong password, protected route, forgot/reset password, dark mode, layout and console checks, 44 px touch targets).
- Known gaps (planned): Terms and Privacy links lead to a "Coming soon" page until Phase 12; Ranks, Solo and Group are placeholders until Phases 5 to 9; Forgot password, Check your email and Reset password screens are new designs built from the existing tokens and not yet in the design PDFs; email and phone are not verified (Phase 2 of the product, off by default); a real Gmail send has not been exercised from the build sandbox (needs your app password in `server/.env`).

## Desktop web layout (after Phase 2)

- Every Phase 2 screen now fits the window on desktop with no scrollbar (see DECISIONS, "Desktop web layout"). Verified at 1366x650, 1280x620 and 1920x940 in light and dark. Phone layout unchanged. This applies to all later phases.

## Phase 3 notes

- Built: shared `normalizeAnswer`, `formatCheck`, `matchKey` and `lookupCandidates` (100% covered); `DictionaryEntry` model, `dictionaryService` (in-memory sets, add, remove, counts, ready), idempotent seeder, `validationService` (100% covered), `judgeService` (Wikidata and Free Dictionary API checks with caching, coalescing, a 2-request limit per source, 429 back-off, one overall timeout, mocked-internet tests), build, seed and evaluate scripts, `/ready` now needs the dictionary, 400 judge samples.
- Tests: shared 62, server 187 (coverage 97% lines, 90% branches).
- **Open item 1 (done by owner, 1 Nov 2026):** `npm run dictionary:build` was run on the laptop and the lists committed; places grew from 1,022 starter entries to about 200,000 from Wikidata. See `docs/DICTIONARY_SOURCES.md`.
- **Open item 2 (closed, 1 Nov 2026):** after five live runs all four categories meet the targets (see `docs/JUDGE_RESULTS.md`). Tests: server 204.
- Seeding about 46,000 words into a real MongoDB is a one-off `npm run dictionary:seed` (it was too slow to finish on the slower stand-in database used in the build sandbox, but is fast on MongoDB).
- The judge cache is in memory for now; Phase 8 adds the MongoDB `JudgeCache` collection.

## Phase 4 notes

- Built: `server/src/services/scoringService.js`, pure functions with no I/O and no input mutation: `scoreRound` (group scoring by matchKey, unique 10 / shared 5, per-player unique count), `findBonusWinner` (earliest finisher with four valid answers, ties by finishOrder, never for players who did not press Done), `scoreSingleRound` (10 per valid answer, time bonus ceil(remaining/6) capped at 10 only when all four are valid), `rankPlayers` (total, unique answers, bonuses, fewer failed challenges, then shared competition rank 1,1,3 with `isWinner`) and `compareSingleScores` (total, then lower total time).
- matchKey folding already lives in `shared/src/normalize.js` (Phase 3); scoring takes the matchKey stored on each valid answer.
- Tests: `server/tests/unit/scoring.test.js` has every table from the Testing Playbook 3.5 to 3.7, including the exact Ana 25 / Ben 30 / Cy 20 example. Coverage of `scoringService.js` is 100% and enforced by the Jest threshold. Server total: 248 tests.
- Challenge-driven recomputation (Phase 8) just calls `scoreRound` again with the changed verdicts.

## Phase 5 notes

- Server: `Game`, `Round` and `Submission` models, `letterService` (random letter, never repeated in a game), `singlePlayerService` (create, next round, submit, resume, quit, finish with stats), `leaderboardService` (best game per player, daily/weekly/all), `/api/single/*` and `/api/leaderboards/single` routes with zod validation. Server tests: 307.
- Client: Solo setup, letter toss, writing, round result, game over and leave popup built from the approved designs in light and dark, plus the Ranks page (Solo tab). Server-time countdown (`serverClock`, `useCountdown`), draft answers kept per round, auto-submit at zero, resume after reload. Client tests: 60.
- End-to-end (Playwright, desktop and 360px phone): full 5-round game, summary, home best, ranks, reload resume, timer expiry, leave popup, no sideways scroll at 360px, and no page scrollbar at 1366x650, 1280x620 and 1920x940 in light and dark on every solo screen.
- Not built yet: the Group tab of Ranks (Phase 9), the "How scoring works" popup (P16).

## Phase 6 notes

- Server: shared room constants, code generator and zod schemas; `Room` model; `roomManager` (create, join, leave, settings, kick, start, host transfer, 60 second grace, idle sweep, preview), `roomPersistence`, the authenticated Socket.IO server (`sockets/realtime.js`: token check, acknowledgements, validation, flood guard, shutdown notice) and `GET /api/rooms/:code`. Server tests: 393.
- Client: `RealtimeContext` (connection, token refresh on expiry, time sync, room snapshot, actions), Play with friends (create steppers, join with the six-box code input and live preview), the lobby for host and players, the popups (room not found, cannot join, removed, opened somewhere else, room closed, settings, remove player, how scoring works) and the reconnecting banner. Client tests: 108.
- End-to-end with several browsers: create, join by code, share link after log in, takeover by a second tab, kick, closed browser shown as reconnecting, settings edits, start; no sideways scroll at 360px; no page scrollbar at three desktop sizes in light and dark with an 8-player lobby (the player list scrolls inside its own panel).
- Not built yet: lobby chat (Phase 9), the game itself (Phase 7). `game:start` locks the room and shows a placeholder.
