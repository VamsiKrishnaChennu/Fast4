# Progress

| Phase                                                                  | Status           |
| ---------------------------------------------------------------------- | ---------------- |
| 0. Bootstrap                                                           | done (see notes) |
| 1. Server foundation                                                   | not started      |
| 2. Authentication (includes forgot/reset password)                     | not started      |
| 3. Dictionary and validation                                           | not started      |
| 4. Scoring engine                                                      | not started      |
| 5. Single-player mode                                                  | not started      |
| 6. Rooms and lobby                                                     | not started      |
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
