<!-- docs/research/clay-lessons-for-buildos-2026-11-18.md -->

# What Clay teaches us about knowledge-graph enrichment

**Date:** 2026-11-18 · **For:** DJ · **Trackers:** tasker/160, tasker/164
**Status:** research only. No code changed, no paid calls. Clay facts are cited inline as [n] (see §6).
Anything that comes from Clay's community forum or a third party is marked _(community)_ or
_(3rd party)_.

---

## 1. TL;DR: the ideas worth taking, best first

1. **Pin down who it is before filling anything in.** Clay's whole system hangs on a few "corner
   piece" identifiers: a domain and social URL for companies, a full name and social URL for
   people [3]. Lookups from a bare name are where Clay pulls in the wrong company [17]. For
   BuildOS this means a first research step that only confirms the entry's own website or profile,
   then fills in details keyed to it. It turns our biggest quality problem (wrong entity with the
   same name) into a step we can measure.
2. **A waterfall per detail, cheapest source first, stop when the detail is found** [1][2]. Ours:
   the graph and your work (free) → the shared public org layer (free) → a search on the entry's
   own site (~0.1¢) → structured data on its homepage (free) → general search (~0.1¢). Today every
   entry runs a fixed two searches and never stops early (`knowledgeResearch.ts:120`).
3. **Keep answers and reuse them, with a "keep for" window per kind of detail** [5]. Clay saves
   every result keyed on the exact inputs (30 days by default, 7 to 90 allowed), reuses it on
   stable columns, and pays again only to verify. Our production search cache lives 5 minutes in
   memory (`webResearchPort.ts:29`). The eval runner already has the durable version.
4. **"Not found" is a real answer: store it and show it per detail** [6]. Clay's best prompts let
   the model fail explicitly, and Clay records empty results it paid for [5]. BuildOS should say
   "Email: not found on public pages (Nov 18)" on the card and in the tray, and not pay to ask
   again for 30 days unless you say so.
5. **Try a few first, then run the rest** [4][7][11]. Clay pushes "test 10 rows" everywhere and
   gives free test runs and a sandbox. At 0.3¢ an entry cost doesn't matter. What matters is
   catching a wrong-entity pattern before 75 entries absorb it: "Here are the first 3, keep
   going?"
6. **Misses are free to the user** [4]. "If an enrichment returns no result, you're not charged."
   We can do the same with the daily allowance: entries where nothing is found don't count against
   it. That costs us about 0.1–0.3¢ per miss and takes the sting out of trying.
7. **Write every research prompt as a contract**: context, named sources, a fixed answer shape,
   evidence and URL for each field, and the verdict last [6]. Ours already requires an exact
   quote per fact. Adding a per-field `not_found` reason and explicit "look here first" sources is
   a small prompt change (v4) that the eval can score.
8. **Version the research recipe and compare versions side by side** [12]. Claygent Builder
   versions every prompt edit and lets you compare models on saved test inputs. We have the pieces
   (prompt v3, `knowledge-eval/run.ts`, cached replays). We're missing the habit: every change gets
   a labeled row in a version table.

The rest of Clay (auto-run on new rows, job-change signals, workspace-pooled credits, hundreds of
paid data vendors) fits a sales-list business. It doesn't fit a private graph of the people in
your life (§5).

---

## 2. How Clay works

### 2.1 Waterfall enrichment

- **What it is.** Several data providers run in a fixed order for one data point. Each row only
  reaches the next provider if the one before it found nothing. You "stop at the first confident
  result" [2]. Clay claims 100+ email providers [2] and 150+ marketplace providers [4]. Its
  vendor-reported benchmark shows single providers at 40% and 63% coverage against about 80% for
  the waterfall [2].
- **Order.** Clay ships a preset order, "optimized for cost and coverage, … usually starting with
  the most cost-effective source" _(University lesson snippet)_ [3]. Users can reorder, add,
  delete, or toggle off steps, build a custom waterfall column, and save it as a template [1].
- **Free step first.** The work-email waterfall opens with a free "Infer Email" step that guesses
  the address pattern from name and domain before any paid lookup [2].
- **Validation.** Email results go through a validator (ZeroBounce by default). If a found email
  fails validation, the waterfall keeps going. Catch-all addresses count as valid unless you turn
  on "only mark safe to send" [3]. A confidence threshold decides what counts as a match: strict
  settings mean higher quality, a little less coverage, and more cost [2].
