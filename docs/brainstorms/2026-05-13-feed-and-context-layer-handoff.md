---
date: 2026-05-13
topic: feed-and-context-layer-handoff
status: review packet + implementation audit
purpose: single entry point for an agent reviewing the BuildOS feed + cross-agent context layer design
packet:
    - docs/brainstorms/2026-05-11-buildos-agent-feed-brainstorm.md
    - docs/brainstorms/2026-05-12-buildos-feed-10x-vision.md
    - docs/brainstorms/2026-05-13-cross-agent-context-layer.md
related_context:
    - CLAUDE.md (BuildOS architecture + marketing positioning)
    - /Users/djwayne/.claude/projects/-Users-djwayne-buildos-platform/memory/project_connect_your_agents_promo.md
    - docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md
path: docs/brainstorms/2026-05-13-feed-and-context-layer-handoff.md
---

# Handoff: BuildOS Feed + Cross-Agent Context Layer

You are reviewing a three-document design package produced this week (May 11–13, 2026). The work moves BuildOS from "AI productivity tool" toward "chief of staff in a box" — a _brief-first_, feed-backed operational surface that is also the shared context surface every AI agent in the user's life plugs into.

This doc orients you. Read it, then read the three docs in the order given below, then give feedback in the areas flagged at the bottom.

**2026-05-13 audit update:** the direction is strong, but the implementation plan should not ship exactly as originally written. The current codebase already has a remote MCP/OAuth agent-call surface, daily brief delivery plumbing, project context snapshots, project activity batching, and notification infrastructure. The plan should extend those pieces, narrow the first slice, and treat "noisy inbox" as the primary product risk.

---

## Context You Need Before Reading

- **BuildOS** is an AI productivity platform. Users write brain dumps; AI extracts projects, tasks, context. Daily brief generation, calendar integration, ontology-driven project management, and an agentic chat system already exist.
- **Brand positioning is anti-AI / anti-feed.** Public category: "thinking environment for people making complex things." Public promise: "turn messy thinking into structured work." Marketing strategy explicitly avoids leading with AI and rejects doomscroll-feed UX. There is a published anti-feed content cluster.
- **"Connect Your Agents" promo** is positioning copy (drafted 2026-05-08, not yet shipped) that frames BuildOS as "the context surface across AI agents." Today this is a claim. The cross-agent context layer is what makes it provable.
- **Operator context.** DJ is a solo founder. Shipping bandwidth is real. The design must phase cleanly into 1–2 week increments. Speed-to-demo matters because the marketing strategy is creator-led.

---

## The Thesis in Three Paragraphs

**1. Reframe.** BuildOS becomes a **brief-first, feed-backed product**. The home surface is a continuously-live, agent-curated briefing organized as a **President's Daily Brief** — calm, authoritative, decision-driven, no ads, designed to _minimize_ time-on-app. The frame solves the anti-feed brand tension without word games: this is the _inverse_ of a social feed (your reality, picked by your agents, action-not-reaction), and the PDB analogy gives it institutional gravitas. Internally, the feed has three re-sorting sections: `DECISIONS NEEDED`, `MOVING`, `WATCHING`. Cards become full work objects over time; v1 should stop at read + quick-act + resolution.

**2. The 10x ceiling.** With perfect taste, the system is not a feed feature — it is a **chief of staff in a box**. A named synthesis agent ("Briefer") writes the morning memo, holds the operational reality, drafts the user's next move, and pushes back when the user is spinning. The brief publishes to many surfaces (web, widget, watch, audio, email, PDF). Reaching "you're caught up" is a real state with a real visual. Magic moments: overnight agent work surfaced as a single coffee-time card stack; three-decision cascades that move fourteen downstream things; a Sunday weekly retro that arrives better than the user could write.

**3. The cross-agent context layer.** BuildOS exposes an **MCP server** so other agents (Cursor, Claude.ai, ChatGPT, custom) can read the user's operational context and write back into the feed. Two personas, same memory: **Briefer** writes for DJ (opinionated, voiced). **Librarian** serves other agents (faithful, citation-heavy, quieter). Capabilities: project briefings as system-prompt context, voice/style export for drafting in DJ's voice, belief/prior export, semantic memory recall, coordination claims, session-summary write-back. This _is_ the operational version of the Connect Your Agents promo — when it ships, the promo's claim is provable in a 30-second demo.

---

## Key Decisions, With Audit Adjustments

These were made deliberately through the brainstorm. The audit keeps the product direction but adjusts the implementation details where the current codebase gives us a better path.

**Audit caveat:** the spirit of these decisions holds, but several implementation details below are superseded by the audit notes: MCP is not greenfield, auth should reuse the existing OAuth/agent-call model, and "feed-first" should be productized publicly as a brief/control surface rather than an open-ended feed.

