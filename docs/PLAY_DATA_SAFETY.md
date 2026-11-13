# Google Play: Data safety worksheet

Answers for Play Console, App content, Data safety. Built from what the app really does today (Phase 12). **Re-check against Google's current form and wording before you submit, and have a person review it.** If the app starts collecting anything new, this page, the privacy policy and the form must change together.

## Top-level questions

| Question                                           | Answer                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Does the app collect or share required data types? | Yes (collects). Nothing is sold; nothing is shared for third parties' own use (see below).     |
| Is all user data encrypted in transit?             | Yes (HTTPS only).                                                                              |
| Can users request that data is deleted?            | Yes. In the app (Profile, Delete account) and on the web: `https://APP_ORIGIN/delete-account`. |
| Data deletion link                                 | `https://APP_ORIGIN/delete-account`                                                            |
| Independent security review                        | No.                                                                                            |
| Committed to the Play Families policy              | No. The app is for 13 and over, not for children.                                              |

## Data types collected

"Shared" is No for every row: data goes only to service providers that process it for us (hosting provider, MongoDB Atlas, Gmail for reset emails), which Google does not count as sharing. Confirm that reading in the current Play help text.

| Category and type                                                              | Collected | Required or optional                    | Purposes                                                     | Notes                                                                                 |
| ------------------------------------------------------------------------------ | --------- | --------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Personal info: Name (nickname)                                                 | Yes       | Required                                | App functionality, Account management                        | Public to other players.                                                              |
| Personal info: Email address                                                   | Yes       | Optional (email or phone, at least one) | App functionality, Account management                        | Login and password reset.                                                             |
| Personal info: Phone number                                                    | Yes       | Optional (email or phone, at least one) | App functionality, Account management                        | Login only; no SMS is sent.                                                           |
| Personal info: User IDs (account id)                                           | Yes       | Required                                | App functionality, Account management                        | Internal id.                                                                          |
| Messages: Other in-app messages (chat)                                         | Yes       | Optional                                | App functionality                                            | Deleted after 7 days.                                                                 |
| App activity: Other user-generated content                                     | Yes       | Required to play                        | App functionality                                            | Typed answers.                                                                        |
| App activity: Other actions (scores, stats, reports, blocks)                   | Yes       | Required                                | App functionality, Fraud prevention, security and compliance | Game history and moderation.                                                          |
| Device or other IDs / Diagnostics: IP address and error details in server logs | Yes       | Required                                | Fraud prevention, security and compliance                    | Kept 14 days. Check which Play category Google currently asks for IP addresses.       |
| Authentication information: password                                           | Yes       | Required                                | Account management                                           | Stored only as a salted hash. Check whether the form lists a password as a data type. |

## Not collected

Location, contacts, photos or files, audio, calendar, health and fitness, financial information, web browsing history, advertising IDs, crash logs and performance data (no crash-reporting service is installed).

## Other Play Console items

- **Ads:** No. **In-app purchases:** None. **Government, financial and health app declarations:** None.
- **Target audience:** 13 and over only. Check the age bands Play offers and the extra rules for including under-18 groups.
- **Content rating questionnaire:** user interaction yes (chat, with report and block), no violence, no sexual content, no gambling, no user-shared location.
- **App access:** provide a reviewer account (not an admin). The reviewer needs to play a group game, so provide two accounts or a note on how to make a room.
- **User-generated content:** report and block exist in chat (Report message, Block player); reports are reviewed by the owner every day. Terms list the community rules.
- **Permissions:** internet only. Declare nothing else.
