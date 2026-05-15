---
date: 2026-05-11
topic: buildos-agent-feed
status: brainstorm — pre-planning, amended after audit
related:
    - docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
    - docs/marketing/anti-feed/blog-context.md
    - /Users/djwayne/.claude/projects/-Users-djwayne-buildos-platform/memory/project_connect_your_agents_promo.md
path: docs/brainstorms/2026-05-11-buildos-agent-feed-brainstorm.md
---

# BuildOS Agent Feed

## What We're Building

**A President's Daily Brief for your projects.** A continuously-live, agent-curated feed that becomes BuildOS's home base — one surface where your projects, your agents, your connected signals, and your own notes converge. An assistant downloading you on all the moving pieces of every project running in parallel.

It serves four uses at once: ambient awareness throughout the day, catch-up after time away, a control surface where you can talk back to your agents, and an eventual live substrate for the morning daily brief.

This is **the inverse of a social media feed**. Every item is about your reality, written by your agents on your behalf. No ads. No algorithm optimizing for someone else's attention metric. Designed to _minimize_ time-on-app, not maximize it. It is the practical embodiment of the "context surface across agents" positioning already drafted for the Connect Your Agents promo.

## Why This Approach

We considered four curation models. **AI-curated cards** (the firehose grouped into project-anchored summaries) won over raw chronological, project lanes, and priority-only because it scales when four different sources are posting in — without becoming the noise the anti-feed thesis warns against.

We considered four freshness models. **Hybrid live-attention + scheduled-ambient** won because the "needs you" use case must be real-time but the digest layer is too expensive to run on every event.

We considered three action models. **All three coexist eventually** (read + quick-action + inline thread + convert) won because the feed is meant to be a control surface, not a notification stream. V1 should stop at read + quick-action + resolution state.

## Key Decisions

- **Purpose: brief-first BuildOS, feed-backed internally.** Ambient + catch-up + control. Product language should emphasize "briefing" and "decisions that need you"; the feed/card model is the implementation substrate.
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
- **Card = full work object eventually.** V1 should support read + quick actions + resolution state. Inline thread and convert are high-value, but they are v2+ affordances because they expand scope and make cards feel inbox-like if added too early.

## Post-Audit Amendments (2026-05-13)

The strongest critique of this plan is that "agent-curated feed" can quietly become "another inbox where agents report that they did work." That risk should shape the data model and MVP, not just the copy.

### Anti-Noise Product Contract

BuildOS does not publish raw events. It publishes selected operational cards. A visible card must clear one of these bars:

- The user must decide something.
- A promised artifact is ready for approval.
- A plan materially changed.
- A deadline, risk, or blocker changed.
- A conflict appeared between agents, projects, or prior decisions.

Everything else is source material for project history, daily brief synthesis, or collapsed digest sections.

### `DECISIONS NEEDED` Admission Rule

A decision card must include:

- Project or area.
- Specific question.
- Recommended default.
- Deadline or freshness window.
- Consequence of inaction.
- One-tap outcomes that resolve it.
- Citations/source references when summarizing facts.

If an agent cannot produce those fields, it cannot post a decision card. It can only create a candidate.

### Candidate-First Data Model

V1 should model cards as an editorial pipeline, not a notification stream.

Suggested states:

- `candidate` — proposed by agent/system/user.
- `published` — visible in the decision lane.
- `merged` — folded into another card.
- `resolved` — acted on or completed.
- `suppressed` — too low signal, duplicate, stale, missing source, or outside scope.

Suggested fields beyond the original table sketch:

- `dedupe_key`
- `decision_question`
- `recommended_default`
- `freshness_expires_at`
- `consequence`
- `source_refs`
- `priority_score`
- `trust_score_snapshot`
- `suppression_reason`

This is the product's defense against inbox creep. Agents propose; BuildOS edits.

### Card Budget

Start with a hard visible budget: 3 visible decision cards by default, 5 maximum. If there are more candidates, Briefer must rank, merge, or hold. Scarcity is part of the trust model.

### Daily Brief Relationship

Do not deprecate the existing daily brief in v1. The daily brief is already a useful delivery surface with email/audio/notification plumbing. In v1, unresolved decision cards and important resolved decisions should become ingredients in the morning brief. "Brief becomes snapshot of the feed" should wait until the feed is trusted.

### Agent Write-Back Default

Agent session summaries should land in memory/project history by default, not the visible feed. They become visible only when they satisfy the admission rule. "I worked on X" is not a card; "X is ready for your approval by 4pm, default is merge" is a card.

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

- New `feed_items` / `feed_card_candidates` model (project_id, author/source, state, payload_json, decision fields, dedupe_key, source_refs, action_state, freshness_expires_at, created_at, resolved_at)
- Real-time push channel when BuildOS or an agent flags an item as `decisions_needed` (reuse the agent chat's SSE pattern)
- Project-anchored visual card design (icon, color, status texture, signed author, action-language close)
- Quick-action buttons (Approve / Defer / Snooze / Dismiss) — moves card out of `DECISIONS NEEDED`
- Cross-project home feed view at `/feed` + per-project drill-in (`/projects/[id]/feed`)
- Agent ingest through the existing OAuth/MCP/agent-call path where possible — external agents create candidates first, not visible cards by default
- PDB-register voice prompt locked in for any LLM-authored items (calm, declarative, action-language close)
- Instrumentation for card quality: candidate-to-published ratio, dismiss/snooze rate, duplicate merge rate, resolution time, and time-to-caught-up

Explicitly deferred to v2+:

- `MOVING` section (scheduled LLM digest compile worker job)
- `WATCHING` section (quiet-project surfacing)
- Inline agent reply threads
- Convert-to-task / brain dump capture
- Connected signals (calendar / email / GitHub) ingestion
- Daily brief deprecation
- Briefer mode (voice read-aloud)
- Ambient card scheduling until the decision lane proves high-signal

## Card Archetypes (v1)

1. **Agent-blocked card** — agent needs input, decision, or output review.
2. **Decision-needed card** — BuildOS itself surfaces a project decision (e.g., conflicting priorities).
3. **Time-sensitive card** — deadline / SLA / calendar event (lite version; full signal ingestion is v2).
4. **User-flagged card** — user marked something for their own future attention.

## Open Questions

- **Card lifecycle between sections.** When does a `DECISIONS NEEDED` card become `MOVING` (after action? after first ack?) — and when does a `MOVING` card become `WATCHING` (after N hours quiet? project-aware threshold?). State machine needs definition.
- **Daily brief.** Do not sunset it in v1. The live decision lane should supply ingredients to the morning brief until usage data proves the feed can replace or reshape it.
- **Live channel transport.** Reuse the agent chat's SSE pattern, or upgrade to a websocket for bidirectional push?
- **Agent ingest auth.** Prefer the existing OAuth/MCP/agent-call model. Add feed/context operations and project allow-lists there before designing a parallel token system.
- **Empty / quiet state.** When you have nothing in the feed, what does it show? This is a brand moment — opportunity to reinforce "a quiet feed is a good feed."
- **Admission control.** What is the exact threshold between "candidate worth storing" and "visible card worth interrupting DJ"?

## Next Steps

1. Run `/workflows:plan` on the MVP slice (`DECISIONS NEEDED` section only) to produce a step-by-step implementation plan, including candidate states and anti-noise instrumentation.
2. Cross-reference with the Connect Your Agents promo work — the feed is the natural surface for "context across agents," and the promo copy should point at the feed once shipped.
3. Mine this build for anti-feed cluster content. "I built a feed inside an anti-feed product — here's the PDB reframe" is itself a viral-grade post. The build process is the proof.