- **Frame: President's Daily Brief**, not "feed" in the social sense. The word "feed" is kept; the positioning does the work.
- **Curation model: AI-curated cards**, not raw chronological events. Cards are summaries, not raw events.
- **Visual anchor: project.** Project icon + color is the dominant 1-second identifier. Author is a chip. Status is Inkprint texture.
- **Freshness: hybrid.** "Needs you" cards push live via SSE. Ambient digest cards regenerate on a 30–60min worker schedule.
- **Structure: continuous live with re-sorting sections**, not a daily "issue." `DECISIONS NEEDED` / `MOVING` / `WATCHING`. Cards move between sections as state changes.
- **Card = full work object eventually.** V1 is read + quick-action buttons + resolution state. Inline reply-to-agent and convert-to-task are v2+.
- **Voice register: PDB.** Calm, declarative, action-language close, signed by author, no engagement mechanics, no emojis, no "Hey! Quick update!"
- **Protocol for cross-agent layer: MCP.** Not a custom API. Distribution tailwind into major agent surfaces, validated one surface at a time.
- **Two personas: Briefer + Librarian.** Same memory store, different output discipline. Briefer is the principal's voice; Librarian is the institution's.
- **Auth: extend existing OAuth/agent-call grants.** The repo already has an OAuth-backed remote MCP / agent-call path with `buildos.read`, `buildos.write`, op-level permissions, grant status, caller status, and allowed project IDs. Add feed/context operations to that model before considering any parallel bearer-token scheme.

---

## The Shipping Plan (Three Cuts)

| Cut             | Scope                                                                                                                                                                         | Time     | What it proves                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------- |
| **1x MVP**      | `DECISIONS NEEDED` lane only. Candidate-gated cards. Live SSE. Quick-action buttons. Agent ingest through existing OAuth/MCP/agent-call where possible.                       | ~1–2 wks | The control-surface premise works without inbox creep.  |
| **2x cut**      | All three sections. Inline reply threads. First synthesis card type. One named Briefer. Email edition at 7am. Convert-to-task. Cross-reference v1. PDB visual treatment.      | ~4 wks   | The magic starts; DJ would tell other people about it.  |
| **10x ceiling** | Audio briefer mode. Multi-surface presence (watch, widget, PDF). Cross-agent context fully realized. Presence-aware batching. Sunday retro as a document. Drafted next-moves. | ~6 mo    | BuildOS becomes a category — "chief of staff in a box." |

The most consequential strategic call open right now: **do we ship the feed MVP and the cross-agent context layer in parallel, or sequence them?**

Audit recommendation: **do not run two full implementation tracks in parallel.** Make `DECISIONS NEEDED` the critical path, and run one narrow MCP/context spike in parallel only where it reuses existing infrastructure. The demo story needs both, but the product does not need the whole cross-agent layer before the first useful feed slice.

---

## Implementation Audit Notes

### Verdict

The idea is worth pursuing. The PDB / chief-of-staff framing is stronger than "feed" and it fits the existing BuildOS direction. The risk is not technical feasibility; the risk is accidentally building another place to check. The plan needs a harder editorial layer, stronger admission rules, and a smaller first cut.

### Codebase Alignment

- **MCP is already in the repo.** BuildOS has an MCP route at `/mcp/buildos` backed by the agent-call connector. Today it supports initialize, `tools/list`, and `tools/call`; it does not yet expose the proposed MCP resources/prompts. Phase 0 should extend this existing route instead of standing up a new `/mcp`.
- **OAuth/agent-call already exists.** The current grant/token model already handles callers, hashed access tokens, grant status, caller status, default read/write scopes, allowed ops, and project allow-lists. Add feed/context ops there instead of creating a second bearer scope system.
- **Project context snapshots are the Librarian fast path.** `project_context_snapshot` and the snapshot worker already create a cached per-project context substrate. The Librarian should read and shape that cache before introducing a new context cache.
- **Daily brief should not be deprecated in v1.** The daily brief already has useful delivery plumbing: email/notification preferences, audio generation, and worker processing. The new card/feed model should feed into the brief first; replacing the brief should be a later product decision after behavior proves out.
- **Notifications are plumbing, not the feed.** Existing notification deliveries and project activity batches can seed feed cards and show what batching should feel like, but the operational feed should be its own card/candidate model. Delivery logs are not a product surface.
- **Project icons need validation.** Icon generation exists, but project icon display is currently disabled. Do not bet the whole 1-second visual system on project icons until they are visible, distinctive, and readable at card scale.
- **Queue fit is fine, but not free.** The Supabase queue can support feed digest jobs, but every new job type has migration, enum, worker registration, retries, and observability cost. V1 should avoid scheduled digest workers until the decision lane proves useful.

### Recommendation