- **Output.** Each provider has its own (hideable) column, and you can choose to output which
  provider succeeded [1].
- **Inputs matter most.** For companies, the domain and social URL are the identifiers that
  "drive everything else" [3]. Clay's docs say LinkedIn URLs map straight to the intended profile,
  while a domain-to-company lookup can return a parent, a subsidiary, or a generic page [17].

### 2.2 Credits and cost

- **Two meters since 2026.** _Actions_ measure platform work (under 1¢ each). _Data credits_ pay
  for marketplace data (from 5¢ each, cheaper at volume). Free plan: 500 actions and 100 data
  credits a month. Launch is about $167/mo for 15K actions and 2.5K credits [4]. The pricing page
  contradicts itself on some prices and rollover terms [4].
- **Misses are free.** "If an enrichment returns no result, you're not charged Data Credits or
  Actions" [4]. In a waterfall you pay only "for the one that returns the match" [2]. Community
  threads report exceptions where some providers charge on a miss, and refunds on emails not found
  _(community)_ [15].
- **Bring your own keys** works on every plan. Each run counts as one action but uses no data
  credits. Clay's own keys run AI about 2× faster because of higher rate limits [4][14].
- **Reusing saved data (beta)** [5]. Saving is on by default for the whole workspace, across
  tables. Reuse is opt-in per enrichment or as an action default. A saved value matches only "the
  same action … with the same inputs." "Change an input and it's a new lookup," so normalizing
  inputs (trimmed, lowercased domains) raises hit rates. Values are kept for 7, 30 (default), 60,
  or 90 days, capped by some providers, and serving one doesn't restart its clock. Reuse costs no
  data credits but still one action. Empty results are recorded when the run was charged. Clay's
  guidance: reuse on tolerant columns, buy fresh for job changes, signals, and pre-outreach
  verification. Values from a user's connected account are stored separately per account.
- **AI pricing.** About 80% of models are fixed-price per task (Clay's Helium 1 credit, Argon 3
  for web research). Token-heavy models are billed at actual LLM cost with 0% markup. Clay holds
  back an estimate (the 75th percentile of past runs × rows), then refunds or charges the
  difference. If the balance runs out, unstarted rows don't run and finished rows keep their
  results [13]. The Navigator browser agent launched at 6 credits a run (Aug 2025) _(3rd party:
  may be stale)_ [16].
- **Team vs personal.** Credits are pooled per workspace. Enterprise adds user groups with credit
  budgets [4]. A forum answer says there are no per-user limits below that _(community)_ [20].

### 2.3 Claygent (AI research per column)

- **The prompt is a contract** [6]: "context, named sources, and a locked output schema," plus an
  explicit "Not found." Feed it the row's existing data, and "run enrichments before the agent, not
  after." Name the pages to check (careers, about, security pages). Return exactly the listed fields
  plus `evidence` (one quoting sentence) and `source_url`. Make the verdict the last thing it
  writes, after the reasoning. "A model with no permission to fail will fabricate to fill the
  field."
- **Failure modes Clay names** [6]: asking an agent something a database already answers,
  open-ended asks with no schema, no "Not found," running the full list before testing, skipping
  validation. To validate: sort by the answer, open 5–6 rows, check that each cited page supports
  the answer.
- **Claygent Builder** [12]. A conversational builder (Sculptor) drafts the prompt, variables,
  output format, and test cases. "You can test up to 10 inputs at a time for free." Test suites
  are saved. Every edit is versioned, can be compared, and can be rolled back. "In-flight runs
  finish on the version that started them." Outputs can be compared across models. A model `Auto`
  mode picks a model per task. There's no built-in scoring: quality is judged by eye.
- **Structured output is shaky in practice.** Forum threads report "Unable to parse the output
  schema" errors and schemas drifting at scale _(community)_ [18].

### 2.4 Table UX

- **Columns are steps.** Each enrichment column has run settings: **Only run if** (a formula, which
  AI can write for you), **Auto-run** (re-run when inputs change), and a delay of up to 10 minutes
  [7]. Auto-run has a table-level switch over per-column switches _(community)_ [19].
- **Run a slice.** "Run first 10 rows" and "choose number of rows to run" _(community)_ [11].
  **Sandbox mode** copies the top 10 rows (50 max) to test without spending production credits.
  Publishing copies the results back [11].
