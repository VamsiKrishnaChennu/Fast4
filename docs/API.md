# API and socket contract

Maintained alongside the code. See Development Playbook sections 10 and 11 for the full contract. Additions made during the build are recorded here.

## Added to the playbook contract

- `POST /api/auth/forgot` `{ email }`: always returns 204. Sends a reset link when an account with that email exists.
- `POST /api/auth/reset` `{ token, password }`: 204 on success; 400 `VALIDATION_ERROR` when the token is invalid or expired. Revokes all refresh tokens.

## Auth endpoints (Phase 2)

All bodies are strict JSON. Errors use the standard `{ error: { code, message, details? } }` shape.

| Endpoint                 | Body                                                                                 | Result                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/signup`  | `{ nickname, email? , phone?, password, avatarColor?, ageConfirmed, termsAccepted }` | 201 `{ user, accessToken }` and the `ff_refresh` cookie. `AGE_REQUIRED` when either confirmation is not `true`; `CONFLICT` names the taken field. |
| `POST /api/auth/login`   | `{ identifier, password }`                                                           | 200 `{ user, accessToken }` and cookie. 401 `Invalid credentials.` for any wrong or unknown login; `ACCOUNT_SUSPENDED` for banned accounts.       |
| `POST /api/auth/refresh` | none (cookie)                                                                        | 200 `{ accessToken }` and a new cookie. The old cookie stops working. 401 otherwise.                                                              |
| `POST /api/auth/logout`  | none (cookie)                                                                        | 204 and the cookie is cleared.                                                                                                                    |
| `GET /api/auth/me`       | none (Bearer token)                                                                  | 200 `{ user }`. `TOKEN_EXPIRED` tells the client to refresh.                                                                                      |
| `POST /api/auth/forgot`  | `{ email }`                                                                          | Always 204.                                                                                                                                       |
| `POST /api/auth/reset`   | `{ token, password }`                                                                | 204, or 400 `VALIDATION_ERROR` with field `token` when the link is invalid, used or expired.                                                      |

Refresh cookie: `ff_refresh`, httpOnly, SameSite=Lax, path `/api/auth`, Secure in production.

## Single-player endpoints (Phase 5)

All need a Bearer token. A game that belongs to another player answers `404 NOT_FOUND` (never 403, so ids cannot be probed). Ids must be 24 hex characters, else `400 VALIDATION_ERROR`.

| Endpoint                                          | Body or query                                     | Result                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/single/games`                          | `{ rounds: 5\|10\|15\|20 }`                       | 201 `{ gameId, rounds, roundSeconds }`. No letter. Abandons any game the player left open.                                                                                                                                                                                                                      |
| `POST /api/single/games/:id/rounds/next`          | none                                              | 200 `{ index, letter, startedAt, endsAt, serverNow }`. `startedAt` is when writing starts (after the 4 s toss), `endsAt` is 60 s later. Calling it again while a round is open returns the same round. `INVALID_PHASE` when the game is over.                                                                   |
| `POST /api/single/games/:id/rounds/:index/submit` | `{ answers: { name?, place?, animal?, thing? } }` | 200 `{ index, verdicts, points, timeBonus, roundScore, secondsUsed, missed, totalScore, isLast }`. Accepted until `endsAt` + 1.5 s. Later: the round is scored 0 and `409 ROUND_EXPIRED`. A repeat submit returns the stored result. `INVALID_PHASE` when that round has not started.                           |
| `GET /api/single/games/:id`                       | none                                              | 200 `{ id, status, rounds, roundSeconds, totalScore, results[], round, serverNow, summary? }`. `round` is the open round (or null). Rounds past their deadline are scored 0 first. `summary` (finished games) has `totalScore, newPersonalBest, validAnswers, possibleAnswers, fastestRoundSeconds, rankToday`. |
| `POST /api/single/games/:id/quit`                 | none                                              | 200 `{ status }`. In-progress games become `abandoned` and never reach the ranks.                                                                                                                                                                                                                               |
| `GET /api/leaderboards/single`                    | `?period=daily\|weekly\|all&rounds=10&limit=50`   | 200 `{ entries[], you }`. One entry (the best game) per player, ordered by score then lower total time. `you` is the caller's entry with rank, or null.                                                                                                                                                         |

`daily` and `weekly` mean the last 24 hours and the last 7 days. Ranks come from the best 1,000 finished games for the chosen number of rounds.
