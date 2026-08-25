<!-- tasker/61-agentic-chat-multi-replica-capacity-observability.md -->

# 61 — Agentic Chat multi-replica capacity observability

**Created:** 2026-08-25

**Status:** Open

**Priority:** P1
**Type:** Operations / scaling investigation

## Why this exists

The current worker capacity endpoint reports one Railway replica's local provider, publisher, and
consumer state. After scaling to four replicas, a load-balanced response cannot describe global
capacity. The new scaling alert therefore uses authoritative global database signals—pending jobs,
oldest wait, and running jobs—but cannot yet attribute pressure to a particular replica or provider
reservation.

## Investigation

- Design a short-TTL worker heartbeat keyed by stable replica identity and release.
- Include configured concurrency, active turns, provider reservations/cooldown, publisher pressure,
  last successful claim, event-loop lag, draining state, and last heartbeat time.
- Build one service-only aggregate that joins heartbeats with global queue depth and age.
- Decide whether Railway autoscaling, a dashboard, or alert enrichment should consume the aggregate.
- Treat missing/stale heartbeats explicitly; never interpret one healthy replica as fleet health.

## Acceptance criteria

1. Fleet capacity equals the sum of fresh, accepting replica slots and is testable during rollout.
2. A stopped or draining replica disappears from available capacity within a bounded interval.
3. Alerts identify queue pressure versus provider/publisher/replica pressure without user payloads.
4. Heartbeat writes are bounded and indexed, with retention cleanup and service-role-only access.
5. The read model works during rolling deployments with mixed releases.

## Non-goals

- Putting fleet observation back on the chat admission critical path.
- Making local health depend on the shared heartbeat table.
- Logging prompts, tool arguments, or response text.
