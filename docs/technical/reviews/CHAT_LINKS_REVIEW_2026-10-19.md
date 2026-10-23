<!-- docs/technical/reviews/CHAT_LINKS_REVIEW_2026-10-19.md -->

# Chat links review: fix list

This is a review of `e51ee923e` (resume links and Back), `07e0f60a2` (share links) and the follow-up
line in `2b0f738be`, against `docs/specs/CHAT_LINKS_RESUME_SHARE_PLAN_2026-10-18.md`. It was
written 2026-10-19.

It came from three read-only code reviewers, offline probes using the repo's own `marked`,
`sanitize-html` and `turndown`, and a live check on build-os.com. Line numbers are anchors as of
10-19.

## Status 2026-10-20: everything below is fixed (uncommitted)

All F1–F10 items, every "Low" item, and the product calls are fixed in the working tree. Only
`model-incidents.ts` was left as-is; it's unreachable, because the hook redirects first.

- **Tests and type check:** 35 related test files (405 tests) pass, and
  `pnpm --filter @buildos/web check` reports 0 errors.
- **Each fix has a test that fails on the old code.** The new history tests and the markdown link
  test were run against `HEAD` to confirm this.
- **Browser, local dev on the fixed code:**
    - `/projects/create` → X now lands on `/projects`. Prod, on the old code, strands you on a blank
      page; reproduced on build-os.com.
    - A pasted link opens the chat, and Back closes it and stays on the page.
    - An empty chat shows no Copy link.
- **Product calls (decided):**
    - Copy link and Share appear only after the first message.
    - The embedded Copy link/Share bar stays.
    - Links keep `entity=` and reopen the task or document under the chat. That's better than D3.
- **Also fixed:** an older bug in the in-app chat. A link to a bare record ID, followed by a real
  link, left the real link unclosed, so it swallowed the rest of the paragraph (`markdown.ts`
  `agentSanitizeOptions`).
- **Open (DJ):** document card detection was already weak before this work. It misses normal card
  numbers like `4111 1111 1111 1111`. Fixing it needs a document policy-version bump, which
  re-reviews public docs as they sync (small paid calls).
- **Not checked live:** the full share flow. It needs one paid review call.

## What already passes

- **Tests:** 158 new tests across 20 files, plus 100 regression tests (document publishing, the chat
  modal, ProjectDesktop, AgentMessageList), all pass. `pnpm --filter @buildos/web check` reports 0
  errors and 0 warnings.
- **Prod database:**
    - Migrations `20261018193727` (restore) and `20261019024245` (shares) are applied and recorded.
    - `chat_session_shares` exists with RLS on, an owner-only SELECT policy, and SELECT as the only
      client grant.
    - `get_chat_session_restore_v1` exists.
    - 0 share rows, so Share has never run end to end.
- **Deploy:** Vercel succeeded, and `/share/<unknown>` returns 404 "no longer shared" with noindex.
- **Live on build-os.com:**
    - History → open a chat: the URL gains `?chat=`. Back closes the chat and stays on History.
    - A pasted link on `/today` opens the chat. Back closes it and stays on `/today`.
    - A random UUID shows "Couldn't open that chat." and the URL is cleaned.
- **Not checked live:**
    - Clicking a link inside the chat: in-app navigation stalls in a background Chrome tab, even with
      no chat open.
    - The share flow, which needs a paid review call.
    - The mid-reply link.

## Fix first

### F1. Closing a pop-up chat cancels the host page's refresh or navigation (activation path)

`AgentChatModal.svelte` `closeChat()` (~2258) calls `chatHistory.close()`, which queues
`history.back()` (`agent-chat-history.svelte.ts` `close()` → `popChatEntry`). It then calls the host's
`onClose` immediately. SvelteKit's popstate handler sets `token = {}` (client.js:2875). That drops
any `invalidate` or `goto` the host started in between (client.js:457, 1809).

- **`/projects`, "New project" chat:** `handleChatClose` runs `invalidateAll()`, which is dropped. The
  toast says "Project created!" but the list doesn't show the new project.
- **`/projects/create`:** `handleClose` runs `goto('/projects')`, which is dropped. The user is left on
  a blank page.
- **Also dropped:** ProjectDesktop's `invalidate('ontology:projects')` and History's
  `invalidate('history:data')`.

**Fix:** run `onClose` only after the pop has settled (`await waitForChatHistorySettled()` or a
popstate-settled promise), or defer the host callback until after the pop. Add a test in which a
host `onClose` calls `goto` and `invalidateAll`, and assert both complete.

### F2. The share safety check misses secrets and sends them unredacted to the model

In `chat-share-review.ts` (~68-100), the rule scan and `redactFixedFormatMatches` run over
`JSON.stringify(message)` of turndown-converted markdown. Two things break the detectors:

- JSON turns line breaks into `\n`, so `\b` fails at the start of every line after the first.
- Turndown escapes `_` as `\_`, which breaks the `sk_live_`, `ghp_`, `github_pat_` and similar
  patterns.

Probe results: `my info:\n123-45-6789` is caught on the raw text but missed in the JSON section. A
Stripe `sk_live_…` key is missed both escaped and in JSON. Missed secrets are never locked and are
sent to the LLM as-is.

**Fix:** scan and redact each message's original content, per message, before markdown conversion
and without JSON-escaping. Then build the LLM sections from the redacted text. Add tests for:

- an SSN, a card number and a key on a later line
- a key inside a code block
- an underscore-bearing key (Stripe, GitHub)

### F3. Raw HTML smuggled onto the public share page

