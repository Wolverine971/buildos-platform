<!-- tasker/166-find-connections.md -->

# 166 — Find connections fluidly (the payoff)

**Status:** Built and live in the database; site code not deployed; LinkedIn contacts not loaded yet (2026-11-21) · **Opened:** 2026-11-17 · **Parent:** 160
**DJ (2026-11-17):** "I do want to be able to find information quickly and be able to find
interesting connections (like different people working at similar companies or being in similar
locations) … search through my LinkedIn contacts to find what people are doing."

This tracker is the test for everything else: an ingest or research step is worth it only if it
makes these answers better.

## The questions it must answer (eval set; grow it from DJ's real asks)

1. Who do I know at <company>? Who used to work there?
2. Who do I know in <city/area> (e.g. Baltimore / DC)?
3. Which of my contacts work at similar companies (same industry / same kind of org)?
4. Who do I know that knows someone at <org>? (two hops via shared orgs/projects/tasks)
5. What is <person> doing now? (title, company, latest public info, with source)
6. Which people show up across my tasks, docs and contacts together?
7. Find that person from my LinkedIn who does <role> in <industry>.

## Pieces

- **Data it needs:** company + title (161 LinkedIn import), location (contact cards, LinkedIn
  doesn't export it → research via 164 on request), industry for orgs (research, public layer).
- **Chat:** `query_knowledge` / `search_knowledge` handle these as structured filters
  (org, predicate, location, kind), not regex on the question. Add what's missing (e.g.
  "same org as", location filter, two-hop via shared org).
- **Card:** "Also at <org>: N people you know", "Near <city>: N people" chips on a person card.
- **List:** filter by company / location / title words on `/knowledge`.
- Free to answer (SQL over the graph); paid only when filling gaps through 164.

## Done when

- DJ asks the 7 questions in chat on his real data after the LinkedIn import; each answer is
  right or clearly says what's missing ("12 of your contacts have no location yet — research them?").

## November 21 build

DJ picked all four surfaces (chat, a Connections view, chips on a person card, list filters) and
"free, ask first" for gaps: answers use what is recorded and say what is missing; research is
offered, never started.

**One read behind every surface.** `knowledge_connections(filters, facets, …)` (migration
`20261122020000`, applied and recorded) returns the people who pass the filters, the groups they
fall into (company, place, region, industry, title), how much of the pool has the data a filter
needs (`coverage`), and the employers with the most people still missing a place or an industry
(`gaps`). All filters are structured values; nothing reads the question. Measured 107–290 ms per
call from this laptop against production.

- Company: whole-word match, or the same name once "The" and punctuation fold ("Cadre" = "The
  Cadre"). Groups and "related to" fold the same way.
- Place: comma parts with US state codes expanded ("Annapolis, MD" = "Annapolis, Maryland,
  United States"); a term matches when its parts are contained ("Maryland", "MD", "Baltimore, MD").
  A person's place is their own, their street address's town and state, or their employer's
  (`place_of` picks one).
- Title and industry: word-start match ("engineer" finds "Engineering Manager").
- `employment` current / former / any; `in_records` (named in tasks, docs, projects); `via`
  (linkedin); `related_to` a person (shared employer or place); `bridge_to` a company (worked
  there, shares another employer with someone there, or named in the same task or doc).

**Chat and MCP.** `query_knowledge` gained `where {company, employment, title, industry, place,
place_of, in_records, via, related_to, bridge_to}` and `group_by`. No new tool or permission. The
answer carries plain notes ("A location is known for 14 of 767 people…") and
`research_candidates`. A connected AI tool without the contacts permission gets no email, phone
or address-derived places. Tool surface grew 1,408 characters (budgets re-baselined with notes).

**Page.** `/knowledge` has a Connections tab: four lists (Companies, Places, Industries, Titles)
with counts, press a group or type a word to narrow, people listed underneath, each list's foot
says what is missing with "Research the 10 biggest" (opens the usual paid dialog; nothing is spent
from the view). Filters stay out of the URL.

**Card.** A person's card shows "Also at Cadre · 2" and "Near Annapolis, Maryland · 9"; pressing
one lists those people in place.

**Eval set.** `apps/worker/scripts/knowledge-eval/connections-questions.json` holds the 7
questions plus DJ's asks (Maryland tech companies, where the engineers work, top companies, by
state) as the structured calls a model should make. Run free:
`cd apps/worker && pnpm exec tsx scripts/knowledge-connections-eval.ts --user-email <email>`.

### Verification

Working tree on `a82a1c6f1`; SHA-256 of the 24 touched paths
`8e9552662ce979c6c542905487c22d18c129032fa81f8bcc968b24b3dd38194e`.

- `pnpm db:rehearse` (the two 161 migrations, then this one) `--role-probe --check
supabase/tests/knowledge_connections.check.sql`: passed with the standing checks. The check
  runs 21 filter cases, related-to, bridges, groups, coverage, gaps, company twins, contact
  values only on request, row security as a signed-in user, and another account seeing nothing.
  Three broken variants (employment ignored, another owner's people visible, place match always
  true) each failed it.
- `shared-agent-ops` 66 tests (reader, gap sentences, the seven questions as gateway calls,
  contact hiding, bad arguments); `agentic-chat-runtime` catalog 52; web 33 (endpoint, card
  helpers, size budgets); worker surface budget 10. Web `check` 0 errors; eslint clean on the
  touched web files; Svelte autofixer clean on both new components.
- Browser, local dev signed in as DJ against production data: Connections tab loads, a place
  group narrows the lists and people, "Also at Cadre · 2" lists both people, no console errors.
- Eval on DJ's graph as it is today (5 contacts, 114 people in his world): all 12 calls return;
  each answers or says what is missing.

### Not done / open

- **LinkedIn contacts are not in production yet** (0 imported; DJ uploads the export on
  `/knowledge`). Re-run the eval after; "done when" needs it.
- **Deploy** web and worker (chat runs on the worker). Until then the live site has no
  Connections tab and chat has no people filters.
- A live chat turn asking the 7 questions is a paid check and was not run.
- Phone width of the Connections tab was not checked in a browser.
- Location and industry stay thin until research runs: today 9 of 114 people can be placed and 6
  of 60 employers have an industry. After the import expect ~750 of 767 unplaced.
- Company entries that differ by a legal suffix ("LA Industrial Services" / "… LLC") or a longer
  name ("Chesapeake Tax" / "… & Financial Services") still group apart; that is duplicate cleanup
  (161's fold, merge review), not a matching rule added here.
- The catalog's predicate list was missing `connected_on` (added by 161 to the shared
  vocabulary); its pin test was red on main. Added here.
