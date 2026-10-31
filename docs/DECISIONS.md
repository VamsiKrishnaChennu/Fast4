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
