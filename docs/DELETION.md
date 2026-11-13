# Account deletion

What happens when a player deletes their account. The Privacy Policy (`client/src/legal/privacy.js`), the in-app screen and `/delete-account` must match this page. Code: `server/src/services/deletionService.js`, tests: `server/tests/integration/deletion.test.js`.

## How a player does it

- **In the app:** Profile, Delete account, enter the password, confirm.
- **On the web:** `https://APP_ORIGIN/delete-account` (public, no login needed to open it). Log in there, then Delete my account.
- **Cannot log in:** email the support address from the address on the account. The owner checks it is theirs, deletes the account (same result), and answers within 30 days. Admin accounts are not deletable through the API; remove them by hand in the database.

Both ways call `DELETE /api/users/me` with `{ "password": "..." }`. A wrong password answers 400 and deletes nothing. The call is limited to 10 per 15 minutes per address, like login.

## Order of work

The account is locked out first so nothing new can be written, and the account record is removed last, so a failure part way can simply be retried.

1. Bump `tokenVersion` (old access tokens stop working), delete every session (refresh tokens stop working).
2. Take the player out of any live room and close their sockets (they get `error:notice` `ACCOUNT_DELETED`).
3. Delete or anonymize data (below).
4. Delete the user record. Clear the refresh cookie.

## Deleted

| Data                                                                           | How     |
| ------------------------------------------------------------------------------ | ------- |
| User record (nickname, email, phone, password hash, avatar, stats, timestamps) | deleted |
| Sessions and tokens                                                            | deleted |
| Chat messages                                                                  | deleted |
| Blocks the player made and blocks against the player                           | deleted |
| Reports the player filed, and reports about the player                         | deleted |
| Single-player games, their rounds and answers, leaderboard entries             | deleted |

## Anonymized (kept so other players' results stay correct)

Group games, their rounds and standings stay. For the deleted player:

- The `Game.players` entry: nickname becomes `Deleted player`; `userId` becomes a new random id that belongs to no account (one per deleted player, so two deleted players never clash). Scores and counts stay.
- `Game.winnerIds`, `Round.bonusWinnerId`, `Submission.userId`, `Challenge.targetUserId` and `Challenge.initiatorId`: the same new id.
- Typed words are removed: every answer's `raw`, `normalized` and `matchKey` in the player's submissions, and the `word` of challenges against them. Verdicts and points stay.
- Rooms (kept up to 6 hours after last use): the player and host entries get the same treatment.

## Kept for a short time

- **Server logs:** up to 14 days. Configure the host's log retention to match.
- **Database backups:** until they expire, at most 30 days (MongoDB Atlas backup policy must match).

## Not collected, so nothing to delete

No analytics, advertising, crash-reporting service or device identifiers.
