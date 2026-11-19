<!-- tasker/166-find-connections.md -->

# 166 — Find connections fluidly (the payoff)

**Status:** OPEN · **Opened:** 2026-11-17 · **Parent:** 160
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
