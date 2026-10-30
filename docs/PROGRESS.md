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
