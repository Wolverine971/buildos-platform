<!-- tasker/148-mobile-app.md -->

# 148 — BuildOS iPhone app (Expo): Phase 0 groundwork + Phase 1 shell

**Status (2026-11-13):** Phases 0–4 (native chat rounds 1–2), the daily brief and the Account & data entry are COMMITTED (`39bdf26ac`, 11-01). Never run on a real iPhone; no Apple Developer or Expo account yet. The web has moved ahead since (new Today, chat turn cards, threads, inbox). · **Opened:** 2026-10-28 · **Owner:** Claude
**Plan:** `docs/specs/MOBILE_APP_PLAN_2026-10-23.md` · **App:** `apps/mobile/README.md` · **Auth design:** `docs/architecture/AUTHENTICATION_AND_PERMISSIONS.md` → "Native app sessions"

## What users get

A real iPhone app for the morning moment: Today, capture, projects and chat on the phone, native
notifications for the daily brief, and the same account, data and permissions as the website.
Two screen layers over one system; the API and auth are shared, so there is one BuildOS to
maintain.

## DJ calls (2026-10-23)

Expo + React Native. Native core (Today, capture, projects, reader, task/doc, chat, notifications,
briefs) plus web pages inside the app for the rest (settings, billing, integrations, agent keys,
invites, account deletion). iPhone first, offline capture queue, billing stays on the web.

## Built 2026-10-28

**Server (Phase 0), all free and tested**

- **Bearer sign-in for every API route.** `apps/web/src/hooks.server.ts` takes
  `Authorization: Bearer <Supabase access token>` (JWT-shaped only) and builds a cookie-free client
  (`createSupabaseBearer` in `packages/supabase-client`); `getVerifiedBearerSession` in
  `$lib/server/session-verification.ts` verifies it like the cookie path (claims locally, live
  Auth on mutations and sensitive routes). Bad token → no session, never a cookie fallback. Agent
  tokens (`boca_`, `bo_`) are untouched. `locals.authSource` says which path ran.
- **Session handoff** (`$lib/server/auth-handoff.service.ts`): `POST /api/auth/handoff` (bearer
  only) → 60-second single-use code → `GET /auth/handoff?code=…` consumes it in one UPDATE, mints a
  magic-link token server-side, verifies it on the cookie client, redirects with `?app=1`. Table
  `auth_handoff_codes` (service role only).
- **App mode** (`$lib/server/app-mode.ts`): `?app=1` or cookie `buildos_app` hides Navigation and
  Footer in the root layout; `?app=0` clears it.
