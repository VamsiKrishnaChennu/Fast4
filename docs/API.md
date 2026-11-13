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

## Challenges and appeals (Phase 8)

No voting: one outside word check decides, and the result is final. A player gets 3 challenges **and appeals combined** per game; a check that could not run is not counted.

**Client to server** (acknowledgement `{ ok: true, data: { challengeId, type } }` right after validation; the check then runs in the background)

| Event              | Payload                                  | Errors                                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `challenge:create` | `{ roundIndex, targetUserId, category }` | `VALIDATION_ERROR`, `INVALID_PHASE` (not in the review of that round, or the review is closing), `CHALLENGE_DUPLICATE` (that answer was already challenged, pending or resolved), `CHALLENGE_NOT_ALLOWED`, `CHALLENGE_LIMIT` |

The server decides the type: someone else's **valid** answer is a `challenge`; your own answer rejected only for `not_in_dictionary` is an `appeal`. Blanks, rule failures (wrong letter, too short) and your own valid answers cannot be checked.

**Server to everyone in the room**

| Event                                      | Payload                                                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `challenge:pending`                        | `{ challengeId, roundIndex, targetUserId, initiatorId, category, type }`                                                                                                                                                                |
| `challenge:resolved`                       | `{ challengeId, roundIndex, targetUserId, initiatorId, category, type, outcome, source, countsAsFailed, bonusWinnerId, submission, submissions, standings, challengesLeft }` with `outcome` of `overturned`, `upheld` or `inconclusive` |
| `challenge:resolved` (check could not run) | `{ challengeId, roundIndex, targetUserId, initiatorId, category, type, outcome: 'error', challengesLeft }`; nothing changes and it is not counted, so the player may try again while the review is open                                 |

`submission` is the target's row, `submissions` every row (the first-finisher bonus can move to a different player), `challengesLeft` is the initiator's number left.

| Type      | Check says   | Outcome      | Effect                                                                                                          |
| --------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------- |
| challenge | invalid      | overturned   | answer becomes invalid (`challenge_invalid`); scores and bonus recomputed; the word's `overturnedCount` goes up |
| challenge | valid        | upheld       | initiator gets a failed challenge                                                                               |
| appeal    | valid        | overturned   | answer becomes valid (`challenge_valid`); word added to the dictionary (source `external`)                      |
| appeal    | invalid      | upheld       | owner gets a failed challenge                                                                                   |
| either    | inconclusive | inconclusive | verdict stays; counts as a failed challenge                                                                     |

**Room snapshot additions during `REVIEW`:** `openChallenges[]` (checks still running, so a reconnecting player sees "Checking"), `checked[]` (`{ targetUserId, category, type, outcome }` already resolved), `challengesLeft` (the viewer's), and `review.closing` (the time is up but a check is still running; no new challenges are accepted).

The review ends when its time has elapsed **and** no check is pending (a check waits at most `JUDGE_TIMEOUT_MS`). The host's `review:skip` is refused with `INVALID_PHASE` while a check is running.

**Admin (role `admin`, otherwise 401 or 403)**

| Method and path                                | Result                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/dictionary/overturned?min=3`   | `{ entries: [{ category, word, displayWord, source, overturnedCount }] }`, most overturned first           |
| `DELETE /api/admin/dictionary/:category/:word` | 204; removes the word from the database and from memory. Overturned words are never removed automatically. |

## Chat, reports, blocks, profile, history and leaderboards (Phase 9)

**Socket events**

| Event          | Direction | Payload and result                                                                                                                                                             |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chat:send`    | to server | `{ text }`; ack `{ message }`. Errors: `VALIDATION_ERROR` (empty, over 200), `INVALID_PHASE` (during a round), `MUTED`, `RATE_LIMITED` (more than 5 in 10 s), `ROOM_NOT_FOUND` |
| `chat:history` | to client | `{ messages: [{ id, userId, nickname, avatarColor, text, at }] }`, last 50, without blocked senders; sent after create, join and rejoin                                        |
| `chat:message` | to client | `{ message }` to every player who has not blocked the sender                                                                                                                   |

Chat works in `LOBBY`, `REVIEW`, `ROUND_RESULT` and `GAME_OVER`. Text is plain; profanity is masked with asterisks.

**REST (all need a signed-in user)**

| Method and path                                            | Result                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/reports`                                        | `{ targetUserId, context: chat\|nickname\|answer, refId?, reason, details? }` → 201 `{ id }`. `RATE_LIMITED` after 10 a day; 400 for yourself |
| `GET /api/blocks`                                          | `{ blocks: [{ userId, nickname, avatarColor, blockedAt }] }`                                                                                  |
| `POST /api/blocks`                                         | `{ userId }` → 201 with the new list (repeating is fine)                                                                                      |
| `DELETE /api/blocks/:userId`                               | 204                                                                                                                                           |
| `PATCH /api/users/me`                                      | `{ nickname?, avatarColor? }` → `{ user }`; 409 nickname taken, 400 reserved or unfriendly nickname or bad colour                             |
| `GET /api/users/me/games?limit=20&cursor`                  | `{ games: [{ id, mode, rounds, score, rank, players, newPersonalBest, endedAt }], nextCursor }`, newest first                                 |
| `GET /api/leaderboards/group?metric=wins\|points&limit=50` | `{ entries: [{ rank, userId, nickname, avatarColor, wins, points, games, isYou }], you }`; `you` is the caller's row even outside the list    |

**Admin**

| Method and path                      | Result                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `GET /api/admin/reports?status=open` | `{ reports: [{ id, status, context, reason, details, snapshot, reporter, target, createdAt, handledAt }] }` |
| `POST /api/admin/reports/:id/action` | `{ action: dismiss\|mute\|ban, hours? }` → `{ status }`; 409 when already handled; non-admins get 403       |
