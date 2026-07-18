-----------
my initial prompt:

I need to re-evaluate the loops I have here, specifically the AI inbox items. The AI inbox items need to be fresh because I'm finding that I have a lot of suggestions and a lot of things I need to action on. Some of them are good but I think some have been there for a while.

There are a few things that can trigger these suggestions in the AI inbox. I need to holistically assess what I should do. I would like to have two or three suggestions, but when it's over three suggestions, that's a lot. It's likely that they are overlapping or not specific, or maybe some of these AI inbox items are outdated.

I want to make sure each inbox item earns its keep and that it really is something I need to check and address. Maybe some of this can be lumped together. I think I want a process where the agent can scan these AI inbox items, make decisions on them, and re-evaluate them. Alternatively the agent can auto-dismiss them.

Sometimes I have an inbox item about an upcoming calendar event but a few days later the calendar event has passed. That AI inbox item needs to be updated or removed. I don't know if we have a time-to-live for an inbox item. I'm not sure but this is a problem. I opened Build-OS today and it said I had 35 AI inbox items. That's a lot of inbox items. I only want a few per project.

I think what we have is working but we need to reassess and figure out how to smooth this process out. As a user I don't want to action 30 different items. I want the top items surfaced and I want several layers of auditing and synthesizing before it reaches my inbox, if that makes sense and it's relevant. If it's fresh right now, I can action it or assess it. If there are stale inbox items, they need to be reassessed.

That's what I'm thinking about. That's a brain dump of what's going on in my head. I want you to assess this problem and try to figure out what the proper architecture is to solve it. Ideally I want freshness: we should only have fresh inbox items there or they should be grouped and lumped together. As if I was a real person, like the CEO of a company, you're not going to ping the CEO with a million small details. You're going to ping them with the high-level details. I'll provide the direction going forward. Some of these things are important for me as the CEO to address and some are not.

I would love a review agent or a review layer that assesses, "Okay now that we have over three items in the inbox, maybe it's time to kick in a review layer and validate: are all these items necessary? Should we be sending all these items up?" I think that's the framing I want. Take this into account and start investigating. Give me your recommendations for how we should handle this.

---

---

AI agent answer:

The AI Inbox is currently acting as a raw suggestion queue, not an executive attention system. The right fix is to introduce an admission/review layer between suggestion generation and the inbox—not merely shorten the TTL.

## What I found

At inspection time today, the live inbox had 28 pending items—down from the 35 you saw earlier—but 27 still required action. They collapsed visually into seven groups:

- 19 child recommendations from four complete project audits
- 5 suggestions for Hannibal
- 3 suggestions for UXM
- 1 non-actionable, stale audit packet

No calendar or generic agent proposals were currently contributing. The immediate overload is project-review fan-out.

This behavior is directly reflected in the code:

- A light project loop may generate 25 suggestions; a complete audit may generate 8 children: [projectLoopWorker.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/project-loop/projectLoopWorker.ts:79).
- Each audit child is now explicitly synced into the inbox: [projectLoopWorker.ts](/Users/djwayne/buildos-platform/apps/worker/src/workers/project-loop/projectLoopWorker.ts:2120).
- The parent audit packet is hidden when those children exist: [inbox-index.ts](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/inbox-index.ts:616).
- Backfill indiscriminately recreates inbox entries for every pending project suggestion, so one-time cleanup cannot hold: [inbox.service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/inbox.service.ts:1029).
- UI grouping is presentation-only; the badge and workload remain the literal number of rows: [DashboardInboxModal.svelte](/Users/djwayne/buildos-platform/apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte:230), [aiInboxCount.store.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/stores/aiInboxCount.store.ts:70).
- All sources currently receive the same 30-day TTL, including calendar suggestions: [inbox-index.ts](/Users/djwayne/buildos-platform/packages/shared-agent-ops/src/inbox-index.ts:47).
- Calendar analysis stores and indexes every returned suggestion without an admission cap or event-lifecycle revalidation: [calendar-analysis.service.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/services/calendar-analysis.service.ts:1485).

Two older audit groups were from July 7, demonstrating that staleness is also real—not just hypothetical.

## Recommended architecture

Use this pipeline:

`Producers → Candidate ledger → Freshness validation → Project synthesis → Global attention broker → AI Inbox`

