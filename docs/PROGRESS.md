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
