<!-- docs/integrations/GOOGLE_OAUTH_SUBMISSION_PACKET_2026-10-04.md -->

# BuildOS Google OAuth submission packet

Last checked: October 4, 2026. Owner: DJ Wayne.

BuildOS already implements Google sign-in, Calendar authorization, and read-only Gmail
authorization. The immediate job is to finish Google's production verification and prepare an
accurate demonstration. Branding was verified and published during this pass. Data-access
verification and the recording remain unfinished.

The older dithered logo was then replaced with the clean 512px app icon
(`apps/web/static/AppImages/android/android-launchericon-512-512.png`), re-verified, and published.
The user confirmed `dj@build-os.com` as the support email. That correction is pending: the
Workspace account is signed in but lacks project access, and the owner's dropdown only offers
the current Gmail account. Explicit approval was requested for `roles/oauthconfig.editor` on
`buildos-gmail-read`; the role includes OAuth client-secret access. No IAM grant has been made.

## Verified status

| Area                       | Evidence on October 4                                                                                                                                             | Remaining work                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Google integration project | `buildos-gmail-read`, project number `941207291119`; External / In production; 3 of 100 unverified users                                                          | Verify sensitive and restricted scopes                                |
| Branding                   | Clean app icon verified and published; support address still `djwayne35@gmail.com`                                                                                | Set confirmed support address `dj@build-os.com` after access approval |
| Public prerequisites       | Anonymous GETs to `/`, `/privacy`, `/terms`, `/auth/login` return 200                                                                                             | Recheck before submitting                                             |
| Disclosures                | Homepage describes separate opt-in integrations; deployed privacy version `2026-09-24` explains read-only Gmail, Calendar, AI, retention, Limited Use, disconnect | Ensure final demo and scope choices match                             |
| Calendar                   | Two connected accounts visible in production Settings with sources and a default write calendar                                                                   | Fresh consent and controlled event demonstration                      |
| Gmail                      | Three accounts show reading enabled; sending and message changes off                                                                                              | Fresh consent, search, message read, and disconnect demonstration     |
| Submission form            | Calendar justification, Gmail category/justification, and YouTube URL empty                                                                                       | Complete after scope/client decisions                                 |

The Verification Center's preparation page is now accessible. It reports three concrete missing
items: scope justification, intended data usage, and demo video. The final Confirm button remains
disabled. Draft answers and the recording script are below.

No production deployment, database migration, client deletion, credential rotation, paid model
test, Calendar mutation, or email send was performed. Existing sessions and connection UI were
inspected; a fresh sign-in and fresh end-to-end consent flow were not tested.

## Finish in this order

Finish the support-email correction once project access is approved, then save and verify/publish
any branding change Google requires. The clean logo is already live.

1. **Extra QA client — done.** `BuildOS Agentic Gate QA` (`941207291119-ftp1…`) was deleted on
   October 4 with DJ's approval. Its only consumer was the ignored `.env.agentic-gate.local` of the
   QA runner retired on September 24. It can be restored from "Restore deleted OAuth clients" until
   November 3. The project now holds only the two production clients. The Calendar client still
   shows Google's "more than one secret" warning; identify which secret production uses (Vercel
   env) before disabling the other.
2. **Calendar scopes — built locally, not shipped.** DJ chose the granular migration on
   October 4. Both connect flows now request `calendar.events`, `calendar.events.freebusy`,
   `calendar.calendarlist.readonly` and `calendar.app.created`; existing full-scope grants keep
   working. Ship order:
    1. ~~Apply `supabase/migrations/20261005000000_google_calendar_granular_scopes.sql`.~~
       **Applied to production October 4** with DJ's approval. It was re-rehearsed first. The
       live function definitions were diffed against the migration (only the scope check
       differed), and the history was recorded via `migration repair`. After the apply, both
       functions matched the rehearsed bodies and remained `SECURITY DEFINER`. They accept
       either the full scope or all four granular scopes, so current production code is
       unaffected.
    2. Deploy the code.
    3. Replace `calendar` with the four scopes in the Data Access list of every project that
       requests Calendar.

    See "Scope audit" below.