The critical rule is: generating a suggestion must not automatically create an inbox item.

### 1. Treat inbox space as scarce

My recommended initial budget:

- Dashboard: at most 3 active attention packets globally.
- Project: at most 3 promoted decisions.
- Audit: at most 1 packet per project.
- Audit packet: no more than 2–3 decisions requiring the user; supporting recommendations remain expandable evidence.
- Badge: count attention packets, not raw recommendations.

An eight-recommendation audit should appear as something like:

> Lily Reading Plan: two decisions need you. Four follow-ups were consolidated; two were deferred.

The underlying recommendations remain available in project history, but they do not each become CEO work.

### 2. Run the reviewer before admission

I would not wait until the count exceeds three. Every candidate should pass through lightweight deterministic review. Crossing three should trigger an additional compaction/re-ranking pass.

For each candidate, the reviewer should:

1. Verify that its source still exists and is active.
2. Revalidate referenced entities or events.
3. Detect semantic duplicates and overlapping evidence.
4. Merge related candidates into one decision.
5. Decide whether user authority is actually required.
6. Classify it as:
    - `promoted`
    - `merged`
    - `deferred_by_budget`
    - `auto_dismissed`
    - `system_actionable`
    - `needs_user_decision`

Only `needs_user_decision` should reach the AI Inbox.

### 3. Separate freshness, importance, and risk

The current system primarily sorts by risk tier and recency. Risk is not importance: a risky action may be strategically unimportant, while a low-risk calendar decision may be urgent.

Store these separately:

- `valid_until`
- `last_validated_at`
- `source_fingerprint`
- `attention_score`
- `urgency_score`
- `requires_user_authority`
- `cluster_key`
- `disposition_reason`
- `packet_id`

Suggested starting freshness policies:

| Source              | Freshness rule                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Calendar            | Revalidate source events; expire when the relevant event passes, is cancelled, or materially changes |
| Agent proposal      | 24–72 hours or until a target entity changes                                                         |
| Project mutation    | Until referenced entity fingerprint changes; re-review after roughly 7 days                          |
| Complete audit      | Latest audit only; supersede after material project changes or roughly 7 days                        |
| Drift/audit finding | Must have a factual validity check; the current null fingerprint is insufficient                     |

A passed calendar event should normally disappear within minutes or hours—not survive for 30 days.

### 4. Make auto-dismiss safe and explainable

Start auto-dismiss only for deterministic cases:

- Source deleted or terminal
- Calendar event passed/cancelled
- Duplicate semantic key
- Superseded by a newer audit
- Included in a synthesized packet
- Project deleted
- Recommendation’s factual premise no longer holds

Keep an audit trail with a reason and a restore option. Lower-ranked but still-valid items should be deferred, not silently destroyed.

Use an LLM for semantic clustering and synthesis, but do not initially allow an LLM alone to irreversibly dismiss something.

## Immediate containment

I would address the current overload in this order:

1. Stop indexing `audit_recommendation` children directly into the inbox.
2. Restore one current audit packet per project.
3. Prevent backfill from resurrecting audit children.
4. Compact the current 28 rows into seven project packets, then promote the top three globally.
5. Expire the non-actionable UXM packet.
6. Change the badge to count admitted packets.
7. Add calendar-aware expiry before the next calendar backlog occurs.

That should deliver a large improvement before building the full reviewer.

## Durable rollout

- Phase 1: deterministic curator, source-specific TTLs, hard attention budgets, audit packets.
- Phase 2: semantic merge/synthesis across overlapping project suggestions.
- Phase 3: shadow-mode ranking and quality measurement.
- Phase 4: preference learning from accepts, dismissals, and restored auto-dismissals.

The key success metrics should be:

- Median active dashboard packets ≤3
- No project with more than 3 promoted decisions
- Zero raw audit children in the global inbox
- Percentage validated within the source’s freshness window
- Promotion-to-acceptance rate
- Duplicate/superseded rate
- Auto-dismiss restore rate

My strongest recommendation is to fix the audit-child regression first. It is responsible for most of today’s live backlog and is the clearest example of internal analysis leaking directly into the CEO attention channel. I did not approve or dismiss any inbox records during this investigation.
