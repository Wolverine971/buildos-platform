<!-- tasker/168-knowledge-shared-projects.md -->

# 168 — Knowledge in shared projects (who owns Kyle, who sees what, Ask → Share)

**Status:** BUILT 2026-11-18 (UNCOMMITTED; migrations `20261118300000`, `…300100`, `…300200`, `…300300` APPLIED
to prod and recorded) · **Opened:** 2026-11-18 · **Parent:** 160 · **Size:** ambitious
**Design:** `docs/research/knowledge-shared-projects-2026-11-18.md` (options A + B + E).
**Clay lessons (related, not built here):** `docs/research/clay-lessons-for-buildos-2026-11-18.md`.

## DJ's decisions (2026-11-18)

1. A name goes to **whoever types it** ("I don't really have a strong opinion").
2. Members see **public web facts** by default ("I think that's okay").
3. A grant lasts **while you're both in the project** (default; Always / 30 days also offered).
4. The card **says a hidden detail exists** ("Alice has 2 contact details · Ask").
5. Verified public **organization** facts are shared only as a cache for research "if it
   pertains to something a user is doing": check them before paying for a web search.
6. "Do the ambitious version."

## What was built

**Database** (`20261118300000_knowledge_project_sharing.sql`, `…300100_knowledge_lens_source_url.sql`)

- `knowledge_shares` (asks + grants; contact / all / picked predicates; membership / always /
  until) + trigger-written `knowledge_share_events`. Fold policy: leave_behind.
- `knowledge_fact_share_level()` — the per-fact rule table: notes/knows/birthday never;
  unverified owner-only; facts read from THIS project's tasks/docs shared; a person's public
  professional face (headline, current job, links, description) and org/place facts shared
  only with a public web source; contact details and everything else ask-only.
- `knowledge_project_lens(project, kind, ids, viewer)` — other current members' entries on
  these records, shared facts (+ source_url), granted facts labelled, hidden counts, ask/grant.
  Recomputed every read: leaving the project, revoking or editing a fact applies immediately.
- `knowledge_request_share` (members only, only entries linked to that project's work; 14-day
  open ask, merge, quiet after a decline for 30 days, 30 open asks cap; agents may ask),
  `knowledge_decide_share` / `knowledge_share_entity` / `knowledge_revoke_share` (signed-in
  humans only, revoked from service_role), `knowledge_cancel_share_request`,
  `knowledge_entity_shares` ("Who can see Kyle"), `knowledge_share_inbox`.
- Record-link index `(record_kind, record_id) INCLUDE (owner_user_id, entity_id)`.
- Check: `supabase/tests/knowledge_sharing.check.sql` (owner, editor, removed member,
  stranger; spoofing, direct insert, self-approve, service-role approve, note-sharing all
  refused; grant lapses when the grantee leaves; revoke; quiet decline; history). Two mutated
  copies (share everything / show ask-only facts) both fail it.

**Web**

- Task card: `/api/onto/task-entities?…&knowledge=1` also returns `lens` for one task in a
  shared project (solo projects skip the read). `KnowledgeLensSection` shows "From Alice's
  People" (task-only card) or "Also in this project" (under your own card) with Ask / Asked ·
  Cancel / "kept private" / "Shared by Alice while you're both in X".
- Docs + task descriptions: `/api/knowledge/mentions` returns `lens`; names only another
  member filed are linked too (`lens:` ids) and open a lens-only card.
- Owner: your card's GET includes `sharing`; `KnowledgeSharePanel` shows asks (Share… / Not
  now) at the top and "Who can see this" (shared projects + members, live grants with Stop,
  "Share more with…" a person or the whole project) with the What / How long sheet.
- Profile › People & agents › **Shared knowledge** (`SharedKnowledgeSection`,
  `/api/knowledge/shares/mine`): asks waiting on you + everything you've shared, Stop.
- Emails: owner on a new ask, asker on a grant; never the entry's name or any value.
- "Add to People" on a name another member filed also copies their **public-web** details with
  sources (`/api/knowledge/lens/adopt`, lens recomputed server-side; grants never copied).
- Routes: `api/knowledge/lens`, `shares` (ask/share), `shares/[id]` (decide/revoke/cancel),
  `shares/inbox`, `shares/mine`, `entities/[id]/shares`, `lens/adopt`.

**Worker**

- File by author: the trigger already queued the signed-in writer; the worker now files, for
  someone who isn't the task's creator, only the names their edit added plus their own earlier
  names from that task (`editorRowIds`), so editing one word of Alice's task never copies all
  her names into Bob's People.
- Public org layer (`publicOrgLayer.ts`): research on an org you know the homepage of first
  borrows fresh (<180 d) public facts for that exact domain (never by name), searches only for
  what's still missing, or skips the search ("Already known from its website"). After research,
  your accepted facts from the org's OWN site (same host) are promoted to a public org keyed by
  domain. Never email/phone, never people. Empty today (0 public entries) — fills as people
  research orgs.

**Agents** (chat + MCP)

- `get_project_knowledge_lens` / `knowledge.project_lens`: read; every fact labelled
  `shared_by` + `scope: project:<name> | grant`; owner ids never reach the model; agent access
  'off' refuses; selected-project MCP connections get the lens for their projects only.
- `request_knowledge_access` / `knowledge.request_access`: same tier as request_project_access
  on MCP (emails the owner), chat write with receipt (no email from the worker path); no approve
  tool anywhere; selected-project connections can't ask (veto-able).
- Lens results count as outside content in chat (asks/saves after a lens read go through the
  review step); chat history stores only ids/counts/hashed granted values.
