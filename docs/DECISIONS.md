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
- **.env files** are git-ignored (`.env`, `.env.*`, only `.env.example` is tracked) and kept only on the local machine and in host secrets.
- **Phase 1 sandbox limit:** the build sandbox cannot download the MongoDB binary, so database-backed integration tests run in CI.