Ship a **brief-first operational control surface**, implemented with feed cards underneath. Publicly, the product should promise "your briefing" and "decisions that need you," not "a feed." The word feed can remain internal and in URLs if convenient, but the product should be judged by how quickly the user reaches a real "caught up" state.

Recommended sequence:

1. **Week 1: decision lane only.** Create the card/candidate data model, `/feed`, project-anchored cards, quick actions, resolution states, and source metadata. No inline threads, no convert-to-task, no `MOVING`, no `WATCHING` beyond empty/collapsed shell.
2. **Same week: one MCP read spike.** Add a single existing-route tool such as `get_project_briefing`, backed by project context snapshots and citations. This proves external-agent context without building the whole resource system.
3. **Week 2: controlled write-back.** Add `post_feed_card` or `request_decision` through the existing OAuth/agent-call gateway. Agent write-back lands as a candidate first, not automatically as a visible card.
4. **Week 3: brief integration.** The daily brief email includes top unresolved decision cards and recent resolved decisions. Do not replace the daily brief yet.
5. **Week 4+: add `MOVING` and `WATCHING`.** Add them only after the decision lane has quality metrics proving it is not a noisy queue.

### The Single Riskiest Assumption

That agents will post high-signal, grounded, decision-worthy cards without turning BuildOS into an inbox. This will not happen automatically. Agents optimize for "I did work, so I should report it." BuildOS has to optimize for "the user only sees what changes a decision, changes a plan, or prevents real drift."

---

## Anti-Noise Contract

This section should be treated as a product requirement, not UX polish.

### Admission Rules

A card is allowed into `DECISIONS NEEDED` only if it has all of the following:

- A named project or area.
- A specific decision/question.
- A recommended default.
- A deadline or freshness window, even if soft.
- A consequence of inaction.
- One-tap outcomes that resolve the card.
- Citations or source references when it summarizes facts.

If it does not meet that bar, it is not a decision card. It becomes a project log entry, a daily-brief ingredient, or a collapsed digest candidate.

### Card Budget

The product needs an explicit card budget. A good starting default: **3 visible decision cards, 5 maximum active decision cards**. If more candidates exist, Briefer must rank, merge, or hold them for the next brief. The user's trust comes from omission as much as surfacing.

### Editorial Pipeline

Do not let external agents publish straight to the main feed in v1.

Proposed lifecycle:

1. `candidate` — agent/system proposed a card.
2. `merged` — candidate was folded into an existing card.
3. `published` — Briefer/admission rules promoted it.
4. `resolved` — user acted or system completed the loop.
5. `suppressed` — too low signal, duplicate, stale, or outside scope.

This is the core design move: BuildOS is not an inbox for agent status updates. BuildOS is an editor.

### Write-Back Defaults

Agent session summaries should write back to memory/project history by default. They should enter the visible feed only when one of these is true:

- The user must decide something.
- A plan materially changed.
- A promised artifact is ready for approval.
- A deadline/risk changed.
- A conflict or duplicate-work risk appeared.

"I worked on X" is not a feed card. It is source material.

### De-Dupe And Coalescing

Cards should have a stable thread/dedupe key: project + subject + source + decision type. New information updates an existing card unless it changes the decision. Multiple agents arguing over the same item should become one card with two positions, not two cards.

### Negative Feedback

Every dismiss/snooze should teach the system why it was wrong:

- Not relevant.
- Already handled.
- Too early.
- Too late.
- Bad summary.
- Wrong project.
- Not a decision.

Source trust should decay when a caller repeatedly creates dismissed or suppressed candidates. Trust should recover when its cards are resolved, approved, or included in the daily brief.

### Metrics That Matter

Track the product against anti-inbox metrics from day one:

- Time to caught up.
- Decision cards shown per day.
- Candidate-to-published ratio.
- Duplicate merge rate.
- Dismiss/snooze rate by source.
- Resolution rate within freshness window.
- Percent of visible cards with user action.
- Number of days with zero visible cards.

The north-star is not feed engagement. The north-star is **high-confidence orientation with minimal surface area**.

### Kill Switches

V1 should have operational guardrails:

- Per-agent daily candidate limit.
- Per-project visible-card cap.
- Global quiet hours / briefing windows.
- Source mute and project mute.
- Briefer-only mode, where all external write-back stays invisible until reviewed.
- Automatic suppression of candidates missing citations when they make factual claims.

### "You're Caught Up"

The empty state is not empty. It is the product doing its job. It should show:

- No decisions need you.
- Last checked timestamp.
- What is still running in the background, if anything.
- Next scheduled brief/check-in.

It should not invite scrolling.

---

## De-Risk Plan For The Noisy-Inbox Failure Mode