- **Universal links**: `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
  from env, 404 until `PRIVATE_IOS_APP_IDS` / `PRIVATE_ANDROID_*` exist; claim native paths only.
- **Native push plumbing**: `push_subscriptions` gained `provider` (`web_push` | `expo`),
  `platform`, `device_name`, `app_version`; keys nullable for Expo rows. The existing
  `emit_notification_event` fan-out and push preference apply unchanged. `/api/push/devices`
  (GET/POST/DELETE) registers Expo tokens; the worker sends `provider = 'expo'` rows through Expo's
  push API (`apps/worker/src/workers/notification/expoPushAdapter.ts`) and deactivates dead
  devices.
- **Migrations APPLIED to prod + recorded:** `20261028170000_push_subscriptions_native_providers.sql`,
  `20261028170100_auth_handoff_codes.sql` (rehearsal passed, dry-run with ROLLBACK first). Types
  regenerated via the Supabase CLI (`packages/shared-types`; also picked up the builder-profile
  and llm_call_incidents tables and the dropped question-tree tables that earlier sessions had
  left stale).
- **Shared API client** `packages/api-client` (`@buildos/api-client`): bearer auth, envelope
  unwrap, typed errors (401 / 402 upgrade-required / offline), FormData passthrough, streaming
  `raw()`, typed endpoints for the native core. Metro reads its TS source via the `react-native`
  export condition; Node/web use the tsup dist.
- **Inkprint theme for native**: `pnpm gen:mobile-theme` turns `inkprint.css` into
  `apps/mobile/src/theme/inkprint.generated.ts` (22 tokens × light/dark, `--check` for drift).

**App (Phase 1 shell)** `apps/mobile/` — Expo SDK 58, Expo Router, session in the iOS keychain
(chunked), TanStack Query keyed by user, sign in with email + password, Today read-only through
`/api/today`, Inkprint light/dark. Runs in Expo Go. pnpm isolated install works (no hoisting
needed): see "Install spike" below.

## Checks

| Check                                                    | Result                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| hooks + session verification + bearer helper (vitest)    | 86 passed                                                                                     |
| handoff service + routes, trust files, app mode (vitest) | 28 passed                                                                                     |
| mobile config + keychain storage (vitest)                | 11 passed                                                                                     |
| Inkprint theme generator (node --test)                   | 3 passed, `--check` clean                                                                     |
| api-client (vitest / typecheck / build)                  | 26 passed, clean, dist built                                                                  |
| push devices route + Expo adapter (vitest)               | 15 + 20 passed; prefs 16 still green; worker typecheck clean                                  |
| Live bearer check against a local dev server (port 5199) | PASSED, see below                                                                             |
| `pnpm --filter @buildos/web check` (svelte-check)        | 0 errors in this session's files; 5 pre-existing errors in 2 other files (see landmine below) |
| `pnpm --filter @buildos/mobile typecheck` + `export`     | clean; Metro 1,278 modules in 5.6 s                                                           |
| `expo-doctor`                                            | 20/20                                                                                         |

## Live check 2026-10-28 (local web dev server on 5199, prod Supabase, DJ's account)

A one-off script minted a short-lived session for DJ's account (admin magic link → verifyOtp),
then called the dev server with the access token as a bearer header and revoked the session after.

| Request                                                       | Result                                      |
| ------------------------------------------------------------- | ------------------------------------------- |
| `/.well-known/apple-app-site-association`, `assetlinks.json`  | 404 `Not configured` (env unset), no-store  |
| `/api/auth/user` with no header / garbage JWT / `boca_` token | 401 JSON, no Set-Cookie                     |
| `/api/auth/user` with a real bearer (live Auth path)          | 200, id matches the minted session          |
| `/api/today` with a real bearer (claims path)                 | 200, full feed (10 keys)                    |
| `/api/onto/projects` with a real bearer                       | 200                                         |
| `POST /api/auth/handoff` with a real bearer                   | 200, one-time URL                           |
| `GET /auth/handoff?code=…` (first open)                       | 303 → `/profile?app=1`, session cookies set |
| same URL again                                                | 303 → `/auth/login?error=handoff_expired`   |

## Install spike (the plan's first landmine)

`pnpm install` with `apps/mobile` in the workspace took 27 s and added ~3.8k lockfile lines; Expo
SDK 58 installed under pnpm's default isolated layout with no `.npmrc` changes. `expo install`
resolved SDK-matched versions from inside the workspace. `pnpm --filter @buildos/mobile export`
then bundled 1,278 modules in 5.6 s, including `@buildos/api-client` from source and
`@buildos/shared-types` from dist, with no Metro config. Remaining proof: a run in Expo Go on
DJ's phone.

## Needs DJ

- **Apple Developer account** ($99/yr): individual (shows your name) or company (needs a D-U-N-S
  number, ~2 weeks). Start early; Phase 5 (push, Google/Apple sign-in, TestFlight) waits on it.
- **Bundle ID**: `com.buildos.app` is set in `app.json`; permanent once published.
- **Expo account** (free) for EAS builds later.
- Whether the Cadre collaborator works on this app.
- First run: `cp apps/mobile/.env.example apps/mobile/.env.local`, fill the Supabase URL + anon key,
  `pnpm --filter @buildos/mobile dev`, scan with Expo Go.

## Next (updated 2026-11-13; sections below hold the history)

Resume here. Everything through the style pass is committed; `apps/mobile/README.md` describes
the current screens, kit and capture pipeline; the memory note `project-mobile-app-plan-2026-10-23`
has the decision log.

Commit state 2026-11-13: everything through chat round 2 (2a/2b/2c) and the Account & data
entry is COMMITTED in DJ's `39bdf26ac` (2026-11-01); nothing in `apps/mobile`,
`packages/api-client` or `packages/agentic-chat-client` has changed since. This tracker is still
untracked. Re-checked 11-13: mobile tsc clean, vitest 262/262. Web API changes since 11-01 that
the phone reads are all additive (`GET /api/today` gained `attention` = waiting-on-you list +
repeated brief suggestions; `GET /api/chat/sessions/[id]` gained `contextSelections`), so the
phone still works but does not show them. Web features the phone lacks: the reimagined Today
(pick card, waiting list, close-out, Keep/Snooze/Let go), chat turn cards ("Pulled in 3 of 9"),
threads, move-chat-to-project, the inbox.

1. **Real iPhone run** (DJ): `.env.local` from `.env.example`, `pnpm --filter @buildos/mobile dev`,
   Expo Go. The simulator passes; unverified on a device: `Link.Preview` peek on tiles, the
   transparent pull-to-refresh, reader sheet detents with the keyboard up, voice capture end to end.
2. **Phase 4 native chat: round 1 BUILT 10-30** (see "Phase 4" below). DJ's answers: like the web,
   little change; Brain Bolt top-right on every page; Workspace + project context; copy web
   patterns; agent work shown as on the web (folded "Worked for 54s · 12 steps"). Still to do:
   device run of a real turn (needs the web deploy that accepts bearer on `/api/agent/v2/turns`,
   already live on prod); round 2 DONE 10-31: proposal / pending-change cards, the reader's Chat
   key, context on open, and the changes row (created chips, document and table change cards
   with Undo; see "Chat round 2c" below). Still open: image attachments, a user-wide chat list
   route if chat gets its own tab, haptic + "agents working" badge polish, the web adopting the
   moved package's barrel instead of shims, and a real turn on a device that creates or edits
   something (paid; the demo state `/chat?demo=changes` covers the look).
3. **Deploy-dependent checks** once the web deploy that carries the mobile fixes is live: native
   multipart POSTs pass the CSRF guard (bearer exemption), `/api/transcribe` long recordings,
   capture `idempotency_key` on the note path, `GET /api/projects/desktop` (the phone falls back
   to plain tiles until then). 10-31: production answers 401, not 404, on `/api/projects/desktop`,
   `/api/agent/v2/turns` and `/api/auth/handoff` (unauthenticated probe), so that deploy is live;
   the in-app checks (multipart CSRF, transcribe timeout, note idempotency) remain to be felt on a
   device.
4. Web adopts `@buildos/api-client` for new fetches; move the Today-feed types into the client so a
   shape change breaks both apps at compile time (needs `pnpm install` on the shared lockfile plus a
   full web check; do it in a quiet moment).
5. Account deletion in-app: the entry is BUILT 10-31 (Account key → "Account & data" opens the
   website's Profile → Account page signed in, where "Delete My Account" lives; App Review 5.1.1
   accepts a direct link). Left: prove deletion end to end on a test account WITH DJ (tracker 103;
   the fix migration is applied, the proof tool is `scripts/account-deletion-proof/run.sh`).
6. Needs DJ: Apple Developer enrollment (individual vs company/D-U-N-S), Expo account, collaborator.

## Facts from the API client build (matter for Phases 2–4)

- `POST /api/agent/v2/turns` is not a stream: it returns a JSON admission (202 new / 200
  duplicate) and the turn's events arrive over the session's Supabase realtime channel. The
  phone subscribes to realtime (supabase-js works in React Native); `api.agent.sendTurn` is the
  typed call and `sendTurnRaw` returns the Response.
- `GET /api/daily-briefs?date=` returns one brief (`{ brief }`), not a list; the client calls it
  `briefs.forDate`.
- `/api/onto/projects/[id]/tasks` requires a `bucket` query parameter.
- Quick capture for Phase 2 is `POST /api/workspace/capture` (note or task into the Workspace, no
  model call), typed as `api.workspace.capture` with an idempotency key so an offline retry
  returns the saved item instead of a duplicate. `api.push.listDevices` and
  `api.agent.listActiveTurns` were added for the devices list and chat resubscribe.

## Landmines found

- **Two other sessions' migrations are not applied in production**, and their web code already
  calls what those migrations create. Regenerating `database.types.ts` from prod (which this
  session had to do for the push columns) made that visible as 5 svelte-check errors:
  `src/lib/server/email-campaigns/sender.ts` calls `get_email_campaign_daily_allowance`
  (defined only in unapplied `20261026171609_email_campaign_atomic_daily_cap.sql`), and
  `src/routes/api/onto/invites/[inviteId]/accept/+server.ts` reads `agent_access`,
  `project_name`, `status` from `accept_project_invite_by_id` (prod still returns
  `project_id, role_key, access`; the new shape is in unapplied
  `20261024023325_four_ways_project_join.sql`, tracker 143). HEAD's types file was stale in
  both directions (it also lacked the builder-profile and `llm_call_incidents` tables and still
  had the dropped question-tree tables). Fix = rehearse and apply those two migrations, then
  regenerate; do not hand-edit the types back. Until then a web deploy would 500 on those two
  paths regardless of types.
  **Resolved 2026-10-29:** the production ledger now lists both migrations as applied, the
  types committed in `fb09e9c33` include `get_email_campaign_daily_allowance` and the new
  invite-accept shape, and a plain `tsc --noEmit` over `apps/web` reports 0 errors.

- `pnpm gen:types` refuses the REST source (would erase Libri types) and the CLI source wants
  `SUPABASE_ACCESS_TOKEN` in `sbp_` format; the keychain login is a newer token format. Workaround
  used: `supabase gen types typescript --linked --schema public,libri > packages/shared-types/src/database.types.ts`
  then `pnpm gen:schema` + build.
- Port 5173 on DJ's machine is the Wayne Strategies site, not BuildOS. Live checks here used a
  fresh port (5199).
- `apps/mobile` pins TypeScript ~6.0.3 (what Expo 58 expects); it is isolated to that package and
  does not touch the web/tsup 5.9 lane.

## Phase 2 capture: in progress (api-client session, 2026-10-29)

Text capture with the offline queue, against `POST /api/workspace/capture` through
`api.workspace.capture`. Files: `apps/mobile/src/lib/capture-queue.ts` (pure queue, tests in
`tests/capture-queue.test.ts`), `src/lib/secure-storage.ts`, `src/hooks/use-capture-queue.ts`,
`src/components/pending-captures.tsx`, `src/components/header-button.tsx`, `src/app/capture.tsx`
(modal behind a Capture header button on Today), plus the two wiring edits in `src/app/_layout.tsx`
and `src/app/index.tsx`. Voice (recorder → `/api/voice-notes` + `/api/transcribe`) is not started;
placement of the capture surface is a DJ call (see the briefing artifact).

Review pass (parent session, 2026-10-29), two fixes on top of that build:

- Queue: a capture added while a drain was already running was not sent until the next
  foreground or launch, and an item never attempted (a second capture while offline) read as
  "Saving…" forever. The drain now re-reads the list each round, and the queue exposes
  `snapshot().lastStop`, so Capture and the Today strip say "no connection", "sign in to send"
  or "unreachable, will retry" from the real reason. 23/23 mobile tests.
- Server: `captureLooseItem`'s note path ignored `idempotency_key` (only the task RPC honored
  it), so a note retried after a dropped response would have double-saved. The key is now
  stored in `onto_documents.props.idempotency_key` and looked up by project before the insert
  (`workspace.service.capture.test.ts`, 3 tests). The phone's "never double-save" promise needs
  this web change deployed. Noted, not changed: the task RPC's replay lookup is by key alone,
  not per project; keys carry ~83 random bits, so it is not a practical risk.

Commit state: Phase 0 + Phase 1 + the API client are in `fb09e9c33`. Still uncommitted: the
Phase 2 files above, the two `_layout.tsx`/`index.tsx` wiring edits, `workspace.service.ts` +
its new test, this tracker (never committed), and the plan's status line.

## Phase 2 round 2: voice, smart sort, bottom capture bar (2026-10-29)

**DJ calls (2026-10-29):** "talk, then it lands" voice; match the web capture box's smart sort
(no Note/Task picker); capture bar pinned to the bottom of Today (type, or tap the mic).

**What the phone does now**

- **Bottom capture bar on Today** (`src/components/capture-bar.tsx`): a "Jot anything…" field and
  one round key that is a mic when the field is empty and a send arrow when it is not. Recording
  turns the bar into a red-outlined strip: discard (✕), pulsing dot, timer, live waveform, stop
  (■ = keep). Haptics on start, save and send. The header Capture button and the Capture sheet
  from round 1 are gone.
- **Voice** (`src/hooks/use-voice-recorder.ts`, `src/lib/capture-audio.ts`): expo-audio records
  16 kHz mono AAC at 32 kbps straight into the documents folder (~4 KB/s, so 10 minutes ≈ 2.4 MB,
  under Vercel's 4.5 MB request limit). It stops itself at 10 minutes, keeps what was said when a
  call or the app going to the background interrupts it, and throws away taps under 0.8 s.
  Recordings are stored by path relative to the documents folder because iOS changes the app's
  container path on updates (`src/lib/audio-path.ts`).
- **Queue v2** (`src/lib/capture-queue.ts`): every capture walks transcribe (voice only,
  `POST /api/transcribe` with `allowEmpty`) → save (`POST /api/workspace/capture` as a note, the
  item id as idempotency key, source `ios` / `ios_voice`) → sort (`POST /api/workspace/capture/sort`).
  Progress is persisted after each step (a retry never re-transcribes); the recording is deleted
  once its words are saved. A recording with no speech becomes "needs you" with its audio kept. A
  capture that fails on the server 3 times in a row stops blocking the rest. A sort that cannot run
  is dropped and the note stays a note. Round-1 items (v1 storage, including picked tasks) still
  send. Sorted results ("2 tasks → Fading Crown") show above the bar for 12 s with Undo
  (`POST /api/workspace/capture/sort/undo`), and Today refreshes after a sort.
- **API client:** `api.workspace.sortCapture` and `api.workspace.undoSort`, typed against the web's
  `CaptureSortResult` / `CaptureUndoResult`.

**Server changes (ship with the next web deploy; voice needs them)**

- `apps/web/src/lib/server/csrf.ts`: the app's cross-site form-post guard returned 403 for every
  phone upload, because a native multipart POST carries no `Origin`. Requests with a JWT-shaped
  user bearer token now pass: CSRF rides on cookies, the bearer path never reads them, and a
  browser cannot attach an `Authorization` header to a cross-site form post. Non-JWT bearers
  (agent tokens), Basic auth and missing headers are still guarded (csrf tests +2).
  SvelteKit's built-in check is already off (`trustedOrigins: ['*']`).
- `apps/web/src/routes/api/transcribe/+server.ts`: per-attempt timeout scales with upload size
  (`$lib/server/transcription/transcription-timeout.ts`): dictation segments keep 30 s; a
  10-minute phone recording gets ~87 s, capped at 95 s under the route's 100 s deadline.

**Dependencies:** `expo-audio`, `expo-file-system`, `expo-haptics`, `expo-symbols`, plus their
peers `expo-asset`, `expo-font` (all via `expo install`, SDK-matched; Expo Go ships them). The
lockfile change is scoped to `apps/mobile`. `app.json` gained the `expo-audio` plugin with the
microphone copy. expo-doctor 19/20: the one miss is `react-native` 0.88.0 vs Expo's expected
0.88.1, which predates this round.

**Review pass (deep-reasoner, read-only) and fixes, same day.** No data loss on the normal path;
the CSRF exemption is safe (no route sends `Access-Control-Allow-Credentials`, so cookies and an
attacker-set bearer never arrive together). Fixed from its list:

- Double-tap Send saved twice (the input cleared only after the keychain write): the bar now
  clears first, guards with a ref, and gives the words back if the save fails. `maxLength`
  20,000 (the server's `CAPTURE_TEXT_MAX`).
- A capture could land in another account if someone signed out and another person signed in
  mid-upload: the queue now uses `createUserApi(userId)` (`src/lib/api.ts`), which fails as
  signed out unless that same person is signed in. Same fix covers "no token": a multipart
  upload without a token would have been refused as cross-site (403 → "failed") instead of
  waiting as signed out.
- No request timeouts: transcribe 115 s, save 30 s, sort 45 s (AbortController); an abort counts
  toward the 3-strike rule.
- An unreadable keychain read wiped the queue on the next write: a read failure now fails the
  call and is retried; only unparseable data starts over.
- A missing recording held the queue for three rounds: `CaptureRejectedError` sends it to "needs
  you" at once. A struggling sort no longer holds later captures (`deferred`).
- The "waiting to send" note stayed up during a successful retry: it clears on the first step
  that gets through.
- After an audio-system reset the recorder points at a fresh empty file: the hook keeps the URI it
  started with. Recordings are now named `<userId>-<time>`, and on launch the queue adopts any of
  that account's recordings no capture points at (app closed between stop and save, screen gone
  mid-recording); header-only files are deleted.
- Server: a sort retry that landed during the model call could sort twice. `sortCapturedNote` now
  claims the note (`props.sorted = 'sorting'` where it is still null; Postgres re-checks the row)
  before the model call (`capture-sort.service.test.ts` +1).

Not changed: "talk, then it lands" holds the recording's words only after transcription, so a
recording is never deleted before its note is saved; a recording whose note saved but whose file
could not be deleted would be adopted again at the next launch (a duplicate note, never a lost
one).

**Checks:** mobile tsc clean, vitest 51/51 (capture queue 35, audio paths 3); api-client vitest
29/29 + tsc clean; web vitest 57/57 (csrf, transcription timeout, workspace incl. sort,
hooks.server); web `tsc --noEmit` 0 errors; Metro export 1,323 modules. No paid calls. Not yet
run: a real iPhone (recording, waveform, keyboard riding, airplane mode, 16 kHz AAC accepted by
the device encoder) and a live upload against a server with the CSRF change.

## Phase 3: projects, tasks and docs on the phone (2026-10-29)

**DJ calls (2026-10-29):** both surfaces with one shared reader (Today command center + Projects);
quick actions + light edit; no Chat button until Phase 4.

**What the phone does now**

- **Tab bar** Today | Projects (`src/app/(tabs)/_layout.tsx`, `expo-router/js-tabs`; native iOS
  tabs exist in Expo Router 58 but are unstable and untested with the bottom capture bar). Today
  moved to `src/app/(tabs)/index.tsx` (a staged rename).
- **Today = command center:** every task row opens the reader; Prev/Next walk the day in the order
  Today shows it. "What's waiting" rows open their project. Done tasks stay, struck through, until
  the next refresh (the feed returns active tasks only), as on the website.
- **Projects tab** (`(tabs)/projects.tsx`): Workspace pinned on top (where captures land), then
  projects in motion (planning/active) by last update, then paused/finished folded.
- **Project page** (`src/app/project/[id].tsx`): next step (or description), Tasks | Docs switch.
  Tasks grouped with the server's own bucket rule (`src/lib/task-buckets.ts`, mirrors
  `get_project_full`): Overdue, In progress, Scheduled, To do, Blocked, Done (folded). Reads the
  lean `v2-initial` profile the website's project page uses; a group the first read cut short gets
  "Show all N" (`/api/onto/projects/[id]/tasks?bucket=`), folded into the cached project. Docs in
  the website's tree order with depth (`src/lib/doc-order.ts`), "Start here" first.
- **One reader** (`src/app/reader.tsx`, modal sheet; `src/components/reader/*`):
    - Task: inline title rename, state chips (To do / In progress / Blocked / Done), due quick picks
      (Today / Tomorrow / Next week / Pick a date / Clear, sent as civil days), description as
      formatted markdown with Edit (plain text). Bottom bar: Prev · Mark done/Reopen · Next.
    - Doc: inline title rename, formatted body, Edit as plain text; saves carry
      `expected_editor_revision`, a 409 keeps the person's text and offers "Load their version".
      Table docs are read-only here.
    - Every task change is optimistic across every cached copy (task, Today, project) and rolls back
      on failure (`src/hooks/use-entities.ts`).
- **Markdown** (`src/lib/markdown.ts` + `src/components/markdown.tsx`): the website's `marked`
  lexer into a small block model rendered natively (headings, lists with checkboxes, quotes, code,
  rules, tables, links); raw HTML shows as text.
- **Capture bar** now measures its real position for the keyboard, so it rides the keyboard
  correctly above the tab bar.

**Dependencies:** `@react-native-community/datetimepicker` 9.2.1 (`expo install`), `marked`
^16.3.0 (same major as web). Lockfile change scoped to `apps/mobile`.

**Review pass (deep-reasoner, read-only) and fixes, same day.** Contracts confirmed (v2-initial
docs carry no body, so the reader fetches it; `context_document` is also in `documents` and is
filtered; table check matches the server; PATCH returns the full row). Fixed from its list:

- Drafts could be lost: Save sat in the bottom bar behind the keyboard, and Done or a swipe-down
  closed the sheet. Readers now expose `flush()` (`components/reader/reader-handle.ts`): Done,
  Prev and Next save a title or body still being typed first and stay put if a save fails; the
  sheet can't be swiped away while something is unsaved (`gestureEnabled: !dirty`); doc Save and
  Cancel sit above the editor.
- A doc save could carry a revision fetched after Edit was tapped (overwriting someone's newer
  edit): the revision is captured at Edit, and Edit waits for a settled read.
- Title and body saves raced into a false "someone else edited this" (the revision hashes the
  title): saves of one doc run one at a time (`scope`), a title save reads the newest revision when
  it is sent, and an open body edit's revision moves forward with the person's own rename.
- Out-of-order task answers could undo each other (slow due date, then fast Mark done): edits now
  touch only their own fields, the server's answer replaces only those, and an undo or late answer
  never overwrites a newer edit (`src/lib/task-cache.ts`, `tests/task-cache.test.ts`). Readers use
  `mutateAsync`, so every save reports its own error.
- "Show all" stopped at 100: it now pages through (`fetchWholeBucket`).
- Archived docs showed as normal docs: left out, as on the website.
- A due pick could show the wrong day when the account's saved timezone differs from the phone's:
  picks are sent as the end of that day on the phone (an instant), not a bare `YYYY-MM-DD`.
- Renaming "Start here" didn't update the project page: `context_document` is patched too.

**Checks:** mobile tsc clean, vitest 68/68 (`reader-logic` 15, `task-cache` 4); Metro export
1,349 modules; expo-doctor 19/20 (the old react-native 0.88.0 vs 0.88.1 note). No server changes,
no paid calls. Not yet run: a real iPhone.

## Style pass (2026-10-29)

**DJ call:** the ambitious version of the side-by-side mockup: the phone now looks like
build-os.com. Nine build agents plus one integration pass. UNCOMMITTED.

**What changed on the phone**

- **One kit** (`apps/mobile/src/components/kit/`, see README "Look"):
    - Inkprint tokens plus `typeScale`, pulse colors, ink shadows and one `Ink` object per scheme.
    - Graph paper, halftone and seeded bench grain, all drawn in SVG.
    - Raised `Key` / `RoundKey` with a lip, spring and haptics; `MicroLabel` / `Stamp`.
    - The Build**OS** wordmark.
    - A drawn bolt for every loading state (`BoltSpinner`) and for pull to refresh (`BoltScrollView`).
    - Lucide icons, the same set as the website.
- **Frame:**
    - Grainy bench behind the status bar, the 54pt nav bar and the tab bar; the page sits on it as a sheet.
    - Tabs are **Today** (Sun) and **Workspace** (FolderOpen), with an accent top bar and a selection haptic.
    - The account key opens an action sheet with your email and Sign out.
- **Today:**
    - Title + date, "N events · N tasks", a chip row (overdue, Up next).
    - All day, Schedule (mono time rail, "now" line), Anytime today (bucket labels, project sub-heads, plain rows with an accent bar on the last opened), Here's what's waiting.
- **Workspace (was Projects):**
    - Search; `LOOSE · N` loose items (open in the reader); `PROJECTS · N` with Recent | By activity and an ⓘ legend sheet.
    - A 4-column grid of website tiles: pulse tint, halftone, D/T meters, overdue badge, folder tab, "N NESTED".
    - Long-press a tile on iOS for a peek card (pulse, NEXT STEP, open-task mix) and an Open menu.
- **Project:**
    - Back label follows where you came from; Start here and ⋯ (Open on the web) keys.
    - Header with tile, pulse pill, "N open · N done", NEXT STEP and "Inside this project" tiles.
    - Sticky Tasks | Docs underline tabs; glyph rows with mono date chips.
- **Reader:**
    - A native iOS form sheet (66% and full, grabber, 18pt corners). Head with glyph tile and editable title.
    - Four-segment state switcher; fact tags (Priority, Due → action sheet with Today / Tomorrow / This weekend / Next week / Pick a date / Clear, Updated, Edit).
    - Bottom bar ‹ | Mark done | Close | ›. Editing grows the sheet to full height.
- **Capture box** (docked on both tabs): the website's box (graph paper, focus ring), round Send and Mic keys, and a live level ring while recording. "ON THIS PHONE" pending rows.
- **Sign in:** restyled on the kit (wordmark, fields, primary key).
- **Kept:**
    - Capture queue (offline, voice, sort + Undo).
    - Reader flush and dirty guards; Prev/Next walks.
    - Optimistic task edits; doc revision conflicts.
- **Removed:** `button.tsx`, `icon-button.tsx`, `text-field.tsx`, `text.tsx`, `reader/chip.tsx`, `reader/reader-bar.tsx`, the unused `useProjects` hook. Nothing calls ActivityIndicator or SymbolView any more, and there are no chat buttons.

**New endpoint: `GET /api/projects/desktop`** (`apps/web/src/routes/api/projects/desktop/+server.ts`,
mapping in `$lib/server/projects/desktop-response.ts`).

- One request returns every project as a tile (pulse, D/T bars, task mix, emoji, parent) plus the Workspace's loose items.
- It makes the same reads as the website's Projects page, user-scoped, so RLS applies.
- **Needs a web deploy.** Until then, production answers that path through `/api/projects/[id]` with **500 DATABASE_ERROR**.
- The app treats that as "route missing" and falls back to plain monogram tiles: no pulse, no bars, no nesting (`src/lib/desktop-fallback.ts`). It rechecks the route every 10 minutes.

**Refresh wiring:**

- A saved, sorted or undone capture refetches the Workspace data at once.
- A task edit only marks it stale. The Workspace tab refetches stale data when it regains focus (for example when the reader closes), so a burst of Mark done / Next costs one read.

**Checks (integration pass, run one at a time, all free):**

| Check                                                                                                        | Result                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @buildos/mobile typecheck`                                                                    | Pass. Clean on the first run. Confirmed real with a probe file containing deliberate errors, which tsc caught. Still clean after the tidy edits. |
| `pnpm --filter @buildos/mobile exec vitest run`                                                              | **152/152** in 13 files. New: `kit`, `desktop`, `desktop-fallback`, `today-agenda`, `project-format`, `reader-due-menu`.                         |
| `pnpm --filter @buildos/api-client exec vitest run`                                                          | 30/30                                                                                                                                            |
| `pnpm --filter @buildos/web exec vitest run src/lib/server/projects/desktop-response.test.ts`                | 6/6                                                                                                                                              |
| Narrow `tsc` on the new web route, its `$types` and the response module (scratch tsconfig, not svelte-check) | Pass                                                                                                                                             |
| `pnpm --filter @buildos/mobile export` (Metro iOS)                                                           | Pass. 1,545 modules, one 4 MB Hermes bundle. Per-icon Lucide imports resolve. `dist/` deleted afterwards.                                        |
| `pnpm --filter @buildos/api-client build`                                                                    | Not needed: mobile tsc reads the client's TS source via the `react-native` condition.                                                            |
| `app.json`                                                                                                   | Read only. No plugin needed for react-native-svg or lucide (neither ships one; Expo Go bundles svg).                                             |

Not run: svelte-check and the full web suite (svelte-check kills the dev server), expo-doctor,
and a real iPhone.

**Needs DJ**

1. **Expo Go run on your iPhone, light and dark.** Look at:
    - the grain on the nav and tab bars, key lips and press feel;
    - tile tints and meters, the capture box focus ring and recording ring;
    - the dock fade above the capture box.
2. **Long-press a tile** on Workspace: the peek card should appear with an Open menu, and tiles must not vanish. This needs the iOS native link preview, which Expo Go SDK 58 ships.
3. **Pull to refresh** on Today, Workspace and a project: the bolt should charge as you pull and spin while refreshing, with no stock spinner flashing through.
4. **Reader sheet detents:**
    - it opens at 66% and drags to full;
    - tapping Edit jumps it to full height and it drops back after Save or Cancel (the jump has no animation);
    - the doc editor's bar should ride the keyboard;
    - the Due action sheet and inline calendar should work inside the sheet.
5. **Deploy the web** so `/api/projects/desktop` is live. Tiles then get pulse, bars, emoji and nesting within 10 minutes, or on the next app launch.
6. VoiceOver spot check on the tabs ("Today, tab, 1 of 2") and on a tile label.

**Review fixes (2026-10-29, after a skeptic-verified review; UNCOMMITTED)**

1. **Doc editor bar under the keyboard** (major). Inside the reader's native form sheet,
   `measureInWindow` measures from the sheet's top, so the lifted Cancel/Save bar came up
   ~60–70pt short and sat under the keyboard. While editing, the sheet is full height, so the
   bar now lifts by `window height − keyboard top` with no measuring
   (`useKeyboardOverlap(ref, { restsOnScreenBottom: true })`). Math in `src/lib/keyboard-lift.ts`.
2. **VoiceOver was silent on every error and result** (major). `accessibilityRole="alert"` and
   `accessibilityLiveRegion` do nothing on iOS. New `useAnnounce` (`src/hooks/use-announce.ts`,
   queued announcements) now speaks the reader's error and conflict notes, a reader load error,
   the capture box's errors and undo results, the sort result (once across both tabs, with
   "Undo available"), and sign-in errors. While VoiceOver is on, the sort result no longer
   auto-dismisses after 12 s.
3. **Light-mode warning text at under 3:1** (major). New `ink.warningText` (light: warning 60%
    - foreground, #765d12, ≥ 5:1 on sheet, card and muted) for "Blocked", the WAITING stamp
      and the recording timer. The pulse pill text now pulls toward the foreground until it reads
      at 4.5:1 (`readableMix`; only light "Gone quiet" changes).
4. **Project task rows all re-rendered on every page render** (perf). Rows are a memoized
   `TaskItem` that gets the due label as a string, and the page passes a stable `onOpen`, so
   opening or closing the reader, or saving an edit behind it, redraws only the changed row.
   No list virtualization (a bucket opened with Show all still mounts in one go).
5. **Doc saves left the Workspace tab stale.** `applyDocumentSave` now marks the desktop
   stale, like a task edit, so a renamed loose note shows on the next focus.
6. **Two capture boxes, two recorders.** Leaving a tab (or opening the reader over it) stops
   and keeps a recording. A new recording also waits for the last stop to release the audio
   session, so turning recording off for one box can't cut off the next. Trade-off: opening a
   task mid-recording saves the note.
7. **The Workspace search lifted the capture box.** Only the box's own focus lifts it. The
   hook measures against the lift actually committed to the layout, so a focus change racing
   a keyboard event can't skew the measurement.
8. **Fallback tiles were flat.** The fallback also reads the list with `include=hierarchy` (in
   parallel) and merges in the parent ids. The test fixture no longer feeds parent ids from the
   plain list. Known limits until the web deploy: 50 projects at most, and if the Workspace
   row isn't among them, its loose items show as not loaded.
9. **Recent order now matches the website.** `sortRecent` uses `updated_at` only (no
   `last_touch_at`), the same as `desktop-model.ts` and the route's `byRecentActivity`;
   `touchedAt` was removed.
10. **State pill and dark overdue badge contrast.** The state pill text is its color 70%
    toward the foreground (≥ 4.8:1 on muted, both schemes). The dark badge uses the dark
    foreground token on destructive (4.55:1). Light stays white, as on the web.
11. **The "Type or speak" hint was faded to 3.7:1.** Removed the 0.85 opacity (now 5.0:1).
12. **The capture drain fanned out refreshes.** Up to four hooks share each drain, and all
    four refreshed Today and the desktop, each one cancelling the last. `createDrainClaim` lets
    the first hook to see a result run the refreshes.

Checks (one at a time, all free):

- `pnpm --filter @buildos/mobile typecheck`: pass.
- `pnpm --filter @buildos/mobile exec vitest run`: **171/171** in 15 files. New: `a11y-and-keyboard`, `document-save`; contrast, drain-claim, hierarchy-merge and sort tests updated.
- `pnpm --filter @buildos/mobile export`: pass, 1,548 modules. `dist/` deleted.
- Not touched, so not rerun: api-client and the web response test.

**Still needs DJ / a real iPhone**

- **Decided: project pages keep the tab bar** (as the mockup). Each tab now has its own native Stack, and the project page is an Expo Router shared route, `src/app/(tabs)/(today,workspace)/project/[id].tsx` (Today moved to `(tabs)/(today)/index.tsx`, Workspace to `(tabs)/(workspace)/projects.tsx`; URLs unchanged). A project opened from Today stays in Today's stack, one opened from Workspace stays in Workspace's, and a sub-project pushes on the same stack. Every link uses a group-qualified href, `projectHref(useTabStack(), id)` (`src/lib/routes.ts`); checked against expo-router's own linking code that a bare `/project/<id>` would land in Today from the reader or a cold start. The back label reads the tab's stack (parent project name, else "Today" / "Workspace"). Re-tapping the current tab pops to its root, then scrolls to top. Today's "Workspace" sub-head pushes the Workspace page on Today's stack (see nav review fixes below). The reader stays on the root Stack, over the tab bar. Project pages dropped their home-indicator padding (the tab bar clears it). New `src/app/+native-intent.ts` sends `buildos://project/<id>` (and the website's `/projects/<id>`, for when universal links are set up) to the Workspace stack. Checks: typecheck pass; vitest **180/180** in 16 files (new `routes.test.ts`, `backTarget` tests rewritten); export pass, 1,552 modules, `dist/` deleted.
- On an iPhone, for the tab bar change:
    - Open a project from Today and from Workspace: the tab bar stays, the right tab stays lit, and back reads "Today" / "Workspace" / the parent name.
    - Re-tap the lit tab on a project: it pops to the root; tap again to scroll to the top.
    - Long-press a tile (Workspace and "Inside this project"): the peek must still open and tapping it must push the project (the preview now lands in a stack nested in the tabs; the native path walker supports that, but it is unverified on a device).
    - The last task row and pull to refresh on a project, with the tab bar below.
    - Warm project link: launch, stay on Today, open `exp://<ip>:8081/--/project/<id>` from Notes. The Workspace grid shows, then the project pushes; back lands on the grid. Repeat the same link: it opens again.
    - Today's "Workspace" sub-head: the Workspace page pushes on Today with "‹ Today", and the Workspace tab keeps whatever it had open.
- On an iPhone:
    - The doc editor's Prev / Cancel / Save / Next bar should sit right on the keyboard, and the full-height sheet must not move when the keyboard opens.
    - Focusing Workspace search should leave the capture box docked.
    - With VoiceOver on: a failed save, a wrong password and a sort result should be spoken.
    - Recording on Today and then switching tabs should save the note.

**Nav review fixes (2026-10-29, after 3 skeptic reviewers; UNCOMMITTED)**

- Warm project links: a link arriving while the app runs, before Workspace was ever opened, left the project alone on Workspace's stack (expo-router adds no anchor to warm links), so back jumped to Today and the grid was unreachable. `projectLinkPath(url, initial)` now sends warm links to `/(tabs)/(workspace)/projects?open=<id>` and `projects.tsx` pushes the project over the grid; cold starts keep the direct path (anchor seeded).
- Today's "Workspace" sub-head: switching tabs could land on a project left open in Workspace. It now pushes the Workspace page on Today's stack like every other sub-head (back → Today; Workspace tab untouched). Product call, vetoable: the alternative is switch tabs + pop Workspace to its root, which discards what was open there.
- Checks: typecheck pass; vitest **181/181** in 16 files (+1 warm-link test); export pass, `dist/` deleted.

## Simulator pass (2026-10-29 evening)

Ran the app in Xcode's iPhone 18 Pro simulator (iOS 27, Expo Go 58.0.7) against the LAN web dev
server and screenshotted Today, Workspace, a project, and the task and doc readers in light and dark.
Navigation for screenshots uses deep links (`xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<path>"`,
with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`; Expo Go must be launched first or
iOS asks "Open in Expo Go?").

- "Couldn't load your day / No connection" on DJ's phone: `.env.local` points at
  `http://192.168.1.154:5199` and that dev server wasn't running. Started it
  (`pnpm --filter @buildos/web dev --host 0.0.0.0 --port 5199 --strictPort`). Unreachable-server
  messages now name the dev server and the command to start it when the API URL is a LAN address
  (`devServerHint` in lib/config.ts, `unreachableMessage` in lib/api.ts).
- Keys stretched to their row's height (task sheet close key, the reader's Edit key overlapping the
  description): the key face had `flexGrow: 1`; now only stacked bar cells grow.
- Wordmark glow hung below "OS": drawn at the measured size of the OS box, dots faded with a mask.
- Workspace showed 37 projects vs the website's 22: the grid now uses the website's default scope
  (planning + active; a folder stays while something inside is current), completed projects fold
  into "Completed · N", search still finds every state.
- Docs no longer show their title twice (a leading `# Title` equal to the doc title is dropped).
- Checks: mobile typecheck, 187/187 mobile tests.

## Phase 4: native chat, round 1 (2026-10-30)

**DJ's interview answers (10-30):** chat on the phone "mostly like it currently is", just the
optimizations that come with being native; the Brain Bolt that launches chat sits top-right on
every page, as in the website's phone view; chat about anything in the Workspace or a project,
exactly as the web; copy the web's patterns into React; show the agent's work the way the web
does. No tab, no reinvention.

**The move that made it cheap:** the web's client-side realtime chat core imported nothing but
`@buildos/shared-types`, so it became a package instead of being ported:
`packages/agentic-chat-client` (`@buildos/agentic-chat-client`) now holds
`worker-realtime-{inbox,coordinator,preview,channel,runtime}`, `worker-turn-adoption`,
`agent-chat-worker-ui-adapter`, `agent-chat-worker-status`, `agent-chat-workflow`,
`agent-chat-thinking-state`, `agent-chat.types` and their 11 test files (144 tests), moved with
`git mv`. The old web paths are one-line `export * from '@buildos/agentic-chat-client/<module>'`
shims, so no web import changed. Both apps depend on it (`pnpm install` done; lockfile carries the
new importer only). Exports carry `react-native` (Metro → src), `development` (Vite dev → src),
`import`/`require` (dist). **Landmine:** `pnpm --filter @buildos/web check` and `typecheck` need the
package built first (`pnpm --filter @buildos/agentic-chat-client build`; turbo's `^build` covers
`typecheck`, not `check`).

**Phone pieces (`apps/mobile`):**

- `src/lib/chat/runtime.ts` — one runtime per app: the core's coordinator + realtime runtime +
  turn adoption wired to this device's Supabase client, a bearer fetch (`bearer-fetch.ts`: the
  core writes `/api/...` + cookies; the phone rewrites to absolute + `Authorization`) and AppState
  as the "document" (foreground = visible → wake/reconcile). Session stores live here, keyed by
  session id, so a reply keeps streaming after the chat closes; reopening attaches to the same
  store. Sign-out clears everything.
- `src/lib/chat/session-store.ts` — implements the core's `AgentChatWorkerUiAdapterPort` over
  flat rows: user bubble, work row (steps = "verb · target" from `tool-lines.ts`, one live status
  line, folds to "Worked for 54s · 12 steps" from `work-summary.ts`), assistant text with the
  display-only live preview. `restore(history)` installs `api.chat.history` with each turn's
  work folded above its answer and reports turns still running; the hook then calls
  `adoption.discoverSession` so they re-attach.
- `src/hooks/use-chat.ts` — `useChat(target, sessionId)`: history once, send (`api.agent.sendTurn`
  → `adoption.adoptAdmissionResponse({ success: true, data })`, the core wants the envelope), Stop
  (`api.agent.cancelTurn`), new chat, open an earlier one; `useChatSessions` (per project, or the
  Workspace project with `include=workspace_chats`); `useActiveTurnCount` for the badge.
- UI: `src/app/chat.tsx` (root-stack `fullScreenModal`; NavBar back = the page you came from,
  keys = earlier chats, new chat; "Chatting about <context>" line; FlatList of rows; Composer),
  `components/chat/{chat-key,rows,composer,history-sheet}.tsx`. The Brain Bolt is the web's
  `brain-bolt.png` in a `NavKey` (new `glyph` prop) with an accent dot while any turn runs. Voice:
  mic → `/api/transcribe` → words land in the box (the web's default; auto-send is one flag away).
- Context: `src/lib/chat/context.ts` — `{ type: 'global' }` or `{ type: 'project', projectId,
projectName }` → the admission's strict `context` + a project-wide `projectFocus`, like the
  web's project chat. Params travel on the route.

**Checks:** agentic-chat-client tsc + 144 tests + build; api-client 34 tests; web: 6 test files
(246) that import through the shims, svelte-check (see status below); mobile tsc, 201 tests
(14 new: store transitions, restore ordering, tool lines, bearer fetch, context params), Metro
export. Not yet: a real turn on a device or simulator (the local dev server on :5199 must be
running, or point `.env.local` at prod).

**Round 2 candidates (not built):** proposal / pending-change cards with Keep/Undo (the web's
`ProposalCard`, `pendingChange` already arrives in the store), document/table change cards,
image attachments, created-entity chips that open the reader, the reader sheet's own Chat key,
context switch inside a chat, a user-wide chat list route, haptic on reply landing, long-press
mic = talk-then-send.

### Phase 4 polish (2026-10-31)

DJ on his iPhone: tapping "Ask BuildOS" opened the keyboard over the conversation and "it looks
like crap". Round 1 had wrapped the list and composer in a `KeyboardAvoidingView`; the app's
other bars never use it. Changes, all in `apps/mobile`:

- **Keyboard:** the composer docks to the screen's bottom edge and rides the keyboard with the
  same `useKeyboardOverlap(ref, { restsOnScreenBottom: true })` the reader's editor bar uses
  (the chat is a full-screen modal, so the keyboard covers exactly the window below its top).
  The list is an **inverted FlatList** (offset 0 = newest row): when the composer lifts and the
  list shrinks, the newest messages stay in view with no scroll math, and
  `maintainVisibleContentPosition` keeps streaming text from yanking someone who scrolled back
  (a "jump to the latest" round key appears past 240pt). Drag-down dismisses the keyboard
  (`keyboardDismissMode="interactive"`). Send keeps the keyboard up (Messages behavior), light
  haptic, new rows ease in (`LayoutAnimation`), `blurOnSubmit={false}`.
- **Look:** composer = the capture box (card, graph paper, 44pt round keys: Send accent/muted,
  Stop while a reply runs, Mic; recording strip with the breathing dot and timer; errors as a
  dismissable line above); user bubble = the web's accent-tinted card; work row = quiet left
  rule, live line + steps while active, folded "Worked for 54s · 3 steps" after; slim
  "context" strip (BoltMark + Workspace/project) under the nav bar; empty state bottom-aligned.
- **Perf:** rows memoized on their row object (the store replaces only the changed row),
  module-level `renderItem`/`keyExtractor`, `windowSize` 7, no re-render of other rows while
  text streams; the one-second clock lives inside the active work row only.
- **Dev demo (no paid turn):** `/chat?demo=history|streaming|done|idle|live` seeds a store
  through the same port the realtime core drives (`src/lib/chat/demo.ts`); Send runs a scripted
  five-second turn; `&autofocus=<any>` opens the keyboard, `&history=1` opens earlier chats.
  `__DEV__` only. Tests: `tests/chat-demo.test.ts` (seeded states, scripted turn, Stop, list
  follow thresholds).
- **Verified on the iPhone 18 Pro simulator (Expo Go 58, software keyboard):** keyboard open with
  the composer riding on it and the newest rows above (light, dark, extra-extra-large text),
  streaming with the live step line and Stop key, the finished fold, the empty state, a project
  context, and a scripted live turn start to finish with the list following the text. Shots in
  this session's scratchpad `shots/` (01–15). Not verified: a real turn against the worker
  (paid; needs DJ's go-ahead), the interactive drag-to-dismiss and a scrolled-back stream (no
  tap/drag tool from `simctl`; both are stock FlatList behaviours), VoiceOver. Note: in Expo Go
  the floating dev-menu button sits over the New-chat key; a dev build has no such button.
- **Landmines:** a new route file needs a cold start of Expo Go (Fast Refresh does not add
  routes; `exp://host:8081` on an open project is a no-op, so `simctl terminate` + relaunch);
  `simctl openurl` to an already-open `/chat` reuses the screen, so `autofocus` re-fires on a new
  value and `history=1` is an effect, not initial state.

## Daily brief on the phone (2026-10-31)

The morning artifact, readable (and listenable) in the app. Lean build, with the cheap native
extras (narration, autoplay from the card, deep-linkable days) included.

**What the phone shows**

- **Today card** (`src/components/brief/brief-card.tsx`, rendered by Today's `index.tsx` right
  under the header): "YOUR BRIEF · Today", the first line of the Executive Brief, and a
  "Listen · 0:22" chip when the narration is ready. Tap the card to read; tap Listen to open the
  page already speaking (`/brief?autoplay=1`). With no brief today (or a failed one), the last
  finished brief shows as "Your last brief · Thu, Oct 30"; with none at all, no card. While
  today's is being written, the card says so with the bolt spinner and the page polls (10 s).
- **Brief page** (`src/app/(tabs)/(today)/brief.tsx`, pushed on Today's stack; NavBar back =
  Today, Brain Bolt + "Open on the web" key): title + date, status stamp ("Generated 12:13 AM" /
  "Being written now…" / "Couldn't be written · reason"), Prev/Next day keys (`?date=`, Next
  disabled on today), Listen card (primary key, "0:06 / 0:22" clock, progress line; keeps playing
  while scrolling, stops on leaving), Executive Brief, START HERE tile (numbered rows from
  `priority_actions`, linked to their tasks via the markdown's Start Here list; linked rows open
  the reader), the rest of the readout in order (Calendar, Strategic Alignment, Attention
  Required, Focus by Work Mode, While you were away), the analysis (`insights`: The Real Picture
  / What Matters Most / One Clear Recommendation), then "Show project details · 33" folding the
  per-project tail (~34 KB of the 42 KB document) until asked. Links in the brief
  (`/projects`, `/projects/<id>`, `/projects/<id>/tasks/<id>`, `/projects/<id>/documents/<id>`,
  also as build-os.com URLs) open the Workspace tab, the project page, or the reader; anything
  else opens the in-app browser. No brief for a day → quiet card, no Generate key.
- Older briefs (the generator used to title the lead "Executive Summary") read the same way.

**How it is built**

- `src/lib/brief.ts` (pure, tested): `splitBrief` (lead / executive / startHere / body /
  details + count, code fences respected, the date H1 dropped), `briefLead`, `briefActions`,
  `briefLinkTarget`, `stepDay` (UTC-stepped, DST-safe), `briefStatus`, `formatElapsed`,
  `listenLabel`, `briefHref`, `civilDayParam`.
- `src/hooks/use-brief.ts`: `useBrief(date)` (`['brief', userId, date]`, shared by card and
  page so the page opens from cache; `refetchInterval` 10 s while pending/processing),
  `useLatestBrief` (history, limit 3, first completed), `useTodayBrief`.
- `src/hooks/use-brief-audio.ts`: `expo-audio` `useAudioPlayer` keyed on the signed URL
  (fetched on first tap, never before), `useAudioPlayerStatus` for the clock, replay from 0
  after the end, `playsInSilentMode`, pause on unmount (the hook also releases the player).
- `src/components/markdown.tsx`: additive `onLink` prop (a context; default behavior unchanged).
- Icons added: Play, Pause, Sunrise. No kit exports added.
- `@buildos/api-client` (additive): `briefs.history(params)` + `DailyBriefHistoryParams` /
  `DailyBriefListItem` / `DailyBriefHistoryResponse`, `briefs.audioUrl(id)` +
  `DailyBriefAudioUrl`; `src/endpoints/briefs.test.ts` (3 tests). Metro reads the package from
  `src` (`react-native` condition), so no rebuild is needed for the phone.

**Checks:** mobile tsc (typed routes), `tests/brief.test.ts` 20 tests (+ routes 8), api-client
tsc + 37 tests, Metro export OK. Simulator (iPhone 18 Pro, Expo Go 58.0.7, local API on :5199,
DJ's real data): Today card light/dark, brief top light/dark, body (Start here + Calendar,
Attention Required, analysis), autoplay playing state (0:06 / 0:22), older-format brief
(2026-01-01), no-brief day. Screenshots were saved in the session scratchpad
(`/private/tmp/claude-501/-Users-djwayne-buildos-platform/948f26e5-b29b-4b90-8d6a-ec1f3241b95d/scratchpad/*.png`),
which does not outlive the session.

**Left out, on purpose:** generating or regenerating a brief from the phone (the web's Generate
and its auto-start on page load both enqueue a paid model run; "Open on the web" is the escape
hatch), requesting narration for a brief without audio (admin-only, paid), a seek bar and speed
keys (the narration is ~20 s), the web's project-brief grid and history list, lock-screen
controls and background audio (needs `UIBackgroundModes: audio` in app.json and
`setActiveForLockScreen`, which `expo-audio` already exposes).

**Follow-ups worth pitching:** (1) a morning push that opens straight to `/brief?autoplay=1`
so the phone reads the brief aloud as you pick it up (push plumbing exists from Phase 0);
(2) lock-screen controls + background playback for the walk to the kitchen; (3) an offline copy
of the latest brief so the card and page render before the network does; (4) a "Chat about this
brief" context, as the web has.

**Needs DJ:** nothing to ship this; a real-iPhone pass on Listen (speaker/silent switch) when
convenient.

## Chat round 2a: proposal cards, the "didn't finish" strip, the reader's Chat key (2026-10-31)

DJ: "work on whatever is next." Chosen because without them the phone could see the agent
propose a change but never answer it.

- **Proposal cards** (nest a project, combine two, file loose Workspace items, start a project
  from them — the four kinds in `packages/shared-agent-ops/src/chat-cards/`). The card rides in
  a `tool_result`; `apps/mobile/src/lib/chat/proposals.ts` reads the envelope structurally (no
  runtime dependency on shared-agent-ops) and words it like the website (`proposalTitle`,
  `proposalLines`, `proposalMainLabel`, state incl. expiry). The store gains a `card` row placed
  right after its turn's work row, keeps the furthest-along copy when a later event repeats the
  card with a decision/undo, and restores cards from `history.toolExecutions`. UI:
  `components/chat/proposal-card.tsx` — title, lines, main key ("File it", "Start the project",
  "Move under X", "Take it out") + "Not now"; answered → outcome line (the route's
  `description.text`) + Undo once for applied cards. Combine has a preview and member choices,
  so the phone shows "Review on the web" (in-app browser) instead of guessing.
  Routes: `api.chat.chooseProposal/undoProposal/previewProposal/undoPreviewProposal` (new in
  api-client, with types mirrored from shared-agent-ops; `PROPOSAL_CARD_CLOSED_CODES`).
- **"Didn't finish from earlier" strip** (`components/chat/pending-change-strip.tsx`), riding
  on the composer via its new `above` slot: hydrated from history, re-read via
  `?probe=pending-change` after a turn that ends with a failed step (`pendingChangeCheck` in
  the store), Finish it sends the website's exact message, Dismiss calls the new
  `api.chat.dismissPendingChange(sessionId, key)`.
- **Reader Chat key**: `ReaderHead` gained an `action` slot; task and doc readers show the
  Brain Bolt (`components/chat/reader-chat-key.tsx`), which opens the project's chat focused on
  that item (`ChatTarget.focus` → `projectFocus.focusType: 'task' | 'document'`, like the web's
  reader). The context strip reads "Project · Task · <title>".
- Rows ask the screen for actions through `ChatActionsContext` (renderItem is module-level).
- Dev: `/chat?demo=card` seeds a pending workspace_file card and a strip (free).
- Checks: mobile tsc, 233 tests (6 new in `tests/chat-proposals.test.ts`), api-client tsc + 38,
  prettier. Simulator screenshots of the card/strip in light + dark (see memory); the reader key
  is tsc-checked only (needs a real task id to deep-link). Not run: a real proposal end to end
  (needs a turn that proposes; paid).
- Left: combine's preview/member choice natively; created-entity chips and document/table
  change cards; image attachments; context switch inside a chat.

### Phase 4 round 2b: context on open (2026-10-31)

DJ: on the web the chat opens _to_ the context you want to chat about; on the phone it was a
blank chat. Now the phone mirrors the website's `AgentChatModal` opening model exactly:

- **From Today, the brief or the Workspace** (Brain Bolt with `GLOBAL_TARGET`): the first screen
  is the context picker (the web's `ContextSelectionScreen`): "Workspace chat" and "Project chat"
  cards (the second shows the project count), then "Recent Workspace chats" (the global context's
  chats, 3 most recent, one tap to pick up). Project chat → the project list (the web's second
  view): search box, most recently touched first, Workspace row hidden, tile + name + next step
  or open-task count. Picking either lands in an empty chat _about_ that thing.
- **From a project page**: straight into the project chat, no picker (the web's
  `autoInitProject` with `showActionSelector: false`).
- **From the reader**: straight into the project chat focused on the task or doc (the web's
  `chatInitialProjectFocus`).
- **Always visible**: the strip under the nav bar says what the chat is about
  (`Workspace`, `LA Industrial Services`, `DJ Wayne Studio · Goal · Grow local clients`) and is
  the one place to change it, with a trailing CHANGE / FOCUS hint. Before the first message:
  CHANGE → back to the picker (same draft; the web's back button → `changeContext()`). In a
  project chat with messages: FOCUS → the focus sheet ("Work from": project-wide, then the
  project's tasks, docs, goals, plans, milestones, risks from the `useProject` read the app
  already holds, with search; the web's `ProjectFocusSelector`), which changes the focus of the
  **same session**; its footer "Chat about something else" starts a new chat and shows the
  picker (the web has no mid-session context switch either). A global chat with messages:
  CHANGE → new chat + picker. Disabled while a reply streams (the web blocks it too). The New
  chat key keeps the context and starts a fresh draft.
- **Empty state** reads "CHAT ABOUT / <Workspace | project | focused item>" with the web's
  descriptor subtitle, then "Pick up where you left off" (that context's earlier chats, 3).
  Composer placeholder: "Ask about <title>".
- **What gets sent**: `useChat(target)` reads the screen's `target` state on every send, so a
  pick or focus change reaches the admission as `context` + `projectFocus`;
  `tests/chat-opening.test.ts` pins `turnContextFor`/`projectFocusFor` for Workspace, a picked
  project, every focus kind, and clearing a focus. `ChatFocus.kind` widened from task/document
  to the web's six (`FOCUS_KINDS`); URL params round-trip all six.
- Files: `app/chat.tsx` (stage `pick | projects | chat`, in-screen state, no new route),
  `components/chat/context-picker.tsx` (new), `components/chat/focus-sheet.tsx` (new),
  `lib/chat/opening.ts` (new, pure: `initialStage`, `pickableProjects`, `projectAside`,
  `focusSections`), `lib/chat/context.ts` (`FOCUS_KINDS`, `FOCUS_WORD`, `describeTarget`),
  `lib/chat/demo.ts` (`pick`, `projects`, `focus` states; `demoHasSession`),
  `hooks/use-chat.ts` (one line). No api-client or kit changes.
- Checks: mobile tsc, `tests/chat-*.test.ts` 27 green (14 new), prettier, `expo export`.
  Simulator (real data, light + dark): picker, project list, project open, Workspace empty
  chat, focus sheet with DJ Wayne Studio's tasks, focused strip. Not run: a real turn after a
  pick (paid; needs DJ's OK). Not verified: taps (no tap tool), so the pick → chat transition and
  the sheet's selection are exercised through URL-driven states and the pure tests only.
- Simulator landmine: two `openurl` deep links in quick succession can drop the second; open
  again if the screen did not change.

## Account & data from the phone (2026-10-31)

The account key's sheet now offers **Account & data** above Sign out. It opens the website's
Profile → Account page (`/profile?tab=account`: email, password, exports, "Delete My Account")
signed in through the one-time handoff, in app mode, in the in-app browser. When the page closes
the phone asks `/api/auth/user` once (after a token refresh if the first answer was 401): a
scheduled deletion leaves a bearer device answering 401 forever (`hooks.server.ts` only clears
cookie sessions), so a second 401 signs this phone out instead of showing errors. Files:
`apps/mobile/src/lib/web-pages.ts` (pure: `WEB_PAGES`, `openWebPage`, `signOutIfAccountGone`),
`components/kit/account-key.tsx`, `tests/web-pages.test.ts` (4). Not verified on a device (no
tap tool for the action sheet); tsc + tests. Deleting for real still needs the end-to-end proof on
a test account with DJ (tracker 103).

## Chat round 2c: the changes row (2026-10-31)

When a turn ends, what it changed appears under the reply, the way the website shows it:
chips for what the agent **created** (task, goal, plan, doc, milestone, risk; a project it
started gets a "Project saved" card with Open project / Open a task), a card per document it
**edited** ("+4 −1", expands to the bounded diff, one-tap Undo, Open document) and a card per
table it **wrote** ("+3 rows · 7 cells", expands to the sample cells, Undo, Open table). Tapping
a task or doc opens the reader as a sheet over the chat; a project closes the chat and opens
the project in Workspace (`?open=`); goals, plans, milestones and risks have no phone screen
yet and open on the website signed in (handoff). Everything is read from structured tool
results only (a `create_onto_*` result's entity record, `document_change`, `table_change`): live
from `tool_result` events (the store remembers each `tool_call`'s name and arguments by id) and
on reopen from the session's stored tool executions per turn run; a replayed result adds no
second chip and doubles no count. Undo calls the website's revert routes through the api-client
(`documents.revertChange`, new `tables.revertChange`); a 409 shows the same plain-language
conflict copy as the web and leaves the card in place.

Files: `apps/mobile/src/lib/chat/changes.ts` (pure readers + merge + copy),
`components/chat/changes-row.tsx`, `session-store.ts` (`ChangesRow`, per-turn receipt buffer
flushed in `finishTurn`, restore placement after the turn's last row, `setChangeBusy` /
`settleChange`), `hooks/use-chat.ts` (`undoChange`), `chat-actions.tsx` (`undoChange`,
`openEntity`), `app/chat.tsx` (navigation, signed-in `openOnWeb`), kit icons (Flag, ListChecks,
Sparkles, Table, Target), `lib/chat/demo.ts` (`changes` state); api-client types for the two
receipts and revert routes + `endpoints/tables.ts`. Tests: `tests/chat-changes.test.ts` (11),
api-client route test; mobile 262 green, api-client 39, tsc clean both, Metro export OK.
Screenshots: `shots/40-changes-light.png`, `41-changes-expanded-light.png`, `42-changes-dark.png`
(simulator; the expanded shot used a temporary default, reverted). Not verified: a real undo
against production (needs a real turn that edits a doc; paid) and the taps themselves.

## The new Today on the phone (2026-11-13)

DJ picked "New Today on phone" over ship path / chat catch-up / inbox. Ported the web's reimagined
Today (2026-11-05) to `(tabs)/(today)/index.tsx`, same rules and copy:

- **Pick card** (`components/today/pick-card.tsx`, rules in `picks.ts` = web `today-picks.ts`):
  "Start here" / "Next up", tag, why line, Open it / Done / Not this, "Today went sideways" after
  noon (clears the plan for the day; flags in `day-flags.ts`, in memory).
- **Evening close-out** (`close-out.tsx`): prompt after 5 PM; "What BuildOS saw today" from
  `GET /api/today/changes`; Done / Some progress / Not today / Let it go as a 2×2 grid; Apply.
  Phone difference: the web's free-text box is a "Tell it" key that opens Workspace chat with
  "Closing out my day. Here's what happened: " typed and the keyboard up (voice works there; a
  text box mid-scroll would sit under the keyboard).
- **Waiting on you / You're waiting on** (`waiting-on.tsx`): name line over the ask, open (or draft
  a follow-up in chat), done, remove, Undo. Phone difference: rows stay with Undo; the web filters
  settled rows out of the list it passes, so its Undo never shows (web bug, not fixed there).
- **More ways in + "Your brief keeps suggesting these"** (`repeated.tsx`): Lay it out, Talk it
  through (the web's day draft), Close out the day; Keep / Snooze (a month) / Let go (archive) + Undo.
- **Bug fixed:** the phone dropped `due_soon` and `new` tasks (types predated the widened feed);
  the section is now "Due this week and new" with the web's row meta ("Due Sun", "You added this").
- Chat accepts `?draft=` (prefilled, not sent; skips the context picker). Composer `initialText`.
- api-client: `today.setWaitingStatus/keepSuggestion/unkeepSuggestion/changes`, `tasks.restore`,
  Today attention + what-changed types. The Today query now caches the whole response
  (`{feed, attention}`); `task-cache.ts` reads/writes `.feed`.

Checks: api-client tsc + 43 tests + build; mobile tsc, 274 tests, Metro export. Simulator on DJ's
real prod data (API pointed at build-os.com for the run, `.env.local` restored): pick card, evening
prompt, close-out ("pc-claude: 1 change in Radar"), 3 waiting on you + 9 you're waiting on, 3
repeated suggestions (8–12 days), chat with draft. Screenshots in session scratchpad `shots/`.
Not done: taps (no tap tool), so Done / Apply / Keep / Undo writes are unexercised on a device.

### Swipe rows (2026-11-13, DJ: "do the next parts")

`kit/swipe-row.tsx` (`SwipeRow`, PanResponder + Animated: no new native dependency, Expo Go
safe; rules `claimsSwipe` / `swipeOutcome` / `swipeOffset` in `kit/math.ts`, 3 tests). Claims a
drag only when clearly sideways (>12 pt and 1.5× more horizontal than vertical), selection tick
when crossing the 88 pt trigger, success haptic on release, springs back (no bounce with Reduce
Motion), VoiceOver gets both actions in its actions menu. Used on: close-out picks (right = Done,
left = Not today; "Swipe right for Done, left for Not today." hint) and waiting rows (right =
Done / Came through, left = Remove). Keys stay. Feel unverified: the simulator run can't drag.

### Chat catch-up (2026-11-13): turn cards, Continue in, step details, images

- **Shared rules moved, not copied:** `agent-chat-turn-cards.ts` and `agent-chat-step-details.ts`
  (+ tests) `git mv`'d from `apps/web/src/lib/components/agent/` into
  `packages/agentic-chat-client/src/` (exports, tsup entries, barrel); the web paths are one-line
  re-export shims like the Oct 31 move. Package 160 tests + build; web 128 tests via shims.
- **Store** (`lib/chat/session-store.ts`): `context_selection` events (were dropped) land on the
  work row as `selection`; each step carries `source` (arguments, result, affected entities,
  duration, `source_quote`) live from `tool_call`/`tool_result`, and on reopen from
  `toolExecutions` matched by the timeline id `tool_execution:<id>`; `contextSelections` from the
  session read (api-client type added) matched by `turn_run_id`.
- **Turn view** (`lib/chat/turn-view.ts` → `components/chat/work-detail.tsx`): the web's
  `deriveTurnCards` / `describePulled` / `buildStepDetails` / `buildTurnReceipt` over the row.
  Folded line: "2 updated · 1 created · 1 read" (or "2 projects · 5 steps"). Open: "Checked 12
  projects, picked 1", a card per project when grouped, "↻ Carried from last turn", "✦ Pulled in
  3 of 12 · …", steps (6 then "Show N more") with New/Updated/Archived badges, record chips that
  open the reader / project / website, the person's quoted words, before → after, Body +N −M.
  Finished steps read past tense (`doneVerb`; a badge replaces the verb: "[Updated] task").
- **Continue in X** (`components/chat/continue-chip.tsx`): Workspace chat, last finished turn's
  finder picked exactly one project with p ≥ 0.7 → chip under the newest message →
  `api.chat.moveToProject` → chat target becomes the project (messages stay).
- **Images** (`lib/chat/images.ts` rules, `lib/chat/image-upload.ts`, `hooks/use-draft-images.ts`,
  `components/chat/image-tray.tsx`): photo key in the composer, up to 4 (25 MB each, web copy),
  JPEG 0.8 from the picker; SHA-256 (expo-crypto) → `POST /api/agent/chat-attachments` → bytes to
  the signed target with the app's Supabase client `uploadToSignedUrl` → project chats
  `POST /api/onto/assets/[id]/complete`; Send waits for uploads; images-only messages send
  `message: ''` with "Attached N images" shown; turn `attachments` (camelCase) added to
  `AgentTurnRequest`; sent bubbles show thumbnails (stored previews load with the bearer; Workspace
  temporary files show an IMG placeholder after reload). New deps via `expo install`:
  `expo-image-picker` (Expo Go bundled; app.json plugin with a Photos permission line),
  `expo-crypto`. No OCR polling (web uses it for a status label only).
- Dev: `/chat?demo=cards` (free) shows cards, details, receipt and Continue in.

Checks: api-client 45 tests + build; package 160 + build; mobile tsc, 290 tests, Metro export;
simulator screenshots light + dark (shots/10–13). Not exercised: a real upload, a real move, a
real turn's cards (all need a device run / paid turn); swipe feel.