- **The classic accident.** A user tested 10 rows while table auto-run was on, and it burned about
  20K credits on the rest of the 30K rows _(community)_ [11]. Clay's official advice: turn auto-run
  off while building, test about 10 rows, qualify rows before paying to enrich them, and look up
  existing data before buying it again [8].
- **Self-triggering loops.** Clay documents the risk and suggests "only run if the processed field
  is empty" as the guard [7].
- **Making it simple.** A free template library (copy, add your data, run) [21]. Sculptor builds
  tables and workflows from plain language and has a free "Analyst mode" for asking questions about
  a table [22]. Preset waterfalls mean most users never configure providers.

### 2.5 Freshness, dedupe, identity

- **Freshness is "pay again on purpose."** Saved values expire on the keep-for window. Clay
  advises fresh lookups for anything volatile [5]. **Signals** watch for changes: a job-change
  monitor needs the contact's LinkedIn URL and costs 1 action + 0.2 data credits per check, on a
  cadence you set. News and fundraising monitors need a company domain [9][10].
- **Dedupe is basic.** It works on one column, matches strings exactly (case and whitespace
  count), with optional auto-dedupe on new rows. No fuzzy matching is documented _(community; staff
  answers)_ [19]. Staff advice: import, dedupe, then enrich, to save credits.
- **Wrong-entity matches are a known weak spot.** Clay's own docs say a domain lookup can return a
  parent or subsidiary [17]. Forum users report name-only lookups attaching the wrong company or
  LinkedIn profile, sometimes for half a list _(community)_ [17]. A vendor write-up makes the key
  point: the wrong record comes back looking accurate, and nothing flags it _(3rd party)_ [17].
  Clay's fixes are input-side: give a second identifier, prefer a LinkedIn URL or domain over a
  name, normalize company names.

### 2.6 Ownership, sharing, privacy

- **Workspace = shared.** Roles are Admin / Editor / Viewer (Viewer is Enterprise-only). Edit
  access is per workbook. A doc snippet says table-level view restrictions aren't supported, so
  workspace members see all tables _(snippet; not opened)_ [20]. Saved enrichment values stay
  inside the workspace [5].
- **GDPR.** Under the DPA the customer is the **controller** and Clay is the **processor** for
  enrichment results. For Clay's own "Proprietary Data" (marketplace data Clay supplies directly),
  both sides are **independent controllers**, each answering its own data-subject requests.
  Retention is "as long as necessary," with no fixed periods [23]. Clay's help center says it
  relies on legitimate interests, backed by a DPIA. That's Clay's own claim, not a regulator
  finding _(3rd party summary)_ [24].

### 2.7 Other distinctive bits

- **Clay's own data is just another provider.** Proprietary data sits in the marketplace next to
  vendors [23]. In effect, a cross-customer cache sold as one more step in the waterfall.
- **Signals plus 130+ sources** for intent and change triggers (daily job-change scans, hourly news)
  [10]. **Templates**, **Workflows** (visual), CRM sync, and HTTP API on higher tiers [4][21].
- **The trick that makes it feel simple:** one mental model (a column is a question, a waterfall
  answers it, cells show found / not found / error), presets for everything, and a cheap "try it
  on a few" path.

---

## 3. Mapping Clay to BuildOS

Constraints we're working within: solo founder; about 130 users with 1 real graph (DJ's: 578
entries, ~38% of facts are contact details); graphs are private per user; a person's contact
details are never shared and are researched only when you explicitly ask; $0.50/user/day research
cap ($5 for admins); Serper at ~0.1¢ a search with Tavily as fallback; one decision call plus one
cheap extraction call per entry (~0.3¢ an entry all in, tasker/164:600-604).

