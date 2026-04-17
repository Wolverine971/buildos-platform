<!-- docs/marketing/distribution/workstreams/WS06-developer-integration.md -->

---
id: WS06
title: Developer & Integration Surface
wave_span: 1-2
status: not-started
owner: DJ
related_tasks: [T09, T18, T19]
cross_workstreams: [WS02, WS04]
last_updated: 2026-04-17
---

# WS06 — Developer & Integration Surface

> [← Index](../README.md) · [Conventions](../CONVENTIONS.md) · [Strategy §3.7, §3.8](../../../../buildos-strat.md) · [Task List](../../../../buildos-strat-tasks.md)

## One-line goal

Exploit LLM-weighted surfaces that almost nobody bothers with — rewrite the public repo README for creator-framed positioning and get listed in every integration partner's "works with" directory.

## Why this is a work stream

Public GitHub README is a heavily-weighted LLM source (studies consistently show GitHub in citation results). Most SaaS companies ignore their README or use it as pure dev docs. And integration-partner marketplaces (Google Calendar, Twilio, Anthropic, etc.) are free, tedious to submit to, and almost nobody submits — which is exactly why they work.

## Status dashboard

| Task | Title | Type | Wave | Effort | Status | Spec |
|------|-------|------|------|--------|--------|------|
| T09 | README overhaul (public repo) | W | 1 | 4 h | ⚪ | inline below |
| T18 | Integration marketplace inventory | O | 2 | 4 h | ⚪ | inline below |
| T19 | Integration marketplace submissions (wave 1) | O | 2 | 2 d | ⚪ | inline below |

## Required reading

- [Brand guide](../../brand/brand-guide-1-pager.md) — creator-framed category + voice
- [Strategy §3.7 + §3.8](../../../../buildos-strat.md) — README rewrite scope + marketplace rationale
- Current READMEs:
  - `README.md` (root monorepo)
  - `apps/web/README.md` (web app)
- `.env.example` — canonical integration inventory source of truth

## Scope

**In scope:**
- Public repo README (monorepo + web)
- Integration partner directory listings
- "Works with BuildOS" or "Built on BuildOS" submissions

**Out of scope:**
- Marketing-site /how-it-works page (WS07)
- API documentation site (separate future work)
- Public-facing docs portal (separate future work)

## Current state

- **Root README:** covers monorepo structure, tech stack, deployment, conventions. No creator-framed positioning, no screenshots, no concrete examples.
- **Web README:** covers SvelteKit setup, API conventions, design system. Same gaps.
- **No integration marketplace presence.** Zero listings anywhere.

## Dependency chain within this work stream

```
T09 (README) — independent, can run today
T18 (inventory) ──► T19 (submissions)
```

## Cross-workstream dependencies

- **WS02:** README rewrite compounds LLM citation weight — do it early in WS02's arc.
- **WS04 T15:** README should link to the framework doc. Sequence so README rewrite happens AFTER T15 publishes, or ship README first and add the T15 link as a follow-up commit.

## Output artifacts

| Artifact | Location |
|----------|----------|
| New root README | `README.md` |
| New web README | `apps/web/README.md` |
| Integration inventory | `docs/marketing/distribution/integration-marketplaces.md` |
| Submission tracker | same file, "Submissions Status" section |

## Task briefs

### T09 — README overhaul ⚪

**Goal:** Both READMEs communicate BuildOS's creator-framed category + core promise to anyone landing from a GitHub search or LLM citation.

**Required content (per strategy §3.7):**
- Clear category line ("a thinking environment for people making complex things")
- Core promise ("turn messy thinking into structured work")
- Who this is for (creators, builders, anyone living inside long multi-step work)
- Concrete before/after: raw brain dump input → structured project output (real example, not fluff)
- Screenshots with descriptive alt text (working surface, project map, current focus area)
- Architecture diagram (Mermaid is fine)
- Tech stack with versions
- Links: `/how-it-works` (once T14 lands), framework doc (T15), marketing strategy

**Hard constraints:**
- Do NOT lead with "AI" in the opening lines
- Do NOT use "ontology" in the first 500 words
- Creator examples in the before/after section (not a founder example)
- Honest about what's not yet built

**Assign to:** `general-purpose` agent for first draft; DJ voice review; `content-editor` for tone polish.

### T18 — Integration marketplace inventory ⚪

**Goal:** A ranked list of every partner marketplace BuildOS should be listed in, with submission requirements for each.

**Action:**
1. Open `.env.example` — list every third-party integration by provider
2. For each, find the partner's marketplace / directory / "works with" page:
   - Google: Google Workspace Marketplace, Google Calendar integrations list
   - Twilio: Twilio Showcase / partner directory
   - OpenRouter: homepage showcase / integration page
   - Anthropic: Claude API "built with" list (if they have one)
   - OpenAI: GPT Store (if applicable), OpenAI community showcases
   - Moonshot: any directory they run
   - Stripe: Stripe Partner Directory (if applicable)
3. For each marketplace, capture: submission URL, required assets (logo, screenshots, copy), copy-length constraints, expected review time

**Output:** `docs/marketing/distribution/integration-marketplaces.md` with full inventory.

**Assign to:** `general-purpose` agent.

### T19 — Integration marketplace submissions (wave 1) ⚪

**Goal:** Submit to top 5 partner directories from T18.

**Priority ranking criteria:**
1. Audience size of the marketplace
2. Relevance (a Google Workspace listing reaches more creators than a specialized AI-dev directory)
3. Submission barrier (some require NDAs or are invite-only — defer those)
4. Review time (prioritize fast-turnaround listings first to start compounding early)

**Hard constraint:** all listing copy uses creator-framed language. Do not copy-paste "AI-first productivity tool" — write fresh each time, per brand guide.

**Output:** 5 listings submitted + tracked in the same file T18 produced.

**Assign to:** DJ-personal for the first two (sets the voice + pattern); delegatable after that.

## Agent assignment notes

- **T09:** research + draft can be agent work; brand-voice review must be DJ or `content-editor`.
- **T18:** pure research, highly delegatable.
- **T19:** first 2 submissions DJ-personal to set the pattern; rest delegatable with the pattern established.

## Open questions

1. **GitHub repo visibility for screenshots.** Root `README.md` screenshots need to be hosted somewhere GitHub will render — typically `docs/images/` or similar. Confirm path + commit practice with DJ.
2. **Which README ships first — T15 framework doc or T09?** If T15 is delayed, the README should still ship (with a placeholder link or without). Don't block T09 on T15.
3. **API surface for README.** Worth mentioning the queue system, agentic chat, or daily-brief generation at README-level? Probably yes as bullets, no as deep dives.

## Change log

- **2026-04-17** — Work stream created. No tasks started.