3. **Decide which Google project ordinary Calendar users consent to.** The legacy single-account
   Calendar flow, which most users get, uses the sign-in client (project `924402611458`), not
   `buildos-gmail-read`. The dedicated Calendar client serves only the multi-account allowlist.
   An October 4 consent preview confirmed that `https://build-os.com/auth/google/calendar-callback`
   is registered on the sign-in client, which shows as "Build OS" with the older logo. Verifying
   `buildos-gmail-read` therefore does not reach those users. **DJ decided on October 4 to move
   all new Calendar connections onto the dedicated Calendar client**: multi-account Calendar
   becomes the path for every user, behind an explicit all-users switch. Production then had 3
   legacy connections: one external user, DJ's protonmail account, and the e2e harness. Built
   locally (uncommitted); see "All-users Calendar rollout" below. The sign-in project still needs
   finding for its sign-in branding ("Build OS", old logo). That project is still not visible to
   the current Console account. Confirm its
   callbacks, Supabase Google provider configuration and branding with an account that can open
   it. Do not create replacement credentials merely because project access is missing.
4. **Record the real consent and feature walkthrough** below, using a demonstration Google account
   and harmless sample data. Upload as an unlisted YouTube video and obtain its URL.
5. **Complete Data Access and submit Calendar only.** First move Gmail out of the project (see
   "Gmail workaround research"). Then enter the Calendar justification and the recording URL and
   use Verification Center. Branding is complete, and publishing to production has also already
   happened. Neither action replaces scope approval.
6. **Respond to Google's review.** Calendar scopes are sensitive, not restricted, so no security
   assessment is required. Gmail's assessment is deferred until mailbox search earns it.

