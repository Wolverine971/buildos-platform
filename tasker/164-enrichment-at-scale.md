<!-- tasker/164-enrichment-at-scale.md -->

# 164 — Find more at scale: async queue, bulk enrich, hill-climbing research agent

**Status:** PHASE 1 BUILT · PART A "GET IT RIGHT" SHIPPED (code committed by 2026-11-18; migration 20261118100000 APPLIED, file committed 22bc8dad1) · **Opened:** 2026-11-17 · **Parent:** 160 · **Size:** ambitious
**DJ (2026-11-17):** "a hill-climbing agentic task … I really want to be able to enrich this
data and have this scale … use a combination of Jev and searching the web and just be able to
find good information … I really like what we got so far. I want to make this really nice."

## DJ's vision (his words, condensed)

- **Async, not blocking.** On `/knowledge?e=…`, Find more should not hold the card. It goes into a
  **bottom tray (like a bottom chat window)** that shows it searching ("searching for first
  information…") while DJ clicks other things. **Multiple searches can be queued.**
- **Sorting.** Sort/filter by whether an entry has been enriched or not.
- **Multi-select → Enrich.** Select 15 (or however many) people/things → Enrich → research runs
  on all of them.
- **Ask what to look for.** Before a bulk run: "What kind of information do you want to search
  for across these?" Shared instructions for the batch plus optional per-item instructions.
- **Re-enrich warning.** If something was already enriched: "Are you sure you want to re-enrich
  this? What specific information are you looking for?" E.g. select 5 enriched people → paste
  "Look for a phone number on these people" / "Look for an email address" → enqueued.
- **Scalable.** This is the part DJ wants to prove: good information, at scale.

## Phase 1 — the experience (build now)

1. **Queue model.** `knowledge_runs` + `knowledge_run_targets` already exist (targets have
   `fields`, `status`, `summary`, `facts_added`, `cost_usd`). Per-target instructions need a
   column (`instructions text`, new migration). One run per Enrich click; targets drain through
   the existing `knowledge_enrich` worker. Caps stay ($0.03/entry default, $1/run, $2/user/day,
   3 runs at once; reservation function `knowledge_reserve_enrichment_run`).
2. **Bottom tray** (app-wide on `/knowledge` at least; reuse the bottom-right stack/tray patterns:
   daily-brief stack card, `organize/PendingChangesTray.svelte`). Rows: entry name, live status
   (queued → searching → reading → found N), cost so far, open card, cancel. Collapsible. Survives
   navigating between cards. Polling or realtime on `knowledge_run_targets`.
3. **List:** "Researched / Not researched" filter + sort (uses `knowledge_entities.enriched_at`;
   extend `knowledge_list` RPC with a new migration). Checkbox multi-select with a sticky
   action bar: "Enrich N".
4. **Enrich dialog:** shared "What should we look for?" (presets: website, role & company,
   email, phone, LinkedIn, location + free text), per-item override, re-enrich warning listing
   which ones were already researched and when, cost estimate (N × per-entry cap) before confirm.
5. Single-card Find more uses the same dialog (lighter) and drops into the tray.

### Phase 1 status (2026-11-17, built, UNCOMMITTED)

What DJ gets on `/knowledge`:

- **Researched / Not researched** filter chips with counts, and **Sort**: recently updated, name
  A–Z, recently researched. "Researched" is per user (your own finished Find more, or the
  worker's `enriched_at` on your private entry). Researched rows show a small sparkle (date on
  hover); rows being researched show a spinner.
- **Multi-select:** a checkbox on every row (shift-click selects a range), "select all shown",
  selection survives filter changes. A bar appears bottom-left: "N selected · Clear · Enrich N".
- **Enrich dialog ("What should we look for?")**: focus chips (Website, Role & company, LinkedIn
  & profiles, Location, What they do), free text for the whole batch, optional per-entry notes.
  Already-researched entries are listed with dates: "Research again? Say what you're looking
  for", with "Skip these N". Re-researching needs a focus or text before Start is enabled.
  Shows "Up to $X · N × $0.03 at most each", today's spend of $2.00, and warns when the day's
  allowance or the 3-batches-at-once limit won't cover everything. Phone and email aren't offered.
- **Research tray** (bottom-right, like a chat window): "Researching 3 of 15 · 4 new details so
  far", one row per entry: waiting → searching the web → reading pages → pulling out details →
  saving → "3 pages read, 2 new details". Click a row to open the card; X stops one entry, "Stop
  all N" stops a batch. Collapses to one line; Clear removes finished batches. Stays put while
  you open other cards.
- **Card Find more** opens the same dialog (single-entry version) and lands in the tray; the card
  shows its own progress line and reloads itself when its research finishes.
- **Up to 75 per click**, split into batches of 25 (3 at once). If a later batch is refused,
  the started ones keep going and the rest stay ticked with the reason.

Under the hood:

- Migration `supabase/migrations/20261117100000_knowledge_research_queue.sql`: targets get
  `instructions` (≤1200 chars), `phase`, `updated_at`; `knowledge_list` gains `p_researched`
  and `p_sort` (old 6-arg version dropped; callers use named args) and returns `researched_at`
  per row and researched/not counts. Rehearsed with `--check supabase/tests/knowledge_graph.check.sql
--refresh --role-probe`: PASSED (new assertions: per-target checks, researched filter + sort,
  bob can't see alice's research, signed-in users can't write targets). **Not applied.**
- Shared (`enrichment.ts`): fields narrowed per kind (`enrichFieldsFor`; also fixed websites being
  asked for `owns`), per-target instructions (entry note first, then batch text),
  `startKnowledgeEnrichmentBatches`, `cancelKnowledgeResearch` (server-only, owner-scoped).
- Worker: uses target instructions (falls back to the run's), writes phase, claims a target only
  while still queued, and checks it is still running at every phase so Stop takes effect before
  the next paid step. **Fixed a real crash:** with 3+ targets, two lanes could both pass the
  queue check and one got `undefined` (every run of 3+ entries would have failed at the end).
- Web: `GET /api/knowledge/research` (tray in one call, two reads, user client), `POST
/api/knowledge/research/cancel` (admin client), `POST /api/knowledge/enrich` takes up to 75 ids - `entry_instructions`, list endpoint takes `researched`/`sort`. One poll for the whole page
  (`research-queue.svelte.ts`): every 3 s only while something runs, nothing while the tab is
  hidden, stops when idle, one re-check on window focus.
- Tests: shared 51 (12 new), worker 11 (3 new), web 6 new; web check 0/0; worker typecheck +
  test types clean; eslint clean. No paid runs.

Deploy order: **apply the migration first**, then web + worker (new code writes/reads the new
columns). Old code keeps working on the new schema.

Not done: signed-in browser check (needs the migration in prod), phone check of tray + selection
bar, one real paid run through the tray (needs DJ's OK).

Forks for DJ (veto-able):

1. **Phone / email for people:** still never researched; dialog doesn't offer it. Allowing it
   only on explicit per-entry request, results private, is a Phase 2 call.
2. **Re-research requires saying what to look for** (a focus chip or text). Easy to relax.
3. **Scale vs caps:** $2/day ≈ 66 entries at the $0.03 cap; 75 per click. For proving scale DJ
   may want a higher daily cap for himself.

## Phase 2 — the hill climb (research quality at scale)

- **Eval set first.** ~40 entries from DJ's real graph with hand-checked truth (website, role,
  company, LinkedIn, location). Score each research version on: facts found that are right
  (precision), gaps filled (recall), wrong facts kept, cost per entry, time per entry.
  Offline replay where possible (cache search results + pages so reruns are free).
- **Loop:** Jev picks which gaps matter and which queries to run (structured decision, no prose);
  search → read → extract with exact quotes → verify → stop when gaps filled or budget out.
  Try: query planning per kind, site-targeted queries (company site, LinkedIn, Crunchbase,
  YouTube about pages), reading more pages vs fewer, a second pass only for missing fields.
- **Scale levers:** shared public layer (an org's public website/address researched once serves
  every user — the schema already separates public vs private), cache by URL, skip entries
  with nothing to search (one-word names with no org), batch concurrency per user.
- **Private contact info.** DJ asks for phone/email searches. Today people never get
  phone/address/birthday researched (privacy rule in the worker). Fork for DJ: allow
  phone/email lookups only when the user explicitly asks per entry, keep results private,
  never shared. Needs DJ's call before building.
- Paid runs need DJ's explicit OK each time, with model + estimate.

## Done when

- Phase 1: DJ selects 15 entries, types instructions, watches them run in the tray while browsing,
  sees results land on cards. Re-enrich warning works.
- Phase 2: a scored eval with a version-over-version table; cost/entry and precision reported.

## 2026-11-17 evening: DJ calls + first measured research (paid, approved)

- DJ chose 1A: person phone/email researched only via the explicit "Phone & email" choice
  (`ENRICH_PERSON_CONTACT_FIELDS`), results private; address/birthday/note/knows never. Worker
  prompt v2; contact searches add a "contact email phone" query.
- Daily research limit: $0.50 per user, $5 for admins (`dailyEnrichBudgetFor`, tray shows the
  caller's own cap).
- Bug fixed: several values for a single-valued predicate in one batch (Tim Ferriss: 3 active
  headlines) → most confident stays active, the rest suggested; a suggested value no longer
  supersedes the current one.
- `apps/worker/scripts/knowledge-research-run.ts`: runs research locally on named entries (same
  reservation, no queue job, deployed worker never sees it); dry by default.
- Measured, 12 entries: $0.133 (1.1¢/entry), 28 details, 8/12 found something. Search is ~96% of
  cost ($0.008 Tavily basic per search; model ~$0.0004/entry). Businesses + public figures: 1
  search, high hit rate. Private people: 2 searches when employer known, 1 of 3 found anything.
  Phone & email on 2 people: 1 found (verify it's the right person).
- Cost projector: https://claude.ai/artifact/YSR5t8cm2xQTpuNnxF9peS — levers: cheaper search
  (Serper ~$0.001), skip entries with nothing to search, share public research across users.

## 2026-11-17 night: Serper provider BUILT (UNCOMMITTED)

- `createSerperDiscoveryAdapter` + per-surface order `WEB_SEARCH_PROVIDER_ORDER`
  (`apps/worker/src/workers/agent-run/webResearchPort.ts`): knowledge research `['serper','tavily']`,
  chat / agent runs / table fill `['tavily']` until a bake-off. Missing key → skipped; Serper error →
  Tavily. Reserves at the max fallback price, settles to the real one ($0.001 Serper).
- Knowledge panel: website read first; panel text offered as evidence only when quoted verbatim;
  people panels limited to name/type/description.
- Fixed: a search cancelled just before sending hung to the 30 s timeout.
- Needs: `PRIVATE_SERPER_API_KEY` locally + Railway `daily-brief-worker` (+ `agentic-chat-worker`
  for a later flip). Bake-off: `knowledge-research-run.ts --provider serper` on the 12 entries,
  ≈ $0.02, needs DJ's OK.

## 2026-11-17 night: Serper bake-off (paid ~$0.02, DJ approved)

- Same 12 entries: Tavily $0.133 vs Serper $0.021 (≈ 6× cheaper), 58 s vs 38 s for 10.
- People you know: Serper found Rod Chamberlin (Magnum Wealth) + Louis Arnette (LA Industrial
  Services); Tavily neither. Famous names: Serper ran second, so "nothing new" isn't a fair test.
- Wrong entity, same name: Tavily → Cody Shooting Complex in Iowa (DJ's is Cody, WY,
  codyshootingcomplex.org — it's in his own tasks); Serper → "LA Industrial Ltd" UK PPE supplier
  (DJ's is LA Industrial Services LLC, Louis Arnette's). Those facts set to `retracted`.
- **Next hill-climb step (biggest quality lever):** research with what the graph already knows —
  domains/URLs in linked tasks & docs, people who work there, location — before name-only
  search; and an org's first research with no context should land as suggestions. Then re-run
  this 12-entry set as the eval.
- 2026-11-17: DJ: chat web search → Serper too. `WEB_SEARCH_PROVIDER_ORDER.chat = ['serper','tavily']`
  (agent runs + table fill stay Tavily). Chat's web_navigate still uses Tavily Extract to render
  pages a plain fetch can't read. UNCOMMITTED; needs PRIVATE_SERPER_API_KEY on Railway
  agentic-chat-worker.

## Roadmap after cheap search (2026-11-17, proposed to DJ)

Search is now ~0.1¢, so the limit is **accuracy and choosing what to research**, not cost.

**A. Get it right (next)**

1. Context-first research: query with what the graph knows (domains/URLs in linked tasks & docs,
   people who work there, the org a person works at, location) before name-only search.
2. Same-name check: before saving, confirm the page matches known anchors (website, city,
   linked people). No anchors on a first research → results land as suggestions.
3. "Not this one" on a card: retracts everything from that research and remembers a negative
   hint ("not the Iowa one") for the next run. Every click is an eval label.
4. Eval set + replay: ~40 hand-checked entries (truth: website, role, company, location),
   score precision / filled gaps / wrong-entity rate / cost; cache search results + pages so
   reruns are free. Version table per change.

**B. Make it agentic (the "browser with Jev" loop)** 5. Research loop: Jev picks the next gap, the next query or the next link to follow (About /
Team / Contact pages on the entity's own site, reusing chat's web_navigate), stops when the
gaps are filled or the per-entry budget is out. 3–5 searches per entry still < 1¢. 6. Read pages in parallel; page cache by URL.

**C. Scale** 7. Shared public layer: verified public facts about orgs and public figures (own website or two
independent sources) promoted to shared; check shared before researching. Private people
never shared. (Fork for DJ.) 8. Choose what to research: rank by what matters to the user (recent tasks, meetings, people
they know), "Research my top 25" with an estimate; never automatic without opt-in. (Fork.) 9. Freshness: re-research stale entries (e.g. > 6 months) on request or in the ranked batch. 10. Guardrails: global daily spend cap, per-user fairness in the queue, Serper rate limits,
spend / hit-rate / wrong-entity dashboard in admin. 11. Review queue: "12 new details to check" with sources, Keep / Wrong in one place.

## DJ's direction (2026-11-17, after the roadmap)

- **Getting it right = Jev + internal search, cheap.** Before trusting anything new, look up what we
  already know (graph + tasks + docs), then Jev decides.
- **Circles.** Inner circle = people I know and interact with (contacts, tasks, meetings, "my
  friend Jev"). Public = public figures/orgs I want to know about. A casual mention stays inner
  circle. A public-sounding claim about an inner-circle name ("Jev is in leadership at Amazon")
  trips a threshold: "are we talking about Jeff Bezos?" Built in, so we don't deconflict
  everything all the time.
- **When two entities might be the same, ask:** "Is this person this one or that one?" (the
  existing "same person?" review, with the question phrased by Jev).
- **No passive research.** Research runs only when DJ asks. Step-by-step research is fine inside
  a requested run. Parallel page reading matters for bulk requests.
- **Chat is a source.** What we learn in agentic chat (what DJ says, what web search found) gets
  added to the graph at the chat's wrap-up step (DJ: "dream flow" = the existing chat checkpoint
  capture, tasker/95: `apps/worker/src/workers/chat/checkpoint/`), only the important entity facts.
- **Focus on the internal network.** Public graph grows opportunistically from niche public facts
  we already found; no separate crawling.
- "I just want the knowledge graph to be enriched when I tell it to be."

Build split (2026-11-17): agent 1 = circles + identity check + context-first research + "Not this
one" + eval set; agent 2 = chat wrap-up → knowledge capture.

## 2026-11-17 night: chat wrap-up → knowledge (agent 2) BUILT, UNCOMMITTED

What DJ sees: after a chat goes idle (or crosses the size/turn threshold), the existing receipt chip
in the chat also says **"2 details about Dana Whitfield and Harbor Lane Logistics"**, linking to the
entry (or `/knowledge`). In a chat with no project (global, Workspace) the chip reads "Saved 2
details about …". **Undo** on the chip takes back the knowledge too. Cards on `/knowledge` list the
chat under "In your work" (opens it via `/history?chat=…`), and each fact cites the chat (and the
web page, when search found it).

Captured: specific, lasting facts about named people/orgs from the user's words (role, employer,
how they know them → `knows` from self, location, website/profile, contact details the user gave,
notes) and what the chat's web search/browsing found (homepage, location, industry…). Skipped:
passing mentions, opinions/plans/temporary states, the assistant's own general knowledge, quotes
not literally in the cited message, names not in the chat, web facts whose page isn't one this
chat's tools returned, a person's phone/email/address/birthday/notes from anywhere but the user,
facts the user marked wrong before, first-name-only people with no single matching entry.

How:

- `apps/worker/src/workers/chat/checkpoint/knowledgeCapture.ts` — gate (one Jev choice: "any
  lasting facts about named people/orgs?", proceed at p(some) ≥ 0.3, fail-open) → one fast JSON
  extraction (same model/profile as the other checkpoint calls, `chat_checkpoint_knowledge`) →
  validation → identity seam → `KnowledgeStore.record` (`via: 'chat'`, private) in two steps
  (entries, then facts planned against what each entry already holds) → read-back for Undo.
- `knowledgePrompt.ts` (pure: prompts + `validateChatKnowledge`), `knowledgeIdentity.ts` (seam).
- Web page text is never stored (chat tool results keep URL + title only), so a web fact's quote is
  from the assistant message that reported it; the source keeps the page URL. Confidence 0.7 vs 0.9
  for the user's words; a web value never overwrites an existing one-value field (lands as a
  suggestion); the user's words do (Undo puts the old value and summary back).
- Runs last in the checkpoint (after thinking log / START HERE), for every session with new user
  words, including global and Workspace chats. **Sweep widened:** with the knowledge output on,
  every user's global chats are swept (project feeding still only for
  `CHAT_CHECKPOINT_GLOBAL_USER_IDS`). Prod volume: ~6 global sessions / 14 days.
- Receipt in `chat_capture_checkpoints.details.knowledge` (names + counts + ids; never values):
  added fact ids, statuses/summaries it changed, chat links, sources, entries it created. A retried
  checkpoint rebuilds the receipt from its sources (`meta.capture_key`) instead of paying again.
- Undo: `apps/web/src/lib/server/knowledge/chat-capture-undo.ts`, called from the existing
  `/api/chat/capture-checkpoints/[id]/undo` (now also handles knowledge-only checkpoints with no
  project). Retracts only facts this capture added, restores what it changed, deletes its
  links/sources, deletes entries it created when nothing else is recorded about them.
- Kill switches: `CHAT_CHECKPOINT_CAPTURE_ENABLED=false` (everything), `CHAT_CHECKPOINT_KNOWLEDGE_ENABLED=false`
  (knowledge only; also narrows the sweep back to allowlisted global users).
- No migration: `knowledge_record_links` already allows `chat_session`, `created_via` allows `chat`.

**Identity seam (for agent 1):** `resolveKnowledgeIdentity` in
`apps/worker/src/workers/chat/checkpoint/knowledgeIdentity.ts`. Input: candidates `{ref, kind,
name, evidence: exact quotes}`; output per ref: `default` (store matching), `use` + entityId (same
as an existing entry), `skip` + reason (ask later; nothing written). Default = store matching, plus
the store's own one-word-person rule (reuse the one private entry with that name, else skip).
Swap `checkIdentity` in on the last line. A "different despite the same name" answer needs a
store option to force a new entry (none yet).

Cost (from `llm_usage_logs`, no live calls): gate ≈ $0.0001 (Jev context-finder calls of similar
size average $0.00009); extraction ≈ $0.0003–0.0005 (DeepSeek V4 Flash; START HERE synthesis at
~3.1k tokens in averages $0.00028). So ≈ $0.0001 per checkpoint with nothing to save, ≈ $0.0005
with something. Current volume (~25 checkpoints/30 days + global chats) → well under $0.05/month.

Validation: worker `tests/chatKnowledgeCapture.test.ts` 13 tests (user-stated role/employer/knows;
web fact with URL; gate skips passing mentions; unquoted/invented facts dropped; contact details
private + user-only + absent from receipt; Undo retracts only this capture's facts, restores the
replaced headline + summary, deletes the created entry, keeps pre-existing ones; retry no second
model call; first-name rule; custom resolver used), plus existing checkpoint suites (55 total
green); worker typecheck + test types clean; web `capture-receipt.test.ts` 3 green; web check
0/0; eslint clean on changed files. No paid runs.

Not done: a real chat through the deployed worker (needs deploy; ~$0.0005 per checkpoint, needs
DJ's OK), browser check of the chip. Note: `chat-checkpoint-backfill.ts` now also captures
knowledge when re-run over old chats.

Decisions for DJ (veto-able):

1. Web-found facts from chat land **active** (confidence 0.7, source URL kept), not as suggestions.
2. Undo **retracts** (hidden, and a later chat restating the same fact won't bring it back) rather
   than deleting.
3. Every user's global chats are now swept for knowledge (cheap; gate stops most).

## 2026-11-17 night: part A "Get it right" (agent 1) BUILT, UNCOMMITTED

What DJ sees:

- **Research knows first.** Before searching, it gathers what your graph and work already say:
  the entry's own website (a domain in your tasks/docs that spells its name, or a homepage fact),
  people who work there, the org a person works at and that org's site, places, the words around
  its name in your tasks/docs, and anything you said it is NOT. Searches use them: an org with a
  known site reads `site:codyshootingcomplex.org` first; otherwise the name plus a person who
  works there or its town. Dry run on the 12 bake-off entries: Cody → `site:codyshootingcomplex.org`,
  LA Industrial → `site:laindustrialservices.com`, Brave Lizard → own site + "New Harmony, UT".
- **Same-name pages are dropped.** Each page is checked before extraction: on the entry's own
  site → same (free); a page or site you rejected → different (free); otherwise one cheap
  structured decision for all of the entry's pages at once (same / different / can't tell).
  Different pages never reach extraction; "can't tell" pages' findings land as **suggestions**
  (Keep / Wrong). With nothing known at all, everything found is a suggestion. The tray line says
  "…, 1 page about a different one skipped".
- **"Not this one"** on a card (under Find more: "5 details from the last research. Not this one" →
  "Remove all 5?"): retracts every detail that run added, hides entries only that run created
  (e.g. "Long Grove, Iowa"), and saves a private hint "not the Cody Shooting Complex in Long
  Grove, Iowa" + the pages it read. Next research never reads those pages, excludes the run's
  claimed website domain with `-site:`, and tells the checker and the extractor.
- **"Same one?" questions** show in the existing duplicates review with the question on top
  ("Is Jev, your friend, the same person as Jeff Bezos?"); "Same" keeps the entry you had.

Circles (stored on `knowledge_entities.circle`, `circle_source` = signals | model | user):

- inner by signals: your own entry, you `knows`/`owns` it, imported contact, you hold a private
  email/phone for it, works at something you own. public by signals: research found it and
  nothing in your work mentions it. Everything only _mentioned_ in your work is ambiguous → the
  decision model (one choice per entry, 20 per call). The user's answer always wins; an earlier
  model decision stands until a structured signal overrides it.
- DJ's graph today (dry backfill, free): 566 people/orgs → 57 inner (private contact details), 12
  public (found by research), **497 ambiguous** (≈ 25 decision calls ≈ $0.015 to classify).
- Research resolves the entry's circle lazily (signals; the model only if still ambiguous; cost
  charged to that entry's budget).

Identity check (shared, stable; for agent 2's seam and anything else):
`packages/shared-agent-ops/src/knowledge/identity.ts`

- `checkIdentity(entry, candidate, deps)` / `checkIdentityBatch(entry, candidates, deps)` →
  `{ verdict: 'same'|'different'|'ask', reason, reasonText, question?, confidence, decidedBy }`.
  `entry = { anchors: await gatherKnowledgeAnchors(store, db, detail, { circle }), relation?: 'your friend' }`.
  Candidates: `{ type: 'page', url, title?, text, site? }` or `{ type: 'claim', via, text?, predicate?, value?, name? }`.
  `deps = { decider: JevClient | null, userId?, signal?, timeoutMs? }` (structural `IdentityDecider`).
- Claims: personal details (phone, email, knows, note, birthday, address, alias, related_to) →
  same, no call. Entries in the public circle → same, no call. Otherwise the model judges match,
  and for inner-circle / known people also how public-figure-like the claim is: prominent or
  conflicting → `ask` with a question; casual → same. Model unavailable → claims pass (`decidedBy:
'fallback'`), pages fail closed (`ask` → suggestions).
- `recordIdentityQuestion(store, { entityId, kind, question, reason, otherEntityId? | candidate:
{ name, facts?, source? }, via })` files an `ask`: pairs two entries, or creates the other identity
  as its own entry (circle public, the claim's details as suggestions) and pairs them.
  `store.createEntry(...)` is the "force a new entry" option agent 2 asked for.
- Helpers: `resolveCircles(db, userId, ids, { decider })`, `gatherCircleSignals`, `circleFromSignals`,
  `redactContactDetails`, `domainMatchesName`.

Migration `supabase/migrations/20261118100000_knowledge_circles_identity.sql` (NOT applied):
circle columns (default unknown; the entities guard keeps `updated_at` when only circle columns
change, so classifying never reshuffles "recently updated"), `knowledge_merge_candidates.question`

- `origin` (name | identity), `knowledge_research_hints` (owner-only RLS: read/insert/delete).
  Rehearsed `--check supabase/tests/knowledge_graph.check.sql --refresh --role-probe`: **PASSED**
  (new assertions: bad circle/source refused, circle-only change keeps updated_at, real change
  bumps it, question/origin checks, hints owner-only, bob can't read or write alice's hints, signed-in
  user sets own circle). 2 DATA notes: the circle CHECKs validate 515 existing rows, all `unknown` by
  the column default, so safe. Code works before the migration (circle/hint/question reads fall back).
  Deploy order: migration, then web + worker.

Eval: `apps/worker/scripts/knowledge-eval/truth.json` — 45 of DJ's entries (12 bake-off + 4 own
businesses, 11 clients, 18 contacts, 1 colleague, 7 public figures, 4 public orgs), truth drafted
from his own tasks/docs with the quote for each field, **all `confirmed: false` — DJ to confirm**.
Two `not` entries (Cody → Long Grove, IA / iowadnr.gov; LA Industrial → UK PPE supplier).
Suspicious existing facts noted per entry (Cody `industry` sourced from the Iowa page; Tom Mann's
truncated phone from a RocketReach page about someone else; Rod Chamberlin "Chamberlin &
Associates"; past jobs stored as current for Shaan Puri / Krystal Ball).

- Runner `apps/worker/scripts/knowledge-eval/run.ts`: runs the real pipeline (no DB writes, no
  run reserved) and scores correct / wrong / unsure / missing per field, wrong-entity rate, gaps
  filled, suggestions right, cost, time. Searches, pages, decisions and model answers cached in
  `scripts/knowledge-eval/.cache/` (gitignored) by exact request: reruns are free; history in
  `.cache/history.jsonl`. Dry by default (shows planned searches + anchors per entry);
  `--bakeoff`, `--only`, `--with-not-hints`, `--label`, `--provider`, `--out`.
- Live (paid, needs DJ's OK): `cd apps/worker && KNOWLEDGE_EVAL_LIVE=1 pnpm exec tsx
scripts/knowledge-eval/run.ts --user-email <email> --live --label v1-anchors`. Estimate per
  entry ≈ 2 Serper searches $0.002 + 1 decision $0.0006 (Jev avg $0.00045, 621 calls) + 1
  extraction $0.0004 (DeepSeek V4 Flash avg $0.000387, 25 calls) ≈ **$0.003/entry → ≈ $0.14 for
  all 45, ≈ $0.04 for the 12 bake-off**. Reruns with unchanged queries/prompts: $0.
- Circles backfill: `apps/worker/scripts/knowledge-circles-backfill.ts` (dry default; `--write`
  free signal decisions after the migration; `--model` with `KNOWLEDGE_CIRCLES_LIVE=1` ≈ $0.015).

Code: shared `anchors.ts`, `circles.ts`, `identity.ts`, store `createEntry`, `addMergeCandidate`,
`listResearchHints`, `rejectResearchRun`, `listMergeCandidates` (+question/origin/keep_id); worker
`knowledgeResearch.ts` (pipeline shared by worker + eval), `knowledgeEnrichPlan.ts` (anchored
queries, prompt v3 with "What the user's own records say" + "Not this one", suggestion-only pages,
rejected pages never read), `knowledgeEnrichWorker.ts` (circle + anchors + Jev decider from
`PRIVATE_OPENROUTER_API_KEY`), `knowledgeEvalScore.ts`; web `POST
/api/knowledge/entities/[id]/not-this-one`, card action, duplicates question.

Tests: shared knowledge 63 (20 new: anchors helpers, circles, identity rules + model mapping +
fallbacks + question phrasing, store anchors/Not this one/identity pair/circles), worker knowledge
37 (10 new: anchored queries, page exclusion, Cody same-name drop, suggestion-only paths, scorer).
Worker typecheck + test types clean; web check 0/0; eslint: no errors. No paid or live calls.

Privacy: emails/phones blanked from every snippet before a model sees it; note links lose query
strings (they carried an account email and a street address in DJ's data) and BuildOS's own
links; contact facts, notes, `knows` never become anchors; email-derived domains only count as an
org's own site. Hints are private (RLS owner-only).

Decisions for DJ (veto-able):

1. **Names of people who work at an org go into searches** (`"LA Industrial" "Louis Arnette"`),
   per "people who work there". Only full names; never one-word names, contact details or notes.
2. **Unanchored research → suggestions only.** Applies to public figures too when nothing is known
   (first research of a famous name lands as "check these").
3. **Org email domains count as the org's own site** (info@acme.com → acme.com) when the domain
   spells the org's name; the address itself never leaves.

Not done: live eval (needs OK), migration apply, circles backfill `--write`, browser check of the
card action and the question in the duplicates review, wiring `checkIdentity` into agent 2's seam
(`knowledgeIdentity.ts`, left to that agent).

### Chat capture × identity check (wired 2026-11-17 night, UNCOMMITTED)

- What the chat says about an entry DJ already has (store match or the seam's `use`) goes through
  `checkIdentityBatch` (one call per entry; anchors from `gatherKnowledgeAnchors`, circle from
  `resolveCircles(..., { save: false })`; same Jev client as the gate). `same` → written. `ask` →
  not written; `recordIdentityQuestion` files "Is Jev Ramos, someone you know, the same person …?"
  in the duplicates review (the claim kept as a suggestion on the other identity, cited by the
  chat). `different` → `createEntry` and written there. Personal details never ask (identity.ts
  rule); model down → claims pass (fallback); anchors unavailable → claims unchecked, written.
- Web-found chat facts about an entry with no anchors → `suggested` (coordinator's call on DJ
  decision #1, pending DJ). An entry the user described in their own words in the same capture
  counts as anchored; a brand-new entry with only web facts gets suggestions.
- Undo also deletes the question's other entry (its suggestion and the pending pair go with it) and
  any entry created for a `different` verdict. Chip: "1 'same one?' question" next to the details.
- Code: `checkChatClaims` / `loadChatAnchors` in `knowledgeIdentity.ts`, wired in
  `knowledgeCapture.ts`; receipt gains `saved_facts`, `questions`, `identity`. shared-agent-ops
  unchanged.
- Cost: one identity call only for existing entries whose claims rules don't settle (≈ $0.0002–0.0005
  each, Jev); circle model call only for ambiguous entries (not saved, so it repeats per capture).
- Tests: 6 new (prominent inner-circle claim → question + no fact + Undo removes it; ordinary claim
  written; decider down → written; personal detail → no question, gate-only call; anchorless web
  fact suggested vs anchored active; `different` → new entry). Worker 61 green across checkpoint
  suites, typecheck + test types clean, web check 0/0, receipt test green.

## 2026-11-18: applied + sorted + first scored eval (DJ approved)

- Migration `20261118100000_knowledge_circles_identity` APPLIED (prod dry run with ROLLBACK, apply,
  ledger repaired).
- Circles for DJ: 69 by signals (free) + 497 by the model (25 calls, $0.0079) → 372 inner,
  113 public, 81 unknown. Oddities to expect: US Census Bureau / OpenAI API landed inner (work
  tools); an email address saved as an entry name.
- Eval v1-anchors on the 12 bake-off entries (Serper, nothing written): 5 correct, 0 wrong,
  precision 100%, wrong entity 0 (bake-off had 2), gaps filled 4, missing 5, $0.0282, 79 cache
  misses now cached. Most truth fields were already known, so the next version needs the full
  45 (truth.json still to confirm by DJ).
- Data fixes: Tom Mann phone + email (from a different person's page) retracted.
- `PRIVATE_SERPER_API_KEY` set on Railway daily-brief-worker + agentic-chat-worker with
  --skip-deploys (takes effect on the next deploy).
- Still open: Rod Chamberlin employer (Chamberlin & Associates vs Magnum Wealth), Shaan Puri /
  Krystal Ball past jobs stored as current — DJ to confirm in truth.json.