1. **Backtest before building much UI.** Generate candidate cards from recent project logs, daily briefs, and agent activity. Manually label what deserved visibility. This creates the first admission rubric.
2. **Dogfood with an editorial queue.** For one week, let agents create candidates but manually promote cards. Measure how many candidates should have been suppressed.
3. **Ship decision lane behind a self-only flag.** Use real work, real agents, and real push timing. The test is whether DJ checks it less than he checks notifications.
4. **Instrument quality, not engagement.** A feed that gets opened 20 times a day is probably failing. The right graph is fewer cards, faster resolution, lower re-open anxiety.
5. **Only then add ambient sections.** `MOVING` and `WATCHING` are powerful, but they are also the easiest path back to inbox behavior. Add them when the editorial system has earned trust.

---

## Where Reviewer Feedback Is Most Valuable

Please weight your review toward these questions. The answers will shape what gets built.

### Strategic

1. **Is the PDB framing the right one?** It currently feels much stronger than the earlier "anti-feed reframe" attempt. Is there a frame I'm missing that would beat it? (Bloomberg Terminal? Mission Control? Pilot's pre-flight checklist? Each has different implications.)
2. **Is the audit sequencing right?** Decision lane as critical path, one narrow MCP spike in parallel. Or should MCP wait entirely until the feed proves value?
3. **What happens to the existing daily brief email?** The audit recommends keeping it distinct in v1 and letting cards feed into it. What evidence would justify replacing it later?
4. **Is "chief of staff in a box" a category-creating frame or a marketing trap?** It's powerful but it's also a high bar to back up. Comfortable defending it?

### Product / UX

5. **Is the card-as-full-work-object too much for v1?** The MVP scope tries to ship live cards with quick actions, but the doc says cards eventually support inline threads + convert. Do we over-promise the visual affordances early?
6. **What's the right design for the "you're caught up" state?** Flagged in the 10x doc as the most important UI state in the system, and it has no answer yet.
7. **Is the project-as-visual-anchor decision right?** Project icons exist (`generate_project_icon` job) but are they distinctive enough at 1-second-glance scale? If not, what's the fix?
8. **Is the live SSE channel for "needs you" the right transport?** Or should v1 just push email/native notifications and skip the live web channel?

### Technical / Architecture

9. **MCP as the cross-agent protocol — sanity check.** Is MCP mature enough across Cursor / Claude.ai / ChatGPT / custom agents for this to actually deliver distribution? Or is there a 6-month window where it's still rough?
10. **The Librarian "fast path vs slow path" caching design.** Is this the right shape, or does novel-query latency kill the demo if every project briefing is an LLM call?
11. **Worker queue impact.** The ambient digest compile is a new periodic job sibling to `generate_daily_brief`. Does it fit cleanly into the existing `SupabaseQueue` job model, or does it expose problems?
12. **The 800-token cap on briefings.** Is that the right number, or does it need to scale by surface (Cursor system prompt budget vs Claude.ai vs ChatGPT)?

### Risk

13. **What's the single riskiest assumption in the whole design?** Be brutal.
14. **What would kill this before it shipped?** Technical risk, brand risk, scope risk, or distribution risk — pick the one you'd worry about most.
15. **Where is this overengineered?** Where could we ship something dumber that gets to "user is using it" faster?

---

## What to Read, In What Order

1. **[`2026-05-11-buildos-agent-feed-brainstorm.md`](2026-05-11-buildos-agent-feed-brainstorm.md)** — the foundation. The PDB frame, the three sections, the visual system, the v1 MVP scope. Start here.
2. **[`2026-05-12-buildos-feed-10x-vision.md`](2026-05-12-buildos-feed-10x-vision.md)** — the ceiling. Narrative scene of the 7:14am morning, magic moments, Briefer as a named presence, 2x effort cut. Read this to understand where the MVP is _heading_.
3. **[`2026-05-13-cross-agent-context-layer.md`](2026-05-13-cross-agent-context-layer.md)** — the agent-facing half. MCP server, Librarian persona, eight capabilities, three-phase ship plan. Read this last because it presupposes you understand the feed and the ceiling.

If you only have ten minutes: read this handoff doc, skim the "Key Decisions" and "What the 10x Version Concretely Does" sections of doc #2, then jump to "Where Reviewer Feedback Is Most Valuable" above and write directly to those questions.

---

## How to Deliver Your Review

Pick a format that fits the depth of your feedback:

- **Punch list** — if you have a handful of specific concerns, bullet them with the section + question number you're responding to.
- **Memo** — if you have a strategic-level take on the whole package, write it as a one-page memo.
- **Inline comments** — if you want to react line-by-line, drop a parallel doc with quotes and reactions.

What is _not_ useful: generic encouragement, paraphrasing of what's already written, or "this is great" without specifics. The author has been close to this for three days and needs a sharper eye, not a kinder one.
