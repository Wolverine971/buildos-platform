<!-- docs/marketing/strategy/linkedin-network-crm-spec-2026-07-04.md -->

# LinkedIn Network CRM — Spec & Plan

**Date:** 2026-07-04
**Status:** QUEUED — not started. DJ will pick this up later.
**Owner:** DJ
**Lives:** Spec here; the actual tool/data lives OUTSIDE this repo (see Storage Decision).

## Goal

A searchable local database of DJ's LinkedIn network that Claude can query conversationally to:

1. Answer "who do I know that…" questions (by location, skill, company, role).
2. Generate introduction ideas: "if I intro these 2–3 people, they could do X together."
3. Support BuildOS outreach lanes (creators, testimonials, MD ecosystem) with real network data.

## Non-Goals

- No bulk scraping or automation that risks the LinkedIn account (it's a core BuildOS marketing channel — losing it costs more than this project is worth).
- No age/birthday fields — LinkedIn doesn't expose them; nobody lists them. Closest proxy: education grad years.
- No integration into BuildOS product or prod Supabase. Third-party PII does not belong in the product database.

## Research Summary (2026-07-04)

- **Official export** (Settings → Data Privacy → "Get a copy of your data" → Connections) gives: first/last name, email (only ~30–50% share it), company, position, connected-on date. No location, headline, profile URL, or experience history. Zero risk, ToS-compliant.
- **LinkedIn enforcement is aggressive in 2026**: browser fingerprinting, rate heuristics, escalating penalties (feature restriction → forced ID verification → permanent ban + IP blacklist). Practical ceiling cited: ~150 profile-view actions/day. Cloud scrapers that use your session cookie (PhantomBuster-style) are the highest-risk category — never use them.
- **Dex** (getdex.com, $12–24/mo) is the closest existing product: syncs LinkedIn connections, pulls profile details, tracks job changes, browser extension. Clay rebranded to **Mesh** (me.sh), enrichment-heavy but $149+/mo. **folk** ($19–39/mo) is more team-CRM.

## Plan (4 phases)

### Phase 1 — Official export (10 min, do first)

1. LinkedIn → Settings → Data Privacy → Get a copy of your data → check **Connections** (or full archive for richer data: messages, invitations, etc.).
2. Export arrives by email in ~10 min. Save CSV to the project dir (Phase 3).
3. This also gives the real connection count, which sizes Phase 4.

### Phase 2 — Dex trial (1 month, parallel with Phase 3)

1. Sign up for Dex, install browser extension, let it sync connections.
2. Evaluate: does its enrichment (location, job history, job-change alerts) cover what we need?
3. **Decision gate:** if Dex data is good enough → export Dex's data into the local DB and SKIP Phase 4 (manual enrichment) entirely. Keep Dex as the maintained sync layer.

### Phase 3 — Local database (~1 session to build)

- Location: standalone dir, e.g. `~/network-crm/` (NOT in buildos-platform).
- SQLite, single file. Proposed schema:

```sql
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  first_name TEXT, last_name TEXT,
  email TEXT,                -- from export, when shared
  company TEXT, position TEXT,
  connected_on TEXT,         -- from export
  location TEXT,             -- enriched
  headline TEXT,             -- enriched
  profile_url TEXT,          -- enriched
  experience_summary TEXT,   -- enriched, free text
  education TEXT,            -- enriched (grad year = age proxy)
  tags TEXT,                 -- comma list: creator, founder, MD-local, AI, investor…
  notes TEXT,                -- DJ context: how we met, favors owed, intro history
  enriched_at TEXT,
  source TEXT                -- 'export' | 'dex' | 'manual'
);
CREATE TABLE intros (
  id INTEGER PRIMARY KEY,
  contact_ids TEXT,          -- who was introduced
  idea TEXT, status TEXT,    -- idea | proposed | made | landed
  created_at TEXT
);
```

- Import script: CSV → contacts (source='export').
- No app/UI needed. Claude queries SQLite directly in conversation. FTS5 optional if the table grows past a few thousand rows; plain LIKE is fine below that.

### Phase 4 — Slow-drip enrichment (only if Dex disappoints)

- Claude-in-Chrome in DJ's own logged-in browser, human pace: **30–50 profiles/day max**, during hours DJ normally browses, never headless, never third-party session tools.
- Prioritize: enrich the ~100–200 highest-value contacts first (intro candidates, creators, MD ecosystem, AI people); skip the long tail.
- Record per profile: location, headline, experience summary, education, profile URL → update row, stamp `enriched_at`.
- At ~1,000 connections this is a few weeks of background trickle. That's fine.

### Phase 5 — Matchmaking (the payoff, no build required)

- Conversational: Claude queries the DB + reasons over rows. Patterns:
    - "3-person intro ideas among [tag=creator] within 50mi of Glen Burnie"
    - "Who should meet whom this month" — log ideas to `intros` table so suggestions don't repeat.
- Optional later: a weekly ritual — pull 3 intro ideas, DJ vetoes/sends.

## Guardrails (bot-flag prevention)

1. Official export + Dex are the default data paths; browsing is the fallback, capped at 30–50 profiles/day.
2. All browsing via DJ's real Chrome session (Claude-in-Chrome), human pacing.
3. Never: cloud scrapers with session cookies, bulk connection requests, mass messaging, headless browsers.
4. If LinkedIn ever shows a warning/restriction: stop all automation immediately, cool down 2+ weeks.

## Open Decisions (for pickup)

- [ ] Dex vs. DIY enrichment — decided by Phase 2 gate.
- [ ] Exact home dir for the tool (`~/network-crm/` proposed).
- [ ] Whether to also import LinkedIn messages/invitations from the full archive (adds "relationship warmth" signal).
- [ ] Whether intro ideas should feed the existing outreach lanes (creator outreach, testimonial hunt) or stay separate.

## Sources

- [LinkedIn: Export connections](https://www.linkedin.com/help/linkedin/answer/a566336/export-connections-from-linkedin)
- [Accelstone: what export can/can't get](https://accelstone.com/articles/how-to-export-linkedin-connections-and-emails-what-you-can-cannot-get/)
- [LinkedIn: Prohibited software](https://www.linkedin.com/help/linkedin/answer/a1341387)
- [LinkedIn scraping limits 2026](https://linkedrent.com/linkedin-scraping-limits-2026/)
- [Dex vs Clay/Mesh](https://getdex.com/blog/dex-vs-clay/)
- [Best personal CRM 2026 comparison](https://www.getorvo.com/learn/best-personal-crm-2026)
