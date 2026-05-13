---
date: 2026-05-11
topic: buildos-agent-feed
status: brainstorm — pre-planning
related:
    - docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
    - docs/marketing/anti-feed/blog-context.md
    - /Users/djwayne/.claude/projects/-Users-djwayne-buildos-platform/memory/project_connect_your_agents_promo.md
path: docs/brainstorms/2026-05-11-buildos-agent-feed-brainstorm.md
---

# BuildOS Agent Feed

## What We're Building

**A President's Daily Brief for your projects.** A continuously-live, agent-curated feed that becomes BuildOS's home base — one surface where your projects, your agents, your connected signals, and your own notes converge. An assistant downloading you on all the moving pieces of every project running in parallel.

It serves four uses at once: ambient awareness throughout the day, catch-up after time away, a control surface where you can talk back to your agents, and a continuously-live replacement for the morning daily brief.

This is **the inverse of a social media feed**. Every item is about your reality, written by your agents on your behalf. No ads. No algorithm optimizing for someone else's attention metric. Designed to _minimize_ time-on-app, not maximize it. It is the practical embodiment of the "context surface across agents" positioning already drafted for the Connect Your Agents promo.

## Why This Approach

We considered four curation models. **AI-curated cards** (the firehose grouped into project-anchored summaries) won over raw chronological, project lanes, and priority-only because it scales when four different sources are posting in — without becoming the noise the anti-feed thesis warns against.

We considered four freshness models. **Hybrid live-attention + scheduled-ambient** won because the "needs you" use case must be real-time but the digest layer is too expensive to run on every event.

We considered three action models. **All three coexist** (read + quick-action + inline thread + convert) won because the feed is meant to be a control surface, not a notification stream. A card is a full work object.

## Key Decisions

- **Purpose: feed-first BuildOS.** Ambient + catch-up + control + brief-replacement. The daily brief becomes a snapshot of the feed at 8am, not a separate product.
- **Sources (all first-class):** BuildOS internal events, external agents (Claude/ChatGPT/etc.) posting via API, connected signals (calendar/email/GitHub), and the user posting in directly.
- **Curation:** AI-curated cards. Each card is a digestible summary, not a raw event.
- **Visual anchor: project.** Project icon + color is the dominant visual identifier. Author (agent/you/system) is a secondary chip. Status (moving / stuck / quiet) is carried by Inkprint texture — `tx-bloom` for momentum, `tx-grain` for stuck, inked-down for quiet.
- **Visual rule:** signals carry more power when visual. Every card has four visual layers — project identity, author identity, status texture, and inline payload (screenshot, voice-note waveform, sparkline, diff strip, calendar block).
- **Freshness:** hybrid. "Needs you" cards push live via SSE. Ambient digest cards regenerate on a 30–60min worker schedule (new job sibling to `generate_daily_brief`).
- **Structure: continuous live PDB with re-sorting sections.** No daily "issue" lock-in. Three first-class sections that items move between as state changes:
    - `DECISIONS NEEDED` — pinned top. Agent blocked. Time-sensitive. Your input required.
    - `MOVING` — work in progress. What advanced today. Read for awareness, no action needed.
    - `WATCHING` — quiet projects. Collapsed by default. A glance tells you something is cold.
- **Cross-project home feed (default view) + project drill-in.** Tap a project chip on a card → enter that project's dedicated feed with momentum view. Same nav pattern as Instagram/Twitter, but the content is yours and the structure is sectioned, not chronological.
- **Card = full work object.** Every card supports: read, quick-action buttons (Approve / Defer / Snooze / Done), inline thread (reply back to the posting agent), and convert (turn into a task / brain dump / calendar item).

## The Frame: President's Daily Brief

The reference is not Twitter, Instagram, or RSS. It is the **President's Daily Brief** — a curated intelligence document produced for one reader by a team that knows their priorities, their portfolio, and what decisions are pending. Calm. Authoritative. No ads. No engagement-bait. Designed to inform action, then get out of the way.

This framing solves the anti-feed brand tension without word games. We keep the word "feed" — the positioning does the work.

| Social media feed                        | BuildOS feed                             |
| ---------------------------------------- | ---------------------------------------- |
| Strangers' content, picked by algorithm  | Your projects, picked by your agents     |
| Ads + advertisers                        | No ads. Ever.                            |
| Designed to **maximize** time-on-app     | Designed to **minimize** time-on-app     |
| Infinite scroll                          | Finite. A quiet feed is a good feed.     |
| Reaction-driven (like / share / comment) | Decision-driven (approve / defer / done) |
| Public performance                       | Private operation                        |
| Optimized for the platform               | Optimized for your focus                 |

## Voice & Tone

The PDB frame dictates how agents _write_ into the feed.

