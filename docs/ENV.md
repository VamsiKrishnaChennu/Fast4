# Environment settings

Put these in `server/.env` for local work and in the host's secrets screen for staging and production. `.env` files are git-ignored. Never commit real values. The server checks everything at startup and names each missing or invalid setting (`server/src/config/env.js`).

| Setting                                                | Required                    | Default                           | Purpose                                                                               |
| ------------------------------------------------------ | --------------------------- | --------------------------------- | ------------------------------------------------------------------------------------- |
| NODE_ENV                                               | no                          | development                       | `development`, `test` or `production`                                                 |
| PORT                                                   | no                          | 4000                              | HTTP port                                                                             |
| MONGODB_URI                                            | yes                         |                                   | e.g. `mongodb://127.0.0.1:27017/npatarena`                                            |
| JWT_ACCESS_SECRET                                      | yes                         |                                   | 32+ random characters                                                                 |
| JWT_REFRESH_SECRET                                     | yes                         |                                   | 32+ random characters, different from the access secret                               |
| ACCESS_TOKEN_TTL                                       | no                          | 15m                               | Access token lifetime                                                                 |
| REFRESH_TOKEN_TTL                                      | no                          | 7d                                | Refresh token lifetime                                                                |
| CLIENT_ORIGIN                                          | no                          | http://localhost:5173             | Allowed browser origin in development                                                 |
| COOKIE_SECURE                                          | no                          | true in production, else false    | Secure flag on cookies; cannot be false in production                                 |
| LOG_LEVEL                                              | no                          | info                              | pino level                                                                            |
| OTP_VERIFICATION_ENABLED                               | no                          | false                             | Email and phone verification (later phase)                                            |
| JUDGE_ENABLED                                          | no                          | true                              | External word check on or off                                                         |
| WIKIDATA_USER_AGENT                                    | production                  |                                   | e.g. `FastFour/1.0 (contact email)`                                                   |
| DICTIONARY_API_URL                                     | no                          | api.dictionaryapi.dev entries URL | Free Dictionary API                                                                   |
| WIKIDATA_API_URL                                       | no                          | wikidata.org API                  | Wikidata search                                                                       |
| WIKIDATA_SPARQL_URL                                    | no                          | query.wikidata.org                | Wikidata SPARQL                                                                       |
| APP_ORIGIN                                             | production                  |                                   | Public https address; used for links, cookies and the Android link file               |
| ANDROID_PACKAGE_NAME                                   | for Play                    |                                   | `com.npatarena.app`                                                                   |
| ANDROID_SHA256_FINGERPRINTS                            | for Play                    |                                   | Comma-separated signing fingerprints                                                  |
| SUPPORT_EMAIL                                          | production                  |                                   | Public contact address                                                                |
| EMAIL_PROVIDER                                         | no                          | console                           | `console` (prints emails to the log) or `smtp`                                        |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM | when EMAIL_PROVIDER is smtp |                                   | Gmail: `smtp.gmail.com`, `465`, the account, an app password, a From name and address |
| SENTRY_DSN                                             | no                          |                                   | Error monitoring                                                                      |
| APP_VERSION                                            | no                          | dev                               | Shown in the app; set to the git SHA on deploy                                        |
| TEST_ROUND_SECONDS                                     | tests only                  |                                   | Shortens rounds; honored only when NODE_ENV is `test`                                 |

Client (`client/.env`, optional): `VITE_API_URL` (leave empty for same origin) and `VITE_SENTRY_DSN`. These are public by design; never put secrets in `VITE_` settings.

Tests only (never set in production): `TEST_MONGODB_URI` (base URI without a database name, for example `mongodb://127.0.0.1:27017`) makes the server tests and end-to-end tests use that database server instead of downloading an in-memory MongoDB. `PLAYWRIGHT_CHROMIUM_PATH` points the end-to-end tests at an existing Chromium.
