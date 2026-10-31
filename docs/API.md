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
