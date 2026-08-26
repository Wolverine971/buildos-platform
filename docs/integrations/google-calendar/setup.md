<!-- docs/integrations/google-calendar/setup.md -->

# Google Calendar OAuth Setup for Multi-Account Connections

Last verified: 2026-08-12

## What BuildOS needs

BuildOS does **not** need another Google API key. It needs a new OAuth 2.0 client ID and client
secret for a server-side web application.

Use the existing BuildOS Google Cloud project, but create a separate OAuth client inside it:

| Purpose                                   | BuildOS environment variables                                                               | Action                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Google sign-in and legacy Calendar tokens | `PUBLIC_GOOGLE_CLIENT_ID`, `PRIVATE_GOOGLE_CLIENT_ID`, `PRIVATE_GOOGLE_CLIENT_SECRET`       | Keep unchanged                                             |
| New Calendar connections and reconnects   | `PRIVATE_GOOGLE_CALENDAR_CLIENT_ID`, `PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET`                | Create a dedicated OAuth Web client                        |
| Encrypt stored Calendar credentials       | `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1`                                                  | Generate in BuildOS/Vercel; this does not come from Google |
| Canary rollout                            | `PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED`, `PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS` | Enable only after credentials and backfill are verified    |

The new Calendar client ID must be different from the existing Google sign-in client ID. BuildOS
checks this deliberately. Existing Calendar refresh tokens remain tied to the old client that
issued them, while all new connections use the dedicated Calendar client.

## Before you begin

You need:

- Owner or Editor access to the Google Cloud project that contains the current BuildOS Google
  sign-in OAuth client;
- access to the BuildOS project in Vercel;
- the existing BuildOS Google client ID so you can confirm that you selected the correct Cloud
  project. It is stored as `PUBLIC_GOOGLE_CLIENT_ID` and `PRIVATE_GOOGLE_CLIENT_ID`;
- a secure password manager or secret manager for the new client secret.

Do not paste OAuth client secrets into chat, commit them to Git, or add them to a Markdown file.

## 1. Select the existing BuildOS Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector in the top navigation.
3. Select the project that already contains the OAuth client matching BuildOS's existing
   `PUBLIC_GOOGLE_CLIENT_ID`.
4. Open **Google Auth Platform → Clients** and confirm that the existing Google sign-in client is
   listed.

Use this same project so the new client shares the existing BuildOS OAuth branding, audience, and
verification configuration. Do not delete, rename, or rotate the existing sign-in client.

## 2. Confirm that the Google Calendar API is enabled

1. Open **APIs & Services → Library**.
2. Search for **Google Calendar API**.
3. Open it and click **Enable** if the page does not already show **Manage**.