`chat-share-snapshot.ts` `cleanSharedMarkdown` (~98-157) runs marked → sanitize-html → turndown.
Entity-encoded HTML comes out as literal HTML because turndown doesn't escape `<`. Probe:
`hello &lt;img src="/auth/logout"&gt; world` becomes `hello <img src="/auth/logout"> world`.

The public renderer (`SharedChatMessage.svelte` → `renderAgentMarkdown` → `agentSanitizeOptions`)
allows `img` with relative or `data:` sources, and links with `http:` or relative hrefs. Impact:

- An owner can put arbitrary images on build-os.com.
- Links into the workspace become clickable.
- `<img src="/auth/logout">` silently signs out any signed-in visitor, because GET logout signs out.

No script runs, so this isn't XSS.

**Fix:**

- Give the share page its own strict sanitizer: no `img`; `a` only with absolute `https:` hrefs
  outside build-os.com.
- Escape `<` and `>` in the cleaner's output.
- Add probe tests for entity-encoded `img`, `a` and `iframe`.

### F4. Sharing a long chat will likely time out

`svelte.config.js` sets `maxDuration: 10`, and the share routes don't override it.
`reviewChatShare` runs its LLM chunks one after another (12k characters each, up to 100 messages).
Anything over about 2 chunks will likely hit a 504. It fails closed, but long chats, which make up
most of DJ's, can't be shared.

**Fix:** add `export const config = { maxDuration: 60 }` (or whatever the plan allows) to the
`prepare` and `share` routes. Run chunks with bounded parallelism, as the document path does. Show a
clear "too long to check, share the last N messages" path instead of a timeout.

## Fix soon

- **F5. `/briefs` closes the global chat on a brief refresh.** `routes/briefs/+page.svelte:264` calls
  `replaceState(url, {})`, which drops `agentChat`, and the history watcher reads that as Back. It
  also strips `?chat=`. The same pattern appears on the admin chat users and workflows pages. Fix:
  spread `page.state` in those calls, or make the watcher ignore state loss without a popstate.
- **F6. History Brain Dump: closing with X leaves `?id&itemType` in the URL**, and a refresh
  reopens the chat (`routes/history/+page.svelte:487-492`). The strip runs on the entry being popped.
  Strip after the pop settles; this goes away with F1's ordering.
- **F7. The document chat dock never rewrites `?chat=` after its first close**
  (`agent-chat-history.svelte.ts:133-139`, `AgentChatModal.svelte:393`). An embedded chat's
  visibility ignores `isOpen`, and `DocumentInteractDock` stays mounted when hidden. Include `isOpen`
  in embedded visibility.
- **F8. The document review changed without a policy version bump.** `CARD_CANDIDATE_REGEX` became
  an overlapping lookahead (`public-content-review-core.ts:83`). Documents can now get new or
  duplicate card findings, while cached passes from the old detector are still reused. Either revert
  to the old regex for documents, or bump `PUBLIC_PAGE_CONTENT_POLICY_VERSION`.
- **F9. Share labels show escapes.** "Q&A plan" becomes `Q&amp;A plan`, "my*project" becomes
  `my\_project`, and "Launch *v2*" becomes `Launch \_v2*` (`cleanSharedLabel`,
`chat-share-snapshot.ts:160-166`). Decode entities and unescape for plain-text labels.
- **F10. Some IDs and workspace links still leak.**
    - The UUID regex uses `\b`, so `task_<uuid>`, `task\_<uuid>` and hyphenless 32-hex IDs pass
      through (`chat-share-snapshot.ts:45`).
    - `www.build-os.com/...` stays as text, then GFM autolinks it at render time.
    - Fix: match IDs without word boundaries, and disable autolinking in the share renderer.

## Low

- **Share view counter:** no rate limit or Origin check, and the cookie de-duplication can be
  skipped. `view_count` can be inflated, and each hit costs an admin read and a write
  (`chat-share-view.ts`).
- **The share token is sent to PostHog** as `share_id` (`(public)/share/[token]/+page.svelte:46, 82`).
  Hash it or use the row ID.
- **The author name is reviewed even when hidden.** A finding on section 0 blocks sharing outright
  (`chat-share-review.ts:68-78`). Leave the name out when `showAuthor` is false.
- **Forward after a Back-close** shows `?chat=X` with no chat open, and a refresh reopens it.
- **Empty or loading global chat:** after a page change, Back closes it one step early
  (`Navigation.svelte` `restoreHistoryUrl` ~664-671).
- **Extra history entries:**
    - after a page-replacing navigation, or a reload with a chat open
    - `popChatEntry` returns early after `selfPopping` was set, which can swallow a later real Back
- **`crypto.randomUUID()` unguarded** (`AgentChatModal.svelte:392`): the chat won't load over plain
  http on a LAN IP, which only affects phone testing.
- **Login:**
    - `auth/login/+page.server.ts` follows any same-origin `redirect=`; refuse `/auth/*` targets as a
      loop guard.
    - `+error.svelte:132` "Sign in" drops the query.
    - Google sign-in error paths drop `redirect` (this predates the change).
    - `/today?chat=<any uuid>` skips onboarding for an hour, even when the chat isn't the visitor's.

## Product calls for DJ

- **Embedded chats now have a Copy link + Share bar** above the conversation, in task, document,
  desktop pane and brief chats (`AgentChatModal.svelte:3347`). The spec only put the buttons in the
  header. Keep or remove?
- **Copy link shows before the first message**, so a copied link can open an empty chat. The spec
  said the link exists only once a message is sent.
- **Links copied with a task or document modal open keep `entity=` / `entity_id=`**, so opening the
  link reopens that modal under the chat. This contradicts D3 (main chat only), but it may be the
  better experience. Keep or strip?
- **Phone header:** two extra 44px buttons in the chat header. Check for overflow at phone width.