| Clay mechanism                                         | BuildOS today                                                                                                                                                                                                                                | Adopt / adapt / skip, and why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corner-piece identifiers before enrichment**         | Anchors gathered before search (`anchors.ts:307 gatherKnowledgeAnchors`); `site:` query when a domain is known (`knowledgeEnrichPlan.ts:121-180`); per-page identity check (`identity.ts:374 checkIdentityBatch`); unanchored → suggestions  | **Adopt, highest value.** Make "confirm the identifier" an explicit first step: org → own domain, person → profile URL or employer's domain. Save it as a deterministic key, then key every later step off it. If research finds a candidate with no anchor, run one step and ask ("Is this the Cody Shooting Complex at codyshootingcomplex.org?") before filling details. Clay shows bare-name lookups are where things go wrong. We see it too (Cody IA, LA Industrial UK).                                                                                                                             |
| **Per-field waterfall, cheapest first, stop on found** | Fixed queries per kind, at most 2; the search loop only stops when the budget runs out (`knowledgeResearch.ts:120`, `knowledgeEnrichPlan.ts:179`); ≤3 pages (`MAX_PAGES_PER_TARGET`)                                                         | **Adapt.** A small per-kind source plan rather than a provider marketplace: (0) graph, tasks and docs → (1) shared public org layer → (2) `site:own-domain` + homepage, About and Contact pages → (3) homepage structured data (schema.org Organization: address, sameAs links, logo; free to parse) → (4) general search → (5) a field-specific search (contact page, alumni). Check after each step whether the requested details are filled, and stop if so. Skip vendor data APIs (PDL, Apollo and the like): per-record pricing, people-data broker posture, and a privacy story we'd have to defend. |
| **Free first step (Infer Email)**                      | None. Contact details are researched only on an explicit "Phone & email" request                                                                                                                                                             | **Skip for people.** Guessing a person's email pattern is exactly what we don't want to be. **Adopt for orgs:** reading the homepage we already have costs nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Validation step (ZeroBounce)**                       | Quote must appear literally on the page (≥12 characters, `normalize.ts:32`); `domainMatchesName` (`anchors.ts:198`); bad pages are retracted                                                                                                 | **Adapt cheaply.** Free checks before saving: the homepage URL resolves (HEAD request), the profile URL is the canonical form, and for an org email the domain has mail records. Skip paid email verification.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Charge only when found**                             | Every search counts against the daily cap, whether or not it found anything                                                                                                                                                                  | **Adopt as UX, not billing.** Misses don't count toward your daily allowance. Show the allowance as lookups ("about 140 left today"), not dollars. We absorb about 0.1–0.3¢ per miss. Fork for DJ (§4).                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Bring your own keys**                                | None                                                                                                                                                                                                                                         | **Skip.** Our users don't own Serper keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Saved-data reuse, keyed on inputs, keep-for window** | Production: 5-minute in-memory search cache (`webResearchPort.ts:29`); the knowledge worker passes no durable store (`knowledgeEnrichWorker.ts:185`). The eval has a durable cache keyed by exact request (`scripts/knowledge-eval/.cache/`) | **Adopt.** A durable cache for search results and page text keyed on the normalized query or URL, scoped per user (queries carry names from your private graph). Scope it globally only for `site:<org domain>` queries and public org pages, which the decided shared-org cache already covers. Keep-for windows per detail type: description, founded, industry, homepage 180 days; location 90; headline and works_at 30 (volatile, Clay's own advice); never reuse for contact details.                                                                                                                |
| **Clay's own data as provider #0**                     | Shared public layer designed (`knowledge-shared-projects-2026-11-18.md` §1; tasker/164 C.7); DJ decided: verified public org facts are reused before a paid search, only for orgs the user works with                                        | **Adopt, already decided.** Make it literally step 1 of the waterfall, with the same keep-for windows. People are never in it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Recording "not found"**                              | Model omits fields it didn't find; tray shows "N new details"                                                                                                                                                                                | **Adopt.** Store a per-field outcome for each target: found / not found / skipped (with a reason), plus a not-found marker with a date. The card says "Email: not found on public pages · Nov 18." Re-asking within 30 days asks "look again?" and stays free if you say no. Also feeds the eval (recall vs "truly not public").                                                                                                                                                                                                                                                                           |
| **Claygent contract prompt**                           | Prompt v3 (`knowledgeEnrichPlan.ts:182`): per-page `about_entity` verdict, exact quote + page per fact, "never guess," known facts, "Not this one"                                                                                           | **Adapt the gaps.** Add an explicit `not_found: [{predicate, reason}]` list; for orgs, "check these pages first" (own site, About, Contact); keep the verdict per page first (we already decide `about_entity` before the facts). Score v4 vs v3 on the 45-entry eval before switching.                                                                                                                                                                                                                                                                                                                    |
| **Test on 10 rows / sandbox / free tests**             | Bulk enrich up to 75 per click (`enrichment.ts:33`); eval replay is free (cache)                                                                                                                                                             | **Adopt.** For batches over about 10: run the first 3, show their results in the tray with Keep / Wrong / Not this one, then "Continue with 72" (one click). Not about money: one wrong-entity pattern caught early protects the other 72.                                                                                                                                                                                                                                                                                                                                                                 |
| **Only run if / skip filled cells**                    | Known facts go into the prompt ("don't repeat"); re-research needs a focus; one-word names skipped by some paths                                                                                                                             | **Adopt as the default stop rule.** Before any search, drop requested details the entry already has (unless this is a re-research), and skip entries with no searchable handle (one-word person name and no anchor), with the skip reason in the tray. Already on the roadmap (tasker/164 C.8); Clay confirms it's the main money saver [8].                                                                                                                                                                                                                                                               |
| **Auto-run on new rows, signals**                      | None (DJ: "No passive research")                                                                                                                                                                                                             | **Skip.** Revisit only as an explicit "keep an eye on my clients" opt-in, much later.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Hold the estimate, then settle**                     | Already done: the reservation function holds the max fallback price, then settles (`webResearchPort.ts`, `knowledge_reserve_enrichment_run`)                                                                                                 | **Keep.** Same pattern as Clay's variable pricing [13].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Builder: versions, test suites, compare models**     | `KNOWLEDGE_ENRICH_PROMPT_VERSION = 3`; `knowledge-eval/run.ts` with `--label`, a cache, `history.jsonl`; truth.json unconfirmed                                                                                                              | **Adopt the habit.** Store the recipe version on each run or source. Every change gets a labeled eval row (precision, wrong-entity rate, details filled, ¢/entry). DJ confirming truth.json is the blocker. We beat Clay here: it has no scoring [12].                                                                                                                                                                                                                                                                                                                                                     |
| **Plain language → structured request (Sculptor)**     | Free-text "What should we look for?" goes to the model as an instruction; it's never parsed                                                                                                                                                  | **Adapt.** One cheap structured call maps the free text to the focus chips and predicates, then shows them back for a confirm: "Looking for: Education, Website." A structured channel, so the no-regex rule holds.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Exact-string dedupe**                                | Deterministic keys + merge candidates + identity questions (`identity.ts`)                                                                                                                                                                   | **Skip.** We're already ahead. Pending: normalize "The Cadre" vs "Cadre" (tasker/160:83).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Per-cell status + which provider answered**          | Each fact has its source URL; the tray has a per-target phase                                                                                                                                                                                | **Adopt lightly.** On the card, each detail says where it came from in plain words: "from their own site," "from a directory," "you said." It builds trust and makes "Wrong" clicks easy to interpret.                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Workspace-pooled credits, shared tables**            | Per-user private graphs; per-user caps                                                                                                                                                                                                       | **Skip.** Opposite privacy model (§5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Templates**                                          | Focus chips (`ENRICH_FOCUS_OPTIONS`)                                                                                                                                                                                                         | **Later.** Maybe 2–3 "recipes" by circle (a client company, a public figure you follow) once there's more than one user researching.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## 4. Recommended next moves

### Lean (≤ 1 week)

- **Stop when the details are found, skip what's already filled.** Check the requested details
  after each search and stop when they're all filled; drop details the entry already has; skip
  entries with nothing to search. Effect: about 25–40% fewer searches on orgs with a known site
  (one `site:` search often covers it). Cost per entry goes from ~0.3¢ to ~0.2¢. Free to test with
  the eval replay.
- **Durable search and page cache, per user, 30 days**, reusing the eval cache's key scheme and
  `LayeredNativeSearchCache` with a durable store. Effect: re-researches and repeated bulk runs
  cost $0 for unchanged queries. Privacy: per-user keys, no contact-field queries cached.
- **Per-detail outcome + "not found" on the card and in the tray**, including a 30-day
  "already looked" note. Effect: no paying twice for "no public email"; the eval can separate
  "missed" from "not public."
- **"Try 3 first" for batches over 10.** The tray pauses after 3 with Keep / Wrong / Continue.
- **Prompt v4** (explicit `not_found`, own-site pages first for orgs). Run it against the 12-entry
  bake-off replay, then the 45-entry set once DJ confirms truth.json. Live eval ≈ $0.14 for all
  45 (tasker/164:603). Needs DJ's OK.
- **Fork for DJ:** misses don't count against the daily allowance, and the allowance shows as
  lookups, not dollars. Worst case for us is about $0.50/user/day of misses, which no user comes
  close to today.

### Ambitious (2–4 weeks)

- **Identity first.** Step 1 only confirms the entry's own domain or profile URL (search, rule
  check, identity call; ask you when unsure) and saves it as a key. Step 2 fills details keyed off
  it. Effect: we expect the wrong-entity rate to fall toward 0 on unanchored entries without
  making everything a suggestion (today's tradeoff). Cost: about +0.1¢ per unanchored entry.
- **A per-kind source waterfall** as data, not code branches: graph → shared org layer → own site
  (+ About/Contact pages via `web_navigate`) → homepage schema.org JSON-LD → general search →
  field-specific search. Each step declares which details it can fill and what it costs. The
  runner stops early. Jev chooses only when the plan is ambiguous. Effect: higher hit rate on orgs
  (structured addresses and links for free), cost flat or lower.
- **The shared public org layer as step 1** with keep-for windows per detail (decided). Effect: the
  second user who works with the same org pays $0 for its website, industry, and location.
- **Recipe versioning + eval table.** Each run stores its recipe version; every change lands as a
  row (precision, wrong-entity, filled, ¢/entry, seconds). Optional: a "compare two recipes on
  these 10" admin view, our version of Claygent Builder's compare.
- **Plain-language request → chips.** Free text becomes predicates through one structured call,
  shown back before the run.

---

## 5. Where Clay is the wrong model for BuildOS

- **Clay is built to find people to sell to; BuildOS is for remembering the people you already
  work with.** Clay's measure of success is coverage of emails and phones on lists of strangers.
  Ours is "the right details about the people and orgs already in your work, without you typing
  them." Copying Clay's vocabulary (credits, waterfalls, providers, signals) in the product would
  pull BuildOS toward "AI prospecting tool," the opposite of leading with relief. Keep the
  mechanics and drop the words: users should see "looked it up," "found on their site," "not
  public."
- **Clay is a people-data broker; BuildOS shouldn't be.** Clay's defaults (find any email, infer
  addresses, catch-alls count as valid, pooled workspace visibility) and its legitimate-interest
  basis [23][24] put the GDPR burden on the customer. BuildOS's rules (person facts never shared,
  contact details only on explicit request and kept private, address and birthday never
  researched, contact details never sent to search or model) are stricter and should stay that
  way. No vendor contact-data APIs, no email-pattern guessing for people.
- **Clay runs automatically; DJ doesn't want research running in the background.** Auto-run,
  signals, and monitors are central to Clay. In BuildOS, research runs when you ask.
- **Clay's dedupe and identity handling are weak**, and its users pay for it in wrong-company
  rows. Our identity check, circles, and "Not this one" are already ahead. Don't simplify toward
  Clay here.
- **Clay's per-workspace data pooling** is the opposite of per-user private graphs. Our sharing
  model (project view, ask-to-see, public org layer only) is deliberately narrower.
- **Scale assumptions don't transfer.** Clay's economics rest on millions of rows and marketplace
  margin. Ours: about one active graph, research at fractions of a cent. Our constraint is accuracy
  and trust, not unit cost.

---

## 6. Sources

Clay first-party unless marked.

1. Clay University, "Waterfalls" (building a data waterfall) — https://university.clay.com/docs/building-a-data-waterfall
2. Clay guide, "Waterfall enrichment" (stop at first confident result, charge only on match, Infer Email, 100+ email providers, vendor benchmark) — https://www.clay.com/guides/waterfall-enrichment
3. Clay University lessons: "Enrich people using waterfalls" (corner pieces, 6 default email providers, ZeroBounce, catch-all handling) — https://university.clay.com/lessons/enrich-people-waterfalls-automated-outbound ; company waterfalls (search snippet, cost-optimized order) — https://university.clay.com/fr/lessons/enrich-companies-waterfalls-clay-101
4. Clay pricing (actions vs data credits, plans, BYOK, "no result → not charged", rollover) — https://www.clay.com/pricing
5. Clay University, "Reusing saved enrichment data" (beta; keep-for windows, input-keyed reuse, workspace scope) — https://university.clay.com/docs/reusing-saved-enrichment-data
6. Clay guide, "How to use Claygent for prospect research" (prompt as contract, evidence + source_url, verdict last, Not found) — https://www.clay.com/guides/how-to-use-claygent-for-prospect-research
7. Clay University, "Enrichments" run settings (Only run if, Auto-run, delay) — https://university.clay.com/docs/enrichments ; "Infinite loops" (snippet) — https://university.clay.com/fr/docs/infinite-loops
8. Clay University, "Ways to save Clay credits" — https://university.clay.com/docs/clay-credit-conservation
9. Clay University, "Job change signal overview" (LinkedIn URL required, 1 action + 0.2 credits/check) — https://university.clay.com/docs/job-change-signal-overview
10. Clay University, "Signals" (snippet) — https://university.clay.com/docs/signals ; Clay signals page — https://www.clay.com/signals
11. Clay University, "Sandbox mode" (top 10 rows, 50 max) — https://university.clay.com/docs/sandbox-mode ; _(community)_ run first 10 rows and the 20K-credit auto-run accident — https://community.clay.com/x/support/d7w2r5cow3iq/run-query-for-first-10-rows-or-entire-table , https://community.clay.com/x/support/4uxjwrrb4bh9/testing-clay-table-enrichment-how-to-run-first-10
12. Clay University, "Claygent Builder" (free 10-input tests, versions, model compare, Auto) — https://university.clay.com/docs/claygent-builder
13. Clay University, "AI pricing" (fixed vs variable, 75th-percentile hold, 0% markup) — https://university.clay.com/fr/docs/ai-pricing
14. Clay FAQ, "Do I get charged credits if I bring my own API key" — https://clay.com/faq/do-i-get-charged-credits-if-i-bring-my-own-api-key
15. _(community)_ charges on misses / refunds — https://community.clay.com/x/support/ndic527a0r85/charges-for-credits-even-if-no-person-found , https://community.clay.com/x/support/uae0pga1xtoa/waterfall-charging-credits-for-using-personal-api
16. Clay blog, "Introducing Claygent Navigator" — https://clay.com/blog/introducing-claygent-navigator ; _(3rd party)_ Cleanlist Claygent review, Oct 2026 — https://www.cleanlist.ai/blog/2026-10-05-claygent-review
17. Wrong-entity matches: Clay University "Finding companies and people" (snippet; page 404 when fetched) — https://university.clay.com/fr/docs/finding-companies-and-people-in-clay ; _(community)_ https://community.clay.com/x/support/o13rqlm5h39p/avoiding-incorrect-company-enrichment-in-clay , https://community.clay.com/x/feedback/g9syt7lixu2i/improving-google-domain-search-accuracy-for-compan ; _(3rd party)_ https://crustdata.com/blog/company-entity-resolution-messy-inputs
18. _(community)_ Claygent output schema errors — https://community.clay.com/x/support/cxrh0ngkbo0r/resolving-unable-to-parse-output-schema-error-in-c , https://community.clay.com/x/support/il2vxpljbqwv/claygent-output-structure-issues-with-large-data-s
19. _(community)_ dedupe single-column / exact match; auto-update vs conditional — https://community.clay.com/x/support/lho00fq5ya2v/de-duplicating-tables-multi-column-and-sort-criter , https://community.clay.com/x/support/cpfztb0pxz3z/understanding-auto-dedup-functionality-and-column , https://community.clay.com/x/support/cleuf2j6zadq/auto-update-vs-conditional-logic-in-tables-underst
20. Clay University, "Roles and permissions" / "Workspace administration" (snippets) — https://university.clay.com/docs/roles-and-permissions , https://university.clay.com/docs/workspace-administration-documentation ; _(community)_ no per-user credit limits — https://community.clay.com/x/support/99c0rhee6t92/can-i-add-users-and-restrict-the-usage-of-credits
21. Clay blog, templates — https://clay.com/blog/the-power-of-clay-templates-automate-customize-replicate-any-workflow ; Clay University templates overview — https://university.clay.com/docs/templates-and-claybooks-overview
22. Clay University, "Sculptor" (snippet) — https://university.clay.com/docs/sculptor ; Clay blog, Sculptor analyst mode — https://clay.com/blog/sculptor-analyst-mode
23. Clay Data Processing Agreement (controller/processor roles, Proprietary Data, retention) — https://www.clay.com/dpa
24. _(3rd party mirror of Clay help article)_ "Clay GDPR Policy" (legitimate interest, DPIA) — https://library.me.sh/hc/en-us/articles/12383369380635-Clay-GDPR-Policy ; Clay glossary, GDPR — https://www.clay.com/glossary/gdpr-compliance

**Caveats:** several Clay University pages were read through search snippets rather than full
fetches (marked "snippet"). Clay's pricing page contradicts itself on some prices and rollover
terms. Coverage numbers are Clay's own benchmark. Nothing here is legal advice.