Google identifies this service as `calendar-json.googleapis.com`. See Google's
[Workspace API enablement guide](https://developers.google.com/workspace/guides/enable-apis).

## 3. Check the OAuth app configuration

Open **Google Auth Platform** in the same project and review these sections.

### Branding

Confirm that the app name, support email, homepage, privacy policy, terms URL, and authorized domain
still describe BuildOS. Avoid changing an already verified brand merely to create the new client.

Recommended production URLs:

- Homepage: `https://build-os.com`
- Privacy policy: `https://build-os.com/privacy`
- Terms: `https://build-os.com/terms`
- Authorized domain: `build-os.com`

### Audience

- If the app is **In production**, keep it in production.
- If the app is **Testing**, add each canary Google account as a test user before connecting it.
  Google currently limits Testing projects to 100 test users and expires refresh tokens after seven
  days for non-identity scopes. Testing mode is therefore useful for a short smoke test, not for a
  durable production Calendar connection.
- If the audience is **Internal**, only accounts in the associated Google Workspace organization can
  authorize it.

See Google's [Audience documentation](https://support.google.com/cloud/answer/15549945).

### Data Access

BuildOS requests these OAuth scopes:

```text
openid
email
https://www.googleapis.com/auth/calendar
```

The full Calendar scope is required because BuildOS reads availability, creates and updates events,
manages project calendars, and registers Calendar webhooks. In **Data Access**, confirm that the
Google Calendar scope is declared and approved for the app. Google documents the available Calendar
scopes in its [Calendar authorization guide](https://developers.google.com/workspace/calendar/api/auth).

If the project has not previously been verified for the Calendar scope, Google may require OAuth app
verification before a broad public rollout. The existing BuildOS Calendar integration may mean this
scope is already configured; verify the current status rather than resubmitting automatically.

## 4. Create the dedicated Calendar OAuth client

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients).
2. Click **Create client**.
3. Set **Application type** to **Web application**.
4. Name it `BuildOS Calendar Production`.
5. Leave **Authorized JavaScript origins** empty. BuildOS performs the OAuth exchange on the server;
   browser JavaScript does not call the Calendar API directly with this client.
6. Under **Authorized redirect URIs**, add these exact values:

    ```text
    https://build-os.com/auth/google/calendar-callback
    https://www.build-os.com/auth/google/calendar-callback
    ```

7. Click **Create**.
8. Immediately save both the client ID and client secret in a secure secret manager. Google's current
   console shows the full client secret only when it is created.

Redirect URIs are exact-match values. Scheme, host, path, and trailing slash all matter. BuildOS does
not use a trailing slash. Google documents exact redirect matching in its
[OAuth web-server guide](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

Do not add rotating Vercel preview deployment URLs to the production client. If preview OAuth testing
is needed later, use a stable preview domain and a separate OAuth client.

## 5. Add the Google credentials to Vercel

1. Open the Vercel project named **build-os**.
2. Go to **Settings → Environment Variables**.
3. Add the following as encrypted Production variables:

    ```text
    PRIVATE_GOOGLE_CALENDAR_CLIENT_ID=<the new OAuth client ID>
    PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET=<the new OAuth client secret>
    ```

4. Confirm that `PRIVATE_GOOGLE_CALENDAR_CLIENT_ID` is not equal to
   `PRIVATE_GOOGLE_CLIENT_ID`.
5. Do not enable the multi-Calendar feature flag yet.

After adding or changing Vercel environment variables, deploy again so the new values are present in
the production functions.

## 6. Generate the BuildOS encryption key

`PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` is an application encryption key, not a Google
credential. It must contain at least 32 bytes of unpredictable data. Generate it once:

```bash
openssl rand -base64 48
```

Store the output as an encrypted Production variable in Vercel:

```text
PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1=<generated value>
```

Keep a recoverable copy in the approved secret manager. Do not reuse the Google client secret,
Supabase key, legacy Calendar key, or any other application secret. Do not rotate or delete this key
without a credential re-encryption migration; existing Calendar connections would become
undecryptable.

Codex can generate and provision this key after the two Google OAuth variables are available, so the
Google Cloud steps above are the only steps that require manual console access.

## 7. Backfill before enabling the canary

Production currently has nine legacy Calendar token rows. Once the dedicated OAuth variables and V1
encryption key are present:

1. redeploy with the feature flag still disabled;
2. run the legacy connection migration in dry-run mode;
3. execute the migration in a bounded batch;
4. verify that all nine legacy rows have connection, credential, and source records;
5. verify that migrated credentials retain `oauth_client_kind = 'google_shared_login'`;
6. confirm that no credentials require reconnect and that no token values appeared in logs.

The existing legacy token rows stay intact during this compatibility window. Do not delete them as
part of initial rollout.

## 8. Enable one exact-user canary

After the backfill passes, configure:

```text
PRIVATE_MULTI_CALENDAR_CONNECTIONS_ENABLED=true
PRIVATE_MULTI_CALENDAR_CONNECTIONS_USER_IDS=<comma-separated BuildOS user UUIDs>
```

The allowlist requires BuildOS database user UUIDs, not email addresses or Google account IDs. The
implementation rejects `*`; broad enablement must be a deliberate later change. Redeploy after
changing the gate variables.

## 9. Canary verification checklist

Sign in as the allowlisted BuildOS user and open **Profile → Calendar**.

- The existing Calendar connection appears without forcing a reconnect.
- **Add Google account** opens Google's account picker and BuildOS consent screen.
- A second Google account can be connected.
- Calendar sources from both accounts appear with the correct account labels.
- Read, availability, analysis, and sync toggles can be changed per source.
- A default write calendar can be selected.
- User-level event creation writes to that default source.
- A project can link an existing writable source from either account.
- A BuildOS-managed project calendar can be created under the selected account.
- Editing and deleting an existing event continues to use the event's original source.
- Disconnecting one account leaves the other account working.
- Webhook renewal completes without creating duplicate active channels.

Keep the exact-user gate limited until the scheduled webhook cycle and background analysis paths have
also been observed successfully.

## Troubleshooting

### `redirect_uri_mismatch`

The URI sent by BuildOS is not an exact match for the OAuth client. Confirm the production callback
URIs above, including `https`, hostname, path, and absence of a trailing slash.

### `Multi-account Google Calendar is not configured`

One of the two dedicated OAuth variables or `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1` is missing,
the encryption key is too short, or the dedicated client ID equals the login client ID. Confirm the
variables are assigned to Production and redeploy.

### `invalid_client`

The client ID and secret do not belong together, the secret was copied incorrectly, or the wrong
Google Cloud project/client was selected.

### `scope_mismatch` or partial consent

The account did not grant `https://www.googleapis.com/auth/calendar`, or a Google Workspace admin
blocked the scope. Reauthorize and grant the full requested Calendar permission. Workspace-managed
accounts may require an administrator to trust the OAuth client.

### Connection works, then expires after seven days

The Google Auth Platform audience is probably still in Testing. Google expires Testing-mode refresh
tokens after seven days when non-identity scopes such as Calendar are requested.

### Unverified-app warning or access blocked

Confirm that the canary account is a test user, or complete/preserve the existing app verification
for the Calendar scope before public rollout.

## Official references

- [Manage OAuth clients](https://support.google.com/cloud/answer/15549257)
- [Get started with Google Auth Platform](https://support.google.com/cloud/answer/15544987)
- [Enable Google Workspace APIs](https://developers.google.com/workspace/guides/enable-apis)
- [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [OAuth 2.0 for web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
