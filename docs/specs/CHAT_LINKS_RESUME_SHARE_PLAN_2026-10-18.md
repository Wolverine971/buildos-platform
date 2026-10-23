<!-- docs/specs/CHAT_LINKS_RESUME_SHARE_PLAN_2026-10-18.md -->

# Chat links: resume links, Back closes the chat, read-only share links

Implementation plan, written 2026-10-18 after a read-only research pass. DJ approved the plan and
every recommended default below. The design doc with the user-facing walkthrough and a state
diagram is at <https://claude.ai/code/artifact/99a15485-40bb-4b96-9ad2-1f2468deca6a>.

Line numbers are anchors as of 10-18. Other sessions edit these files, so find code by symbol, not
by line number.

## Outcome

Every BuildOS chat gets an address. The work ships in two phases.

1. **Resume links (phase 1).** When a chat with at least one message is on screen, the address bar
   reads `<current page>?chat=<session uuid>`. Pasting the link on any device where you're signed in
   opens the same page with that conversation loaded, including a reply that's still streaming.
2. **Back closes the chat (phase 1).** Opening a pop-up chat adds one browser history entry, so Back
   (or the phone's back gesture) does what the X button does.
3. **Share links (phase 2).** "Share" publishes a frozen, cleaned, read-only snapshot at
   `build-os.com/share/<token>` that anyone can read without an account.

Why: DJ wants to save and resume his spot, and to send a chat to someone the way ChatGPT and Claude
allow. Each shared chat is also a working BuildOS demo with a signup door, which makes sharing a
growth loop.

## Product rules (DJ, 2026-10-18)

- **The URL matches the screen.** `?chat=` is present only while a conversation is on screen. An
  empty chat, a closed chat, or a chat minimized to a stack card has no param.
- **Back = X.** Pressing Back mid-reply parks the chat as a stack card, the same as X does today.
- **Links only open your own chats.** The session API is owner-scoped. A link to another account's
  chat, or to a deleted one, shows the toast "Couldn't open that chat." and the page loads normally.
- **Login keeps the link.** A signed-out open goes to login, then back to the same page with the
  chat open.
- **Embedded chats write the link too** (task modal, document modal, desktop Projects pane, brief
  chat). Opening such a link reopens the conversation in the main chat on that page, with its focus
  restored. It does not reopen the host modal (decision D3).
- **Shares** (phase 2):
    - A share is a frozen snapshot, refreshed only when the owner presses Update (D1).
    - The sharer's name shows by default, with a switch to hide it (D2).
    - Secrets, card numbers and SSNs are locked out of a share. Other flagged messages start
      unchecked, and the owner can re-check them (D4).
    - Shares are managed inside each chat; there's no list page yet (D5).
    - No "continue this chat in my BuildOS" yet (D6).
- **Shared pages never show:** links into the owner's workspace, IDs, tool inputs or outputs,
  reasoning, images, files, voice, model or cost. They are never indexed by search engines.
- **Marketing copy leads with relief, not AI:** "Turn messy thinking into structured work."
- **Ship order:** phase 1 alone first; phase 2 after DJ has used phase 1 (D7).

## Before you start: coordination

- **Codex is rewriting the restore endpoint.** It started 2026-10-18 at 14:43 and was uncommitted
  when this was written. It touches:
    - `apps/web/src/routes/api/chat/sessions/[id]/+server.ts` and its tests
    - new `apps/web/src/lib/server/chat-session-restore.ts` and `chat-session-enrichment.ts`
    - `apps/web/src/lib/components/agent/agent-chat-session.ts`
    - new migration `supabase/migrations/20261018193727_chat_session_restore_snapshot.sql` and
      `supabase/tests/chat_session_restore.check.sql`

    Run `git status` first. Don't edit those files, and never commit them as part of this work. The
    rewrite helps this feature: restore reads messages and turn status in one snapshot, and it counts
    queued turns as active.

- **Deploy-order landmine.** The rewritten endpoint calls `get_chat_session_restore_v1` from that
  migration. If a web deploy carrying the endpoint lands before the migration is applied to prod,
  every chat reopen breaks: History, stack cards, and these links. Before any deploy, confirm the
  migration is applied.
- Work directly on `main`; no worktrees. Commit only your own files, with explicit pathspecs
  (`git commit -- <paths>`). Other sessions keep uncommitted work in the tree.
- Read `apps/web/AGENTS.md` before any Svelte edit. It covers Svelte 5 runes, the Inkprint tokens
  and the `$lib/icons/lucide` exports.

## What already exists (reuse, don't rebuild)

| Piece                                                                                                  | Where                                                                                                                                                                                               | Use it for                               |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Global chat host, mounted in the layout, survives route changes; can park a hidden keep-alive instance | `apps/web/src/lib/components/layout/Navigation.svelte` (`showChatModal`, `parkedChatSessionId`, modal mount near the end of the file)                                                               | The deep-link open path                  |
| Resume a chat by ID, including an in-flight turn                                                       | `AgentChatModal` prop `initialChatSessionId` → `loadChatSession()` → `loadAgentChatSessionSnapshot()`; `probeActiveTurnRun`                                                                         | Opening a link; no new loading code      |
| "Open this session" request from anywhere                                                              | `buildos:open-agent-chat` window event → `handleOpenAgentChatEvent` in `Navigation.svelte`. It parks any other open chat as a stack card first via `ensureFreshChatSurface()`                       | The deep link calls the same logic       |
| Live session ID out of the modal                                                                       | `AgentChatModal` prop `onSessionChange`; `currentSessionId` is `$derived` (~line 382)                                                                                                               | Claiming the URL param                   |
| Close / park paths                                                                                     | `handleClose()` (parks if streaming), `closeChat()`, `minimizeToStack()`, `hardParkAndClose()` in `AgentChatModal.svelte`                                                                           | Back must call `handleClose()`           |
| One-time URL params read after hydration                                                               | `apps/web/src/lib/utils/one-time-url-params.ts` (`consumeOneTimeUrlParams`); the `?open=agent-chat` launch in `layout/agent-chat-launch-params.ts`                                                  | The pattern for reading `?chat=` on load |
| Shallow history: open pushes, Back closes, X pops                                                      | `apps/web/src/lib/components/projects/desktop/ProjectDesktop.svelte` (`openItem` / `closeItem`, `desktopPeekPushed`)                                                                                | Copy this pattern exactly                |
| `App.PageState` typing                                                                                 | `apps/web/src/app.d.ts`                                                                                                                                                                             | Add the chat keys                        |
| Test fixture for shallow routing                                                                       | `apps/web/src/lib/components/projects/desktop/__fixtures__/page-state.svelte.ts`                                                                                                                    | History unit tests                       |
| Chat header buttons                                                                                    | `AgentChatHeader.svelte` (`headerActions`, `onMinimize`, `sessionId` props)                                                                                                                         | Copy link and Share buttons              |
| Icons                                                                                                  | `$lib/icons/lucide`: `Link`, `Link2`, `Share2`, `Copy` already exported                                                                                                                             | The new buttons                          |
| Analytics                                                                                              | `captureEvent(event, props)` in `apps/web/src/lib/services/posthog.ts`; first-touch UTM in `getFirstTouchAttribution`                                                                               | Events                                   |
| Public pages, phase 2                                                                                  | `src/routes/(public)/p/[slug]/`, `/api/onto/documents/[id]/public-page/{prepare,confirm,unpublish}`, `/api/public/pages/[slug]/view`; "Made with BuildOS" footer and `/signup?return_to=`           | Page shell, footer, view counter         |
| Pre-publish safety review, phase 2                                                                     | `apps/web/src/lib/server/public-page-content-review.service.ts`: rule scan + redaction + chunked LLM pass, fails closed. Coupled to documents today (`runPublicPageContentReview` takes a document) | Extract the text core                    |

## Phase 1: resume links and Back closes the chat

Web only. No database change, no new API endpoint, no worker change, no paid calls.

### 1.1 URL owner (new file `apps/web/src/lib/components/agent/agent-chat-url.svelte.ts`)

This is a small module-level singleton that owns the `chat` query param. Multiple chat instances can
be on screen at once (for example, the desktop Projects pane plus the global chat on top).

- `claimChatUrl(instanceId: string, sessionId: string)`. It pushes or refreshes this instance on a
  claim stack, then writes the param. The most recent claim wins.
- `releaseChatUrl(instanceId: string)`. It removes this instance from the stack. If it was on top,
  the param is handed to the next claimant still on the stack, or stripped when the stack is empty.
- Write with `replaceState` from `$app/navigation`, never native `history.*`, which conflicts with
  SvelteKit's router. Keep every other query param, the hash, and every existing `page.state` key
  (the desktop keys must survive).
- Param name `chat`, value = session UUID. Nothing in the app reads `chat` today; admin pages use
  `chat_session_id`. A UUID-format check on the value is a structural check, which is allowed. The
  no-regex rule only covers classifying language.
- Export a pure helper `buildChatResumeUrl(base: URL, sessionId: string): string` for the Copy link
  button and the tests.
- **Gotcha:** shallow `replaceState` does not update `page.url` (see the comment in
  `one-time-url-params.ts`). Never read `page.url` to learn the current chat param. Build URLs from
  `window.location` (after a shallow write it's correct) or from the owner's own state.

### 1.2 Inside `AgentChatModal.svelte`

Put the logic here so all 14 chat surfaces get it without per-host wiring.

**URL claim (every instance):**

- Claim when `currentSessionId` is set and the instance is on screen: `isOpen && !hidden`.
- Release on close, park, hide, and unmount.
- Generate an `instanceId` once per component instance with `crypto.randomUUID()`.

**History entry (non-embedded instances only; skip when `embedded`):**

Add to `App.PageState`: `agentChat?: string` (the owning instance's token) and
`agentChatPushed?: boolean`. These mirror `desktopPeek` / `desktopPeekPushed`.

- **Becomes visible:** `pushState('', { ...page.state, agentChat: instanceId, agentChatPushed: true })`.
  This covers first open, and reopening a parked keep-alive instance from its card. Import `page`
  from `$app/state`.
- **Back pressed:** watch `page.state.agentChat`. If this instance is visible, it holds a history
  entry, and `page.state.agentChat !== instanceId`, the user went Back. Call `handleClose()`, which
  is X's path and parks if a reply is mid-stream.
- **Closed any other way** (X, Esc, minimize, close after save):
    - If `page.state.agentChat === instanceId && page.state.agentChatPushed`, set a `selfPopping` flag,
      then call `history.back()`. The watcher must skip the one state change this produces; otherwise
      minimize turns into a close.
    - Otherwise (the entry was re-marked after a page change), use `replaceState` to strip `chat` and
      clear `agentChat` and `agentChatPushed`.
- **Never call `history.back()` while a navigation is in flight.** SvelteKit's popstate handler
  cancels the pending `goto` and the user is stranded on the old page (see the comment in
  `organize/OrganizeEntryButton.svelte`). If the chat closes because a navigation started (check
  `navigating.to` from `$app/state`, or a `beforeNavigate` flag), leave history alone.
- **Page change while open** (only the global instance survives a route change): in `afterNavigate`,
  if visible, `replaceState` the new entry with `chat=<id>` and
  `{ ...page.state, agentChat: instanceId }`, without `agentChatPushed`. Back then walks back through
  pages with the chat still open, and closes it once it reaches the entry from before the open.
- **Nested overlays** (the chat pop-up opened from `TaskEditModal` / `DocumentModal`): the chat's
  entry sits on top, so Back closes the chat first. The host modal isn't history-aware, so a second
  Back leaves the page. That's acceptable; don't make the host modals history-aware in this work.
- **ProjectDesktop interaction:** the desktop's `closeCard()` runs `history.go(-desktopDepth)`. A chat
  entry left on top would skew that by one. Since the chat is a modal overlay, its entry should
  always be popped before the desktop is usable again. Add a test that opens a desktop card, opens
  and closes the chat, then collapses the card and checks it returns to the right entry.

**Load-failure hook:** add an optional prop
`onSessionLoadFailed?: (sessionId: string, reason: 'not_found' | 'error') => void`, called from
`loadChatSession()`'s catch for non-background loads. `loadAgentChatSessionSnapshot()` throws a
plain `Error` today, so carry the HTTP status by having the snapshot loader throw a typed error that
includes `status`. **That loader is in `agent-chat-session.ts`, which Codex is editing:** wait for
Codex to land, or put the status check in a thin wrapper in your own file. Only a 404 (or 403)
counts as `not_found`. A network error keeps today's in-chat error banner.

### 1.3 `Navigation.svelte`: open from a link

- On each `afterNavigate`, when signed in, read `?chat=`. Ignore it if it isn't a UUID, and ignore
  it silently when signed out. Process each URL once, keyed like `handledAgentChatLaunchKey`.
- **Order matters.** First strip `chat` from the current entry with a replacing `goto` and **await
  it**. Then open the chat through the same steps as `handleOpenAgentChatEvent({ sessionId })`.
  Opening pushes the chat's own entry (1.2), and the URL owner re-adds `?chat=` once the session
  loads. The result: Back closes the chat and leaves you on the page you opened the link on.
  `consumeOneTimeUrlParams` fires its `goto` in a microtask without exposing the promise, so either
  extend it with an optional `onCleaned` callback or use a dedicated `afterNavigate`. Don't push
  before the replacing `goto` has finished, or it will clobber the chat entry.
- If the requested session is already visible or parked, reuse the existing logic in
  `handleOpenAgentChatEvent`: do nothing, or seamlessly unhide.
- Pass `onSessionLoadFailed`. On `not_found`, show the toast "Couldn't open that chat." with
  `toastService`, close the chat, and make sure no `chat` param remains.
- Done right, this also covers `/history`, `/today` and project-page links, because every route has
  the nav.

### 1.4 Login keeps the link

Project pages already redirect signed-out visitors to `/auth/login?redirect=<path+search>`; see
`routes/projects/+layout.server.ts` and `routes/projects/[id]/+page.server.ts`. The routes below
redirect to a bare `/auth/login` (or a hard-coded target) and lose the link.

- Add one server helper, `redirectToLogin(url: URL): never`, in
  `apps/web/src/lib/server/auth-redirects.ts` or next to `getSafeLocalRedirect`. It throws
  `redirect(303, '/auth/login?redirect=' + encodeURIComponent(url.pathname + url.search))`.
- Swap it into the signed-out redirects in:
    - `hooks.server.ts` (admin guard, ~line 433)
    - `routes/admin/+layout.server.ts` and the admin pages: `email-sequences`, `errors`,
      `feature-flags`, `gmail-relevance` (+ `/review`), `migration` (+ `/errors`,
      `/users/[userId]`), `ontology/graph`, `ontology/public-pages`, `users`
    - `today`, `history`, `notifications`, `onboarding`, `profile`,
      `profile/agent-keys/[callerId]` (+ `/requests`, `/requests/[requestId]`),
      `dashboard/calendar`, `time-blocks`, `voice-notes`, `test-realtime`, `debug/auth`
- Leave alone: the `auth/google/*` callbacks, which deliberately target a profile tab; the legacy
  `routes/login` redirect; and test files. Update tests that assert the old bare URL (for example
  `routes/__tests__/authenticated-pages.test.ts`).
- Verify Google sign-in carries the target: the login page encodes `resolveRedirectTarget()` into
  the OAuth `state`, and `GoogleOAuthHandler.handleCallback` (`apps/web/src/lib/utils/google-oauth.ts`)
  must send the user there rather than to the fixed `successPath: '/today'`. Read the handler and fix
  it if the state target is ignored.

### 1.5 Copy link button

- `AgentChatHeader.svelte`: add a `Link` icon button labelled "Copy link" (with `aria-label`), shown
  only when `sessionId` is set. On click, copy `buildChatResumeUrl(...)` to the clipboard, show the
  toast "Link copied", and fire `chat_link_copied`.
- Follow the Inkprint tokens and the header's existing button styles. Check light and dark, and phone
  width.

### 1.6 Events (via `captureEvent`)

| Event              | Properties                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `chat_link_copied` | `surface`: `global` / `embedded`                                                                                    |
| `chat_link_opened` | `result`: `ok` / `not_found` / `error`, `came_through_login`: boolean (the URL arrived via `/auth/login?redirect=`) |

### 1.7 Tests (free, focused)

Run with `pnpm --filter @buildos/web exec vitest run <files>`.

- `agent-chat-url.svelte.test.ts`:
    - claim, release and hand-back ordering
    - release by a non-owner leaves the param alone
    - other params, the hash and desktop `page.state` keys are preserved
    - `buildChatResumeUrl` sets the param correctly, including when one is already present
- History behavior, using the existing `page-state` fixture:
    - open pushes one entry
    - sending messages adds none
    - Back calls `handleClose`
    - X pops its own entry
    - minimize doesn't double-close (`selfPopping`)
    - X after a page change strips instead of popping
    - no `history.back()` while navigating
    - embedded instances never push
- `Navigation` deep link:
    - UUID validation
    - the strip is awaited before the open
    - already-open and parked sessions are reused
    - `not_found` gives the toast, closes the chat, and leaves no param
    - signed out: ignored
- `redirectToLogin` unit test, plus the updated route tests.
- Then run `pnpm --filter @buildos/web check`. It's the Svelte gate. It may kill a running dev
  server; `touch apps/web/vite.config.ts` restarts Vite in place. Heavy commands go through the
  machine-wide `test-gate`: if it refuses, wait 60 s, retry once, then report.
- Don't run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and don't fan out parallel test
  runs.

### 1.8 Browser check (local dev, free)

**Local dev reads and writes the prod database.** Use DJ's existing chats. Loading a chat makes no
LLM call. Closing an existing chat can bump its `updated_at` and queue a summary job; that's a known
side effect, so say so in the report.

1. Open a past chat from History. The URL gains `?chat=<id>`.
2. Click through to another page. The param follows and the chat stays open.
3. Press Back to walk pages, then Back again to close the chat. The param is gone.
4. Open, then close with X. A later Back does not reopen the chat.
5. Minimize to a stack card: the param drops. Tap the card: the param returns.
6. Paste the link into a second Chrome profile that's signed in: the same page opens with the chat.
7. Paste it signed out: login, then you land on the same page with the chat. Try this on `/today`
   and on a project page.
8. Paste a random UUID: the toast appears and the page is fine.
9. At phone width, check that the Copy link button works. Chrome window resizing is a no-op on DJ's
   machine, so use DevTools device emulation.

Testing "open a link while a reply is still streaming" needs one live message, which is a paid
model call. Ask DJ before running it, and report it as not run if he hasn't approved.

### 1.9 Phase 1 is done when

- Every item in 1.7 passes and `check` is clean.
- The browser check passes, with the paid mid-reply step either approved and run or reported as
  pending.
- Your files are committed with explicit pathspecs, and Codex's files are untouched.
- Report to DJ with the deploy-order note about the restore migration.

## Phase 2: share links

Start after phase 1 has shipped and DJ has used it. Phase 2 is web plus one migration.

### 2.1 Migration: `chat_session_shares`

New file `supabase/migrations/<timestamp>_chat_session_shares.sql`. Never edit an existing migration
file; CI fails any change to one.

| Column                      | Type                                                                                   | Notes                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `id`                        | uuid PK, `gen_random_uuid()`                                                           |                                                                                         |
| `token`                     | text NOT NULL UNIQUE                                                                   | 16 random bytes, base62 (about 22 chars), generated server-side; the only public handle |
| `session_id`                | uuid NOT NULL → `chat_sessions(id)` ON DELETE CASCADE                                  | Deleting the chat kills the link                                                        |
| `user_id`                   | uuid NOT NULL → same users table `chat_sessions.user_id` references, ON DELETE CASCADE | Owner                                                                                   |
| `title`                     | text NOT NULL                                                                          |                                                                                         |
| `show_author`               | boolean NOT NULL DEFAULT true                                                          |                                                                                         |
| `included_message_ids`      | uuid[] NOT NULL                                                                        | The checkbox selection; Update re-applies it and adds newer messages                    |
| `snapshot`                  | jsonb NOT NULL                                                                         | The cleaned transcript (2.3)                                                            |
| `review`                    | jsonb                                                                                  | Findings and fingerprint                                                                |
| `policy_version`            | text                                                                                   |                                                                                         |
| `view_count`                | integer NOT NULL DEFAULT 0                                                             |                                                                                         |
| `last_viewed_at`            | timestamptz                                                                            |                                                                                         |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now()                                                     |                                                                                         |
| `revoked_at`                | timestamptz                                                                            | Stop sharing sets it; a re-share creates a new row and a new token                      |

- Add a partial unique index on `(session_id) WHERE revoked_at IS NULL` (one live link per chat), and
  an index on `token`.
- Enable RLS, with an owner-only `SELECT` policy (`user_id = auth.uid()`). Writes and public reads go
  through server endpoints using the admin client after their own checks, the way public-page review
  rows already work. Add no anon grants and no new SQL functions. If you add one, it's server-only
  by default, and a client-callable `SECURITY DEFINER` function must check `auth.uid()` itself.
- Run `pnpm db:rehearse supabase/migrations/<file>.sql --role-probe` (free, read-only) and resolve
  every SECURITY finding. **Stop and ask DJ before applying it to prod.** Once approved, apply one
  file with `supabase db query --linked -f <file>`, then record it with
  `supabase migration repair --status applied <version> --linked`. Never use `db push --include-all`.
- Run `pnpm gen:all` to regenerate shared types.

### 2.2 Extract the review core

Split the text-only core out of `public-page-content-review.service.ts`: rule scan, secret redaction
before any model sees text, chunked LLM review that fails closed, and the fingerprint. Documents and
chats then both call that core.

- **The document path must behave exactly as before.** Keep its tests green and add none of the
  chat behavior to it.
- **Chat variant:**
    - Run the rule scan per message, so its hits map to a message directly.
    - The LLM pass labels sections `[MESSAGE n]`, and each finding returns `message` as a structured
      field. Don't map findings back by matching excerpt text.
    - Map findings to per-message flags with a `locked` boolean: `credentials` and the SSN and card
      detectors are locked, everything else is re-checkable.
- **Cost:** one review call per Create or Update, on the same profile documents use. The first real
  run is paid; ask DJ, measure it, and report the cost.

### 2.3 Snapshot builder: `apps/web/src/lib/server/chat-share-snapshot.ts`

`buildSharedChatSnapshot(sessionPayload, includedMessageIds)` returns a cleaned, versioned shape:

```ts
type SharedChatSnapshotV1 = {
	version: 1;
	title: string;
	messages: Array<{
		role: 'user' | 'assistant';
		markdown: string;
		at: string; // ISO
		work?: { seconds: number; steps: number }; // assistant turns, from turn runs
		made?: Array<{ kind: string; label: string }>; // from entity-change cards, labels only
		withheld?: { images?: number; files?: number; voice?: number };
	}>;
};
```

- **Whitelist, don't blacklist.** Copy only these fields. Drop tool messages, tool calls, metadata,
  reasoning, model, cost and every ID.
- Turn markdown links into the app (relative paths, any `build-os.com` host) into plain text, and
  keep external `https` links. Use a URL parser, not a regex over prose.
- Get the input from the same server restore loader the session GET uses (Codex's
  `chat-session-restore.ts` once it lands), so this doesn't start a second way of reading a session.
- **Size cap:** before choosing it, query the largest real sessions (message count and total text
  bytes) and set the cap above the 99th percentile. Above the cap, share the most recent N messages
  and say so in the preview.

### 2.4 Endpoints

JSON responses use `ApiResponse` from `$lib/utils/api-response`. Use a user-scoped Supabase client
for the auth and ownership checks, and the admin client only for the share table writes and the
public read.

| Route                                                                  | Behavior                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/chat/sessions/[id]/share/prepare`                           | Owner only. Builds the snapshot for the default selection (all messages), runs review, returns the preview, per-message flags and a fingerprint. Writes nothing.                                                                                                           |
| `POST /api/chat/sessions/[id]/share`                                   | Body: `{ includedMessageIds, showAuthor, fingerprint }`. Rejects locked messages. Re-reviews if the text no longer matches the fingerprint. Creates the live row or updates it (same token). Returns `{ url }`.                                                            |
| `DELETE /api/chat/sessions/[id]/share`                                 | Sets `revoked_at` on the live row.                                                                                                                                                                                                                                         |
| `GET /share/[token]` (page under `src/routes/(public)/share/[token]/`) | Reads by token with the admin client where `revoked_at IS NULL`, selecting only `title, snapshot, show_author, created_at, updated_at` and the owner's display name when `show_author`. Unknown or revoked tokens render "This chat is no longer shared." with status 404. |
| `POST /api/share/[token]/view`                                         | Increments `view_count` and `last_viewed_at`, mirroring `/api/public/pages/[slug]/view`.                                                                                                                                                                                   |

Check that `/share/*` renders signed out: `hooks.server.ts` has no global auth gate today, but
confirm it.

### 2.5 Share sheet (in the chat)

- Add a `Share2` header button next to Copy link, shown when a session exists. It opens a sheet.
- The sheet shows:
    - the title
    - each message with a checkbox (flagged ones unchecked, with the reason; locked ones disabled)
    - a "Shared by <name>" switch
    - **Create link**, or **Update link** / **Stop sharing** when a live share exists
- After Create or Update, copy the URL and show the toast "Link copied. Anyone with it can read
  this chat."
- If the safety check couldn't run, say "Safety check couldn't run. Try again." Never publish
  unreviewed text.
- Use Inkprint tokens; check light, dark and phone width.

### 2.6 Public page

- New `SharedChatTranscript.svelte`. It renders the snapshot with the existing chat markdown
  renderer (`agent-chat-markdown.ts`). **Don't reuse `AgentMessageList`:** its proposal, undo and
  approve cards must never appear here.
- Each assistant turn shows a quiet "Worked for 54s · 12 steps" line.
- `made` items render as plain labels ("Created task · Draft pitch deck"). Withheld attachments show
  as "1 image not shared".
- The header shows "Shared by DJ · Oct 18, 2026" when `show_author` is on, using `updated_at`.
- Add `<meta name="robots" content="noindex">` always. The OG title is the chat title; the OG
  description is "A BuildOS chat shared by <name>" or "A BuildOS chat"; the image is the default app
  card. **Never generate images.**
- The footer is "Made with BuildOS". The **Try BuildOS** button carries the relief copy and links to
  `/signup?utm_source=shared-chat&utm_medium=share&utm_campaign=chat-share`.

### 2.7 Events

Add `chat_share_created`, `chat_share_updated` and `chat_share_revoked` (`messages_shared`,
`messages_flagged`); `shared_chat_viewed` (`share_id`, `viewer_signed_in`); and
`shared_chat_cta_clicked` (`share_id`).

The loop DJ watches: share → view → CTA click → signup (`utm_source=shared-chat`) → activation.

### 2.8 Tests and validation

- **Snapshot privacy tests:**
    - no UUIDs anywhere in the output
    - no tool data or metadata keys
    - internal links unlinked, external links kept
    - attachments counted, never embedded
    - the whitelist ignores unknown new fields
- **Review core:** document tests unchanged and green; the chat variant maps per-message flags and
  locks the right categories.
- **Endpoints:**
    - owner-only
    - locked messages rejected
    - fingerprint mismatch triggers a re-review
    - one live share per chat
    - revoke, then re-share, gives a new token
    - a revoked token 404s
    - deleting the session cascades
- Run `pnpm --filter @buildos/web check`.
- Browser check signed out on `/share/<token>`: light, dark, phone width, `noindex` present, no
  clickable links into the workspace.

## Stop and ask DJ before

- Applying any migration to prod, including confirming Codex's restore migration is applied before a
  deploy.
- Any paid run: a live chat message (the mid-reply check) or a real review LLM run. State the scope
  and the acting model, give a cost estimate based on that model's last measured spend, and wait for
  explicit approval. Report anything not approved as not run.
- Deploying.

## Out of scope

- Reopening the host task or document modal from a link (D3 follow-up; it needs those modals to be
  URL-addressable).
- A "Shared chats" management list (D5 follow-up).
- "Continue this chat in my BuildOS" for signed-in viewers (D6).
- Sharing with specific people, or shares that require login.