- **Calm and declarative.** "Payments advanced on three fronts overnight." Not "Hey! Quick update 👋."
- **Action language at the close.** Every card ends with "Recommended next: …" or a decision affordance. PDBs don't end with shrugs.
- **No engagement mechanics.** No likes. No comments. No share counts. The only interaction is action.
- **Signed by author.** Agents put their name on their items. Accountability matters when an agent is briefing you.
- **Briefer mode.** The feed can be _delivered_ — read aloud by an agent on a walk. Maps to BuildOS voice mode / agent chat.
- **Memo register of Inkprint, not scrapbook register.** Quieter, more typographic, more authoritative.

## Visual System (Card Layers)

```
┌─ ■ PAYMENTS ──────────────────────────────  ← project anchor (icon + color band)
│ Claude · 14m                              ← signed author + recency
│
│ Webhook handler shipped.                  ← summary line (LLM-written, declarative)
│ ■■■■□□□□  +3 today                         ← inline visual payload
│
│ Recommended: review the PR before merge.   ← action language close
│ [ approve ] [ defer ] [ … ]                ← affordances (only when action exists)
└────────────────────────────────────────────
```

Section visual states (cards inherit these):

- **DECISIONS NEEDED** — saturated color band, bordered, alive texture (`tx-bloom`), action affordances visible.
- **MOVING** — full color, subtle bloom, no required action, read for awareness.
- **WATCHING** — inked-down, faded, recessive. Collapsed by default. Won't compete for attention.

Home feed sketch:

```
BUILDOS · LIVE                                                       May 12
─────────────────────────────────────────────────────────────────────────────
DECISIONS NEEDED (2)
─────────────────────────────────────────────────────────────────────────────
[● marketing]   Claude · 2h
T07 draft ready. Need a read before push.
[ approve ] [ defer ]

[■ payments]    BuildOS · 1h
Stripe call needs a confirm by 4p.
[ confirm ] [ reschedule ]

MOVING (4)
─────────────────────────────────────────────────────────────────────────────
[■ payments]    Claude · 14m   Webhook handler shipped. ■■■■□□□□ +3 today
[● marketing]   You    · 1h    Carousel slide 3 edited.
…

WATCHING (3)
─────────────────────────────────────────────────────────────────────────────
[◆ resume]      no movement (4d)
[△ reddit]      paused
```

## MVP Slice (v1 — ~1–2 weeks)

**Ship the `DECISIONS NEEDED` section only.** Highest-value content, lowest curation cost. The other two sections appear in the IA but are empty / placeholder until v2.

Scope:

- New `feed_items` table (project_id, author, status, payload_json, action_state, created_at, resolved_at)
- Real-time push channel when BuildOS or an agent flags an item as `decisions_needed` (reuse the agent chat's SSE pattern)
- Project-anchored visual card design (icon, color, status texture, signed author, action-language close)
- Quick-action buttons (Approve / Defer / Snooze / Dismiss) — moves card out of `DECISIONS NEEDED`
- Cross-project home feed view at `/feed` + per-project drill-in (`/projects/[id]/feed`)
- Agent ingest endpoint: `POST /api/agent/v2/feed/post` — external agents can post into your feed via the same bearer-token pattern as the BuildOS Agent API
- PDB-register voice prompt locked in for any LLM-authored items (calm, declarative, action-language close)

Explicitly deferred to v2+:

- `MOVING` section (scheduled LLM digest compile worker job)
- `WATCHING` section (quiet-project surfacing)
- Inline agent reply threads
- Convert-to-task / brain dump capture
- Connected signals (calendar / email / GitHub) ingestion
- Daily brief deprecation
- Briefer mode (voice read-aloud)

## Card Archetypes (v1)

1. **Agent-blocked card** — agent needs input, decision, or output review.
2. **Decision-needed card** — BuildOS itself surfaces a project decision (e.g., conflicting priorities).
3. **Time-sensitive card** — deadline / SLA / calendar event (lite version; full signal ingestion is v2).
4. **User-flagged card** — user marked something for their own future attention.

## Open Questions

- **Card lifecycle between sections.** When does a `DECISIONS NEEDED` card become `MOVING` (after action? after first ack?) — and when does a `MOVING` card become `WATCHING` (after N hours quiet? project-aware threshold?). State machine needs definition.
- **Daily brief.** If the feed replaces the brief, when do we sunset the morning email? Or does it stay as a daily snapshot of the home feed (still useful for offline / mobile / passive consumption)?
- **Live channel transport.** Reuse the agent chat's SSE pattern, or upgrade to a websocket for bidirectional push?
- **Agent ingest auth.** Reuse the existing per-agent bearer-token model from the BuildOS Agent API, or design a new scope-limited token?
- **Empty / quiet state.** When you have nothing in the feed, what does it show? This is a brand moment — opportunity to reinforce "a quiet feed is a good feed."

## Next Steps

1. Run `/workflows:plan` on the MVP slice (`DECISIONS NEEDED` section only) to produce a step-by-step implementation plan.
2. Cross-reference with the Connect Your Agents promo work — the feed is the natural surface for "context across agents," and the promo copy should point at the feed once shipped.
3. Mine this build for anti-feed cluster content. "I built a feed inside an anti-feed product — here's the PDB reframe" is itself a viral-grade post. The build process is the proof.
