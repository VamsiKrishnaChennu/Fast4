# Android app (Trusted Web Activity)

The Play Store app is the Fast Four web app opened full screen by Chrome (a Trusted Web Activity), built with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). One codebase serves web and Android. Package id: `com.npatarena.app` (permanent after the first Play upload).

**Never commit the keystore, its passwords or any `.aab`/`.apk`** (the repo `.gitignore` blocks them). Keep the upload keystore in a password manager with an offline backup. If you lose it you must ask Google to reset the upload key.

## Before you start

1. Staging or production is live on its permanent `APP_ORIGIN` (an https address) and always on. The app is tied to that address: if it changes later, build and release a new Android version, and until players update they see a browser bar. **A custom domain bought before the closed test avoids this.**
2. These open without logging in: `/privacy`, `/terms`, `/delete-account`, `/manifest.webmanifest`.
3. Install Java 17 (JDK) and Node 22. Bubblewrap offers to download the Android SDK on first run.
4. **Re-check Google Play's current rules** (required target API level, developer account testing rules, user-generated content, account deletion, Data safety) and note the date in `docs/DECISIONS.md`.

## Build

```bash
npm install -g @bubblewrap/cli
cd android
cp twa-manifest.template.json twa-manifest.json   # then replace REPLACE-WITH-APP-ORIGIN-HOST (host only, no https://)
bubblewrap init --manifest=https://YOUR-HOST/manifest.webmanifest   # or use the file above; accept the defaults, keep the package id
bubblewrap build                                    # creates app-release-bundle.aab and a signed apk
bubblewrap fingerprint list                         # prints the upload key SHA-256
```

`bubblewrap init` asks for the keystore the first time and creates `upload-key.keystore`. Bubblewrap picks a target API level; check it still meets Play's current minimum and update Bubblewrap (`npm update -g @bubblewrap/cli`) if Play Console rejects the bundle.

## Link the app to the site (Digital Asset Links)

Chrome only hides the address bar if the site proves it belongs to the app. The server publishes `/.well-known/assetlinks.json` from two settings (see `docs/ENV.md`):

```
ANDROID_PACKAGE_NAME=com.npatarena.app
ANDROID_SHA256_FINGERPRINTS=AA:BB:...:FF,11:22:...:99    # comma-separated, 32 hex pairs each
```

1. First deploy with the **upload key** fingerprint from `bubblewrap fingerprint list`.
2. Upload the `.aab` to Play Console (Internal testing) with **Play App Signing** on.
3. Copy the **App signing key** SHA-256 from Play Console, Test and release, App integrity. Add it to `ANDROID_SHA256_FINGERPRINTS` next to the upload key, redeploy.
4. Check `https://YOUR-HOST/.well-known/assetlinks.json` answers 200 with JSON, then verify with Google's Statement List tester or `bubblewrap doctor`. Install the Play build on a phone: it must open full screen with no address bar.

The server refuses to start when only one of the two settings is set or when a fingerprint is malformed, so a typo cannot silently break the link.

## What the web app does for Android

- Back button: goes to the previous screen. Inside a room or a running solo game it first asks "Leave this room?" / "Leave this game?". On Home it exits the app.
- Signing in survives closing the app (the TWA shares Chrome's storage).
- No browser pop-ups (`alert`, `confirm`) in any flow; the screen stays awake while writing; the only permission is internet.
- Share room links (`https://APP_ORIGIN/room/CODE`) open in the app when it is installed.

## Test on a device (owner)

Android 11+ phone and an older one if possible: install the Internal testing build, then check full screen launch, sign in, close and reopen (still signed in), solo game, group game across two phones, the Back button in a room, rotation, offline start (friendly offline page), delete account from Profile, and `/delete-account` in the browser.