- Copy-out guard built: wrap-up capture drops facts matching a granted lens value
  (`shared_by_another_member`); fails closed if the keys can't be read.
- Tests: shared-agent-ops 22, agentic-chat-runtime 97, worker 265, web 521; typechecks clean;
  tool-size budgets raised (+1,731 B worker, +1,479 chars web, dated notes).

## Checks run

- Rehearsal with `--role-probe`: PASSED (+ standing checks); applied with a ROLLBACK dry-run
  first; ledger repaired for both versions.
- Web `pnpm check`: 0 errors / 10,219 files. Vitest: lens-match (4), KnowledgeLensSection (4,
  collaborator view rendered from lens data), record-knowledge-mentions.
- Worker typecheck clean; vitest: taskEntityKnowledgeSync (3), publicOrgLayer (6),
  extractTaskEntitiesWorker (8, fake db learned `.upsert().select()`), knowledge/\* green.
- Browser (localhost on prod data, as DJ): Ian card on a UXM Training Website task shows "Who
  can see this · UXM Training Website · Ian Miner", Share sheet opens. Collaborator view not
  browser-checked (needs a second signed-in account); covered by the SQL check + component test.

## 2026-11-18 morning — live checks + People tab

- **Two-account walk-through, live** (`node apps/web/scripts/knowledge-sharing-e2e.mjs`): two
  test accounts (`djwayne35+kg-owner@` / `+kg-collab@`, logins in apps/web/.env, gitignored)
  drive the real local routes against prod: 26/26 checks (lens shows public detail + "1 contact
  detail", no email/note; ask, merge, no self-approve; owner Profile + card show the ask; note
  share refused; grant → email shows labelled; adopt copies the headline only; People tab both
  sides; leaving the project ends it; history). Both emails sent ("…asked about someone in your
  People", "…shared details with you"). Side effect: 2 "New User Signup" alerts; the test
  accounts count as signups (no test-account flag exists).
- **Paid Find more, live (approved, ~1¢ budget):** Cody Shooting Complex, "What they do" +
  "Location", DeepSeek V4 Flash (fast route) + Serper: **$0.0023**, 3 pages, 4 new details, all
  from codyshootingcomplex.org (Cody, WY, not the Iowa range); tray pinged "Research done".
  Leftover: an older "Industry: Shooting Range" fact still cites the Iowa DNR page.
- **Public org layer, live and free** (`apps/worker/scripts/public-org-layer-check.ts`): promoted
  2 own-site facts (description, address; no email/phone) to a public org keyed
  codyshootingcomplex.org; a second account's entry with that homepage borrowed them and the
  worker skipped the search ($0, model + search stubs that throw).
- **People tab** on the project page (Overview · Tasks · Docs · Activity · People) and on the
  /projects card: everyone the project's tasks/docs name, "N mentions · You, Alice"; your rows
  open the card, others' rows open "From Alice's People" in place
  (`/api/knowledge/project-people`, `ProjectPeopleTab.svelte`). Browser-checked on UXM.
- Find more dialog shows only focus chips that fit the kinds being researched (no Education /
  Role & company for an organization).

## Adversarial review fixes (2026-11-18, migration `20261118300200_knowledge_sharing_hardening.sql`)

Review found 2 high, 3 medium, 4 low; core (membership, grants, RLS, grants-to-roles, adopt,
agents) sound. Fixed:

1. HIGH public-org poisoning → promotion only of facts THIS research run wrote
   (created_via enrichment + run_id), never borrowed facts, never typed-in/chat/MCP facts.
2. HIGH summary leak → the lens shows the owner's summary only when it equals a shown
   headline/description.
3. One-grant-only / stuck viewer → every live grant applies; Ask says `already_shared` /
   `nothing_to_ask` from the actual hidden count (one `knowledge_entity_visibility()` decides
   for both the lens and Ask).
4. Ask→cancel email stream → ≤2 asks per entry and ≤5 per owner a day (withdrawn count), and
   the owner email at most once per asker+entry a week.
5. Platform "homepages" (LinkedIn/Facebook/Wix…) and deep links never key the public layer.
6. "Public web" = written by a research run with a web source (not any URL).
7. Owner's own "Me" entry excluded. 8. Deleted tasks/docs and unlinked records no longer
   count as "from this project". 9. Borrowed facts aren't re-promoted (they go stale);
   public source rows are reused per URL (2 duplicates from earlier runs removed).
   Proof: the check SQL gained a probe per finding and FAILS against the pre-fix functions
   (shows "Alice Self", the SECRET summary, the chat claim); passes after. Live re-runs: two-account
   script all pass; public-org check all pass ($0). Edge case since fixed (below).

**Edge case fixed (`20261118300300_knowledge_lens_text_still_says.sql`):** a number (or email,
address, employer) edited out of a project's task kept showing to teammates. "From this project"
now also requires the task/doc to still say it at read time (`knowledge_record_still_says`: the
stored quote, else the value — phone by last 10 digits, email/text exactly, relationship by the
other entry's name). The owner keeps the fact in their own People (deleting a number from a task
is usually cleanup); teammates see it drop to "N contact details · Ask". Prod: 160/160
task-sourced facts still match, so nothing visible changed on apply. Check SQL probe fails on the
old function and passes on the new; the live two-account script adds the same pair and passes.

## Not done / next

- A signed-in browser walk-through as the collaborator (the script covers the routes; the UI side is covered by the component test).
- Ask from chat surfaces on the web card for `chat_session` records (lens is task/doc only).
- people_requests `kind='knowledge'` was not used: knowledge_shares holds asks itself; the
  Profile section shows them beside the people requests.
- Clay lean items (stop early, 30-day cache, "not found" per field, try-3-first) — tasker 164.