Google's [submission instructions](https://support.google.com/cloud/answer/13461325?hl=en) describe
the scope justification and demo steps. Its [restricted-scope requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
cover server-side data handling and assessment. No assessment was purchased or scheduled.

## All-users Calendar rollout (October 4, built locally, uncommitted)

**Switch.** `isMultiCalendarUserAllowed` (shared by web and worker) accepts two new variables:

- `PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS`. It must be an explicit true value, and it only
  applies while `..._ENABLED` is true.
- `PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS`. It keeps legacy-only users on the legacy
  runtime until they're migrated.

The exact allowlist still wins over the exclusion, and wildcards are still ignored everywhere.
Nine gate tests cover this.

**Connect routing.** Every Calendar entry point now starts a new grant on the dedicated client for
multi-account users:

- Server routes: `/auth/google` and the profile `connectCalendar`/`reconnectCalendar` actions go
  through `lib/server/calendar-connect-url.ts`.
- Onboarding's Calendar step and the time-blocks overlay go through
  `lib/utils/google-calendar-connect-url.ts`.

Before this change, the onboarding and overlay buttons asked `/profile/calendar` for a legacy URL,
which is null for multi-account users. Under the switch, every new user's onboarding Calendar step
would have failed. Excluded legacy users still connect through the sign-in client, and their
existing tokens keep refreshing on it.

**Readiness audit (code paths).**

| Path                                                                         | New user (dedicated client)                           | Excluded legacy user |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| Settings Calendar tab, connections API, callback                             | Multi-account panel and dedicated flow                | Unchanged            |
| Onboarding Calendar step, time-blocks overlay                                | **Fixed:** dedicated flow                             | Unchanged            |
| `/api/calendar` and time-blocks connected checks                             | Both models (`hasUsableGoogleCalendarConnection`)     | Unchanged            |
| Web chat executor, events/dashboard APIs, project calendars, onto-event sync | Source-aware (gated)                                  | Legacy (gated)       |
| Worker chat read/write ports                                                 | Probes source-aware first and works without env vars  | Legacy fallback      |
| `agentRunWorker`                                                             | Checks both tables                                    | Unchanged            |
| Welcome-sequence `calendarConnected`                                         | **Fixed:** counts active connections                  | Unchanged            |
| Admin email-generation context                                               | **Fixed:** counts active connections                  | Unchanged            |
| Admin analytics, security analysis, users list                               | Still count legacy tokens only (admin-only, cosmetic) | Unchanged            |

**Validation.**

- shared-agent-ops: 9 gate tests pass; `tsc --noEmit` is clean; dist was rebuilt.
- Web: 7 connect-routing tests and 34 welcome-sequence tests pass, and ESLint/Prettier are clean.
- An accidental full web run (the shell glob found nothing, so the file list was empty) also
  passed: 5,778 tests, with 1 unrelated snapshot failure. `catalog-fitness` changed because
  another session added the Tables chat tools.
- Web `svelte-check` and live checks were not run.

**Production configuration found October 4.**

- Vercel Production has `..._ENABLED`, `..._USER_IDS`, the dedicated client pair and both
  encryption keys.
- The Railway `agentic-chat-worker` and `daily-brief-worker` have no gate variables. That's fine,
  because the worker's ports probe for source-aware connections.

**Rollout status (October 4, 23:50 EDT).**

- DJ committed and deployed `f52586c25`, which contains all of the Calendar work.
- Vercel Production now has `..._ALL_USERS=true` and the 3-user exclusion list. `..._ENABLED` was
  re-saved as an explicit `true` because the old value was write-only and couldn't be read back.
- Production was redeployed (`build-ksncwgsg5`, aliased to build-os.com). Public pages return 200,
  and `/auth/google` redirects anonymous users to login.
- Steps 1–2 below are done. Steps 3–5 are still open.

**Runbook.**

1. Commit and deploy the Calendar work: the granular scopes plus this rollout. The scope migration
   is already applied.
2. In Vercel Production, set:
    - `PRIVATE_MULTI_CALENDAR_CONNECTIONS_ALL_USERS=true`
    - `PRIVATE_MULTI_CALENDAR_CONNECTIONS_EXCLUDED_USER_IDS=144adf8d-8bb6-470a-ae6e-ff922d7ab270,c44daf9e-27d5-4ef0-9ffd-a57887daff95,76c04859-837c-4d13-88ea-9a39ed15ed81`
      (these are the 3 legacy-token users)
    - Confirm `..._ENABLED=true`, then redeploy so functions pick the variables up.

    Older code ignores both new variables, so setting them early is harmless.

3. Run free live checks with a fresh demo Google account:
    - Onboarding → Connect Calendar. Consent should show the BuildOS app and the four permission
      lines, then return connected.
    - Settings shows the account.
    - Time-blocks overlay → connect.
    - Unticking a box returns the "leave all the Calendar boxes checked" notice.
4. In `buildos-gmail-read` → Data Access, replace `calendar` with the four granular scopes.
5. Later: migrate the 3 legacy users with `apps/web/scripts/migrate-legacy-calendar-connections.ts`
   (dry-run first), then empty the exclusion list.

The external legacy user sees no change. Their existing connection and sync webhook keep running
on the sign-in client.

## Gmail workaround research (October 4)

DJ asked for workarounds to the restricted-scope security assessment (CASA). Findings, from
Google's docs as of October 4 unless noted:

- **No workaround keeps full mailbox search without CASA.** `gmail.readonly` and `gmail.metadata`
  are both restricted. An app that stores or transmits restricted data on servers needs a CASA
  assessment, renewed every 12 months. A browser-only reader doesn't escape this once a snippet
  reaches the AI. The Data Portability API has no Gmail data, and Picker has no Gmail view.
- **CASA cost is lower than feared.** CASA now uses assurance levels AL1 and AL2, and Google
  assigns the level. TAC Security lists AL1 at $675/yr ($855 premium) and AL2 at $5,400.
  Developers report AL1 passes in days to a month.
- **CASA-free paths change the experience to "the user picks which emails BuildOS sees":**
    - A per-user forwarding address, or a Gmail filter that auto-forwards. No Google scope.
      Inbound mail is about free on Cloudflare Email Routing or Resend.
    - A Gmail add-on with a "Send to BuildOS" button. Its `gmail.addons.current.message.*` scopes
      are sensitive or non-sensitive, so no CASA.
- **Renting a verified aggregator** (Nylas about $43/mo, Unipile about €49/mo) avoids BuildOS's
  own CASA. The trade-offs: their name appears on consent, the API needs rewriting, and Google
  doesn't endorse the arrangement.
- **The unverified-user cap is 100 per project, lifetime.** It can't be reset. In an approved app,
  an unapproved scope shows the warning screen only to the users who request it. Google says
  every client in a project requesting restricted scopes must be ready when the project is
  submitted.

Decision (DJ, October 4): no full-mailbox workaround exists, so verify Calendar only. Gmail must not
hold Calendar up. Recommended: move the Gmail client into its own Google Cloud project and keep it
live but unverified, invite-only. The 3 connected Gmail accounts reconnect once. Then submit
`buildos-gmail-read` with Calendar scopes only. Revisit AL1 CASA ($675/yr) when mailbox search
earns it.

## Callbacks and credentials

| Flow     | Requested scopes in code                                            | Configuration                                                                                  | Callback                                               |
| -------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Sign in  | `email profile openid`                                              | `PUBLIC_GOOGLE_CLIENT_ID`, matching `PRIVATE_GOOGLE_CLIENT_ID`, `PRIVATE_GOOGLE_CLIENT_SECRET` | `https://build-os.com/auth/google/login-callback`      |
| Sign up  | `email profile openid`                                              | Same sign-in client                                                                            | `https://build-os.com/auth/google/register-callback`   |
| Calendar | `openid`, `email`, `https://www.googleapis.com/auth/calendar`       | `PRIVATE_GOOGLE_CALENDAR_CLIENT_ID`, `PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET`                   | `https://build-os.com/auth/google/calendar-callback`   |
| Gmail    | `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly` | `PRIVATE_GMAIL_READ_CLIENT_ID`, `PRIVATE_GMAIL_READ_CLIENT_SECRET`                             | `https://build-os.com/auth/google/gmail-read/callback` |

Calendar and Gmail callbacks were confirmed in the live Console. Calendar also has the `www`
callback. Gmail has only the apex callback: keep its demonstration on `https://build-os.com`.
Login/signup callbacks above are derived from code and still require Console confirmation. These
custom flows exchange a Google code in BuildOS; sign-in then calls Supabase `signInWithIdToken`.
Do not replace their callbacks with Supabase's hosted callback without changing the implementation.

Calendar multi-account credentials require `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1`; Gmail
requires `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1`. Both must be at least 32 UTF-8 bytes. The
multi-account Calendar feature also checks an enable flag and an exact user allowlist.

The checked `apps/web/.env` lacks both dedicated client ID/secret pairs, the Gmail encryption key,
and the Calendar rollout flag/allowlist. Its sign-in pair and Calendar encryption key are present.
These are local gaps, not proof of absent production configuration. The missing Calendar entries
have been added to `apps/web/.env.example`, with rollout off by default. Use a development OAuth project
and its own callbacks for local work; do not copy production keys into docs or create replacement
encryption keys for already-encrypted production tokens.

## Scope audit

The integration Console declares `openid`, `userinfo.email`, full `calendar`, and `gmail.readonly`.
It does not contain the separate sign-in client. The two API scopes are currently unverified.

| Capability                                                | Implementation evidence                                                                    | Scope review                                                                                                 |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| List selected calendars                                   | `google-calendar-connection.service.ts` → `calendarList.list`                              | `calendar.calendarlist.readonly` suffices for listing alone                                                  |
| Read and write events, move scheduled work, event watches | Shared Calendar read/write services; `calendar-webhook-service.ts`                         | `calendar.events` is a candidate for events; read-only scope cannot support writes                           |
| Availability                                              | `calendar-service.ts` → `freebusy.query`                                                   | Verify free/busy coverage of the final granular set                                                          |
| Create, rename, delete project calendars                  | `google-calendar-project-resource.service.ts`; worker `agent-run-calendar-port.ts`         | `calendar.calendars`; consider `calendar.app.created` only after checking existing/legacy resource ownership |
| Calendar color/preferences                                | `calendarList.patch` in shared resource and legacy services                                | `calendar.calendarlist` is needed for these writes, not just listing                                         |
| Calendar sharing                                          | Shared resource service `acl.insert`; legacy `shareCalendar` / `unshareCalendar` API cases | `calendar.acls`; confirm a visible supported sharing workflow before using it as a demo justification        |
| Gmail search and message bodies                           | Shared `gmail-read-gateway.ts`; Settings read panel; chat email tools                      | `gmail.readonly`; metadata-only permission cannot read bodies and does not eliminate restricted-scope review |

**October 4 migration (built locally, uncommitted).** Each new connection requests four scopes,
checked against each method's Authorization section:

| Scope                            | Consent wording                                                                     | Covers                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `calendar.events`                | View and edit events on all your calendars                                          | events list/get/insert/patch/update/delete, `events.watch`                             |
| `calendar.events.freebusy`       | See the availability on Google calendars you have access to                         | `freebusy.query` (`calendar.events` alone does not)                                    |
| `calendar.calendarlist.readonly` | See the list of Google calendars you're subscribed to                               | `calendarList.list/get` and the identity fallback                                      |
| `calendar.app.created`           | Make secondary Google calendars, and see, create, change, and delete events on them | `calendars.insert/patch/delete` and `calendarList.patch` for BuildOS-created calendars |

The migration dropped these features:

- **Sharing** (`acl.insert`) had no UI or chat caller. It was removed, and the API's
  `shareCalendar` and `unshareCalendar` actions now return 400.
- **Renaming and recoloring a linked calendar in Google.** Linked calendars the user didn't
  create through BuildOS now update only inside BuildOS.

Grants are handled this way:

- Grants holding the full scope are accepted, so nobody is forced to reconnect.
- Partial grants (the user unticked a box) are refused with `scope_mismatch` and a friendly
  "leave all the Calendar boxes checked" notice.
- The credential database functions previously required the full scope. The new migration
  accepts either form, and it must be applied before the code deploys.

Remaining risks:

- Google doesn't document how `calendar.app.created` responds to calendars created under the old
  full scope. Production has 19 project calendars, all belonging to one user (DJ).
- Live consent-screen and linked-calendar checks are pending.

All 104 focused tests passed (41 shared, 62 web, 19 worker). Typecheck passed for the shared
package and the worker. Web `svelte-check` was not run.

The scope migration touched the authorization URL, callback checks, credential refresh checks,
legacy compatibility, and consent tests together. Relevant code:

- `apps/web/src/lib/server/google-calendar-connection.service.ts`
- `packages/shared-agent-ops/src/calendar/google-calendar-credential.service.ts`
- `apps/web/src/lib/services/google-oauth-service.ts`
- `packages/shared-agent-ops/src/email/gmail-read-oauth.service.ts`

Method references: [Calendar scope list](https://developers.google.com/workspace/calendar/api/auth),
[calendar creation](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert),
[calendar deletion](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/delete),
[event watches](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch),
[sharing](https://developers.google.com/workspace/calendar/api/v3/reference/acl/insert),
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Draft form answers

These are drafts for review, not submitted claims. The Calendar paragraph matches the four-scope
migration; every sentence must be visible in the recording. The Console limits each justification
to 1,000 characters.

**Calendar** (928 characters)

> BuildOS is a project planning app with an optional Google Calendar connection, separate from
> sign-in. calendar.events: BuildOS shows events from calendars the user selects, creates, updates
> and deletes the events it schedules for the user's tasks, and watches those calendars to keep
> them in sync. When the user asks, it analyzes their events with AI to suggest projects.
> calendar.events.freebusy: BuildOS checks busy times to find open slots when rescheduling overdue
> tasks. calendar.calendarlist.readonly: BuildOS lists the user's calendars so they can pick which
> to show and where new events go. calendar.app.created: when a user turns on a project calendar,
> BuildOS creates a dedicated calendar and can rename, recolor or delete only calendars it created.
> BuildOS does not share calendars or change other calendars. Users disconnect in Settings. Google
> data is not sold, used for ads, or used to train generalized AI models.

**Gmail — Email productivity** (deferred; Gmail is not part of the Calendar submission)

> BuildOS offers separately authorized, read-only Gmail context for project planning. When a user
> requests it in chat or searches in Settings, BuildOS searches selected accounts and reads
> relevant messages. Message bodies are needed to answer the request; metadata-only access is
> insufficient. Relevant email data may be processed by the disclosed AI providers with
> zero-retention and no-training routing. BuildOS cannot send, draft, edit, delete, archive,
> label or mark mail, and does not download attachments. Email content is not retained in raw
> tool traces; assistant replies and limited operational metadata follow the published retention
> policy. Google data is not sold, used for advertising or used to train generalized AI models.
> Users can disconnect at any time.

## Recording script

Use the actual deployed UI, a browser with the address bar visible, and a demo account whose
calendar and mailbox contain only material suitable for Google's reviewers. Keep the recording in
English or add English captions. Do not expose credentials, tokens, unrelated inbox contents, or
other people's event details. Aim for roughly five to seven minutes; this is a suggested duration.

| Segment | Show                                                    | Explain                                                                                                                                                                                |
| ------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00    | Public homepage, `/privacy`, `/terms`                   | BuildOS is a planning workspace; Google integrations are optional and separate                                                                                                         |
| 0:30    | Sign in to BuildOS                                      | Identity login grants no automatic Calendar or Gmail connection                                                                                                                        |
| 1:00    | Settings → Calendar → Connect another                   | Show the actual Google app identity, full authorization URL/client ID, requested permissions, and affirmative consent; show the unverified-app screen if it appears                    |
| 2:00    | Connected sources and default write calendar            | Choose a demo source; show a sample event, create/update it through the supported UI, and show the result in Google Calendar                                                           |
| 3:00    | Project calendar controls                               | If requesting calendar-resource/sharing access, demonstrate the corresponding shipped controls with a consenting demo collaborator; otherwise resolve scope reduction before recording |
| 4:00    | Settings → Email → Connect Gmail                        | Show the separate Gmail client's consent screen and read-only permission                                                                                                               |
| 4:45    | Select demo mailbox, search for a known sample, open it | Show why message bodies are needed, the read-only controls, and attachment blocking                                                                                                    |
| 5:30    | Disconnect demo integrations                            | Show account control and explain revocation; do not disconnect everyday accounts merely to record                                                                                      |

Capture every client remaining in `buildos-gmail-read`. If the QA client remains, the two
production flows alone are not the complete project demonstration. Use normal UI search/read for
the free rehearsal. Demonstrating AI chat or Calendar analysis incurs model cost and requires a
separate approved paid test run under the repository rules. The recorded workflow must match the
submitted AI-use claims; do not silently omit AI processing from the final evidence.

See Google's [verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
for demo visibility, consent, and functionality evidence. The recording is not yet made or uploaded.

## Data flow for the security assessment

Google consent → BuildOS callback → single-use state / PKCE / verified identity for the dedicated
integrations → encrypted account-bound credentials in Supabase → server-side Calendar or Gmail
gateway → the user's UI or requested AI workflow. Calendar synchronization also uses worker jobs
and webhook channels. Sign-in is a separate Google-to-Supabase authentication flow.

Include web hosting, workers, database, AI routing/providers, access controls, token-key handling,
logs, retention cleanup, revocation, and account deletion in the assessment boundary. Avoid claiming
that no Google data touches a server or that nothing is stored: assistant summaries can remain in
chat and the published policy lists limited metadata retention. Existing evidence inventories:
[privacy claims](../privacy/CLAIMS.md) and [data inventory](../privacy/DATA_INVENTORY.md).

## Repeatable free checks

```bash
node scripts/check-google-oauth-readiness.mjs --env-file apps/web/.env
node scripts/check-google-oauth-readiness.mjs --env-file apps/web/.env --offline
node --test scripts/check-google-oauth-readiness.test.mjs
```

The script reports configuration presence, client separation, encryption-key length, rollout
configuration, and unauthenticated public HTTP status/content hashes. It never outputs secret
values, performs a token exchange, sends mail, modifies a calendar, or calls a model. The explicit
env file is checked in isolation; it is not merged with shell variables or treated as deployed
configuration. A failed local configuration check is expected until development credentials are
provided. A passing script does not establish Google verification, functional consent, key entropy,
or legal/policy compliance.

October 4 validation: all four public endpoints returned 200; four lightweight readiness tests
passed. Existing focused OAuth suites also passed: 9 sign-in/callback tests, 16 legacy Calendar
OAuth tests, 12 multi-account Calendar connection tests, and 15 Gmail OAuth tests (52 total).
The machine-wide test gate initially deferred both Vitest runs; each was retried after waiting
and completed successfully. Local configuration reported the missing values described above.
No paid live validation was authorized or run.
