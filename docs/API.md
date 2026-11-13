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

## Rooms and the live connection (Phase 6)

**Connecting.** `io(url, { auth: { token: accessToken } })`. A missing, bad or expired token, a token from before a password change, or a banned account is refused with `connect_error`; `error.data.code` is `UNAUTHENTICATED`, `TOKEN_EXPIRED` or `ACCOUNT_SUSPENDED`. After `TOKEN_EXPIRED` the app refreshes the token and connects again. A player who is already in a room is put back into it on connect and gets a fresh `room:state`.

**Every request** has an acknowledgement `{ ok: true, data }` or `{ ok: false, error: { code, message, details? } }`. Payloads are checked with zod. A skipped payload (`null` on the wire) counts as "nothing sent". More than 100 events in one second disconnects the socket.

| Event                 | Payload                                                              | Ack data and rules                                                                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:create`         | `{ settings? }` (`maxPlayers` 2-8, `rounds` 5-20; defaults 8 and 10) | `{ code, room }`. The caller is host. A player in another room leaves it first.                                                                                                                                                                                                       |
| `room:join`           | `{ code }` (any case, spaces and dashes ignored)                     | `{ room, rejoined }`. `ROOM_NOT_FOUND` also for a badly formed code, `ROOM_FULL`, `ROOM_LOCKED`, `FORBIDDEN` (removed by the host, or left a started game). A player already in the room is rebound; a second tab takes over and the first gets `room:kicked { reason: "takeover" }`. |
| `room:leave`          | none                                                                 | Lobby: removed. After the game started: marked as left, standings kept.                                                                                                                                                                                                               |
| `room:updateSettings` | `{ settings }`                                                       | `{ room }`. `NOT_HOST`, `INVALID_PHASE` (not in the lobby), `VALIDATION_ERROR` on `maxPlayers` when below the player count.                                                                                                                                                           |
| `room:kick`           | `{ userId }`                                                         | `NOT_HOST`, `INVALID_PHASE`, `VALIDATION_ERROR` (yourself), `NOT_FOUND`. The player gets `room:kicked { reason: "removed" }` and cannot join this room again.                                                                                                                         |
| `game:start`          | none                                                                 | `{ room }`. Host only, at least 2 connected players. Locks the room (phase `STARTING`), sends `game:started { totalRounds }` and starts the game engine (see "Group game" below).                                                                                                     |
| `time:sync`           | none                                                                 | `{ serverNow }`. The app asks three times on connect and keeps the middle offset.                                                                                                                                                                                                     |

**Events to the room:** `room:state` (full snapshot after every change: `{ code, status, phase, settings, players[], hostId, standings, openChallenges }`; each player is `{ userId, nickname, avatarColor, joinedAt, connected, left, score }`), `room:playerJoined`, `room:playerLeft`, `room:playerDisconnected`, `room:playerReconnected`, `room:settingsUpdated`, `room:hostChanged`, `game:started`. To one socket: `room:kicked`. `error:notice { code }` carries `ROOM_CLOSED` (idle 30 minutes) and `SERVER_RESTARTING`.

**`GET /api/rooms/:code`** (Bearer token): `{ code, status, playerCount, maxPlayers, rounds, hostNickname, players: [{ nickname, avatarColor }] }` (first five players, for the avatars on the join screen). `404 ROOM_NOT_FOUND` for an unknown or malformed code.

## Group game (Phase 7)

The server runs every round: letter, clock, judging, scoring and standings. Every time is an absolute server timestamp in milliseconds (use `serverNow` from `time:sync` to correct for clock drift). Phases, in order: `STARTING` (3 s) -> `LETTER_TOSS` (4 s) -> `WRITING` (60 s) -> `COLLECTING` (up to 1.5 s) -> `JUDGING` -> `REVIEW` (30 s) -> `ROUND_RESULT` (10 s) -> back to `LETTER_TOSS`, or `GAME_OVER` after the last round.

**Client to server** (all acknowledged with `{ ok, data }` or `{ ok: false, error }`):

| Event            | Payload                                                   | Result                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answer:draft`   | `{ roundIndex, answers: { name, place, animal, thing } }` | `{}`. Kept in memory and used when the round ends without a Done. Anything out of turn is silently ignored.                                                                                                                                         |
| `answer:submit`  | same                                                      | `{ finishOrder }`. The Done press: all four answers must be non-empty (`VALIDATION_ERROR`). Repeating it returns the first `finishOrder`. `INVALID_PHASE` before writing, `ROUND_EXPIRED` after the round. Accepted until 1.5 s after the deadline. |
| `review:skip`    | none                                                      | `{}`. Host only (`NOT_HOST`), review phase only (`INVALID_PHASE`).                                                                                                                                                                                  |
| `game:playAgain` | none                                                      | `{ room }`. Host only, `GAME_OVER` only. Players who left are dropped, scores reset, the room is a lobby again.                                                                                                                                     |

**Room state.** During a game the server sends each player their own `room:state` (it carries `myDraft` and `mySubmitted`), after every phase change, every Done and every connection change. Besides the lobby fields it holds `totalRounds`, `standings[]` (`{ userId, nickname, avatarColor, left, totalScore, uniqueAnswers, firstFinisherCount, failedChallenges, rank }`) and, depending on the phase:

- `round`: `{ index, startsAt, revealAt, roundMs, finished: [{ userId, order }] }`, plus `letter` and `endsAt` from `WRITING` on. The letter is never sent before that.
- `review` (phase `REVIEW`): `{ index, letter, bonusWinnerId, reviewEndsAt, submissions[] }`; each submission is `{ userId, answers: { category: { raw, verdict, source, reason, count, points } }, finishOrder, firstFinisherBonus, roundScore }`.
- `results` (phase `ROUND_RESULT`): `{ index, isLast, shownAt, nextAt, breakdown[], standings[] }`; each breakdown row is `{ userId, answerPoints, firstFinisherBonus, roundScore, totalScore, previousRank, rank }`.
- `gameOver` (phase `GAME_OVER`): `{ standings[], winnerIds[], stats: { userId: { uniqueAnswers, firstFinisherCount, failedChallenges } }, reason }` where `reason` is `completed` or `alone`.

**Events to the room:** `round:toss { index, startsAt, revealAt }` (no letter), `round:started { index, letter, endsAt, serverNow }`, `round:playerFinished { userId, order }` (no answers), `round:review` (the `review` object), `round:results` (the `results` object), `game:over` (the `gameOver` object). Other players' answers appear only in `round:review` and in `room:state` during `REVIEW`.

**Saved:** a `Game` when the game starts, a `Round` when writing starts, the `Submission` documents when the round is judged, and the final standings plus each player's stats (`gamesPlayed`, `groupGamesPlayed`, `groupWins`, `groupTotalScore`, `uniqueAnswers`) when the game ends.
