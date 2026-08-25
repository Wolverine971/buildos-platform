<!-- tasker/60-agentic-chat-fair-share-queue-claiming.md -->

# 60 — Agentic Chat fair-share queue claiming

**Created:** 2026-08-25

**Status:** Open

**Priority:** P1
**Type:** Performance / reliability investigation

## Why this exists

Queue-first admission correctly lets every compatible turn wait instead of rejecting it. The queue
currently claims runnable `agentic_chat_turn` jobs by priority and schedule time only. With eight
active slots (four replicas × two turns), one account with many sessions can occupy every slot.
The per-session active-turn uniqueness rule prevents duplicate work in one chat, but it does not
provide cross-user fairness.

## Investigation

- Measure whether FIFO claiming creates user or organization starvation under burst traffic.
- Compare round-robin-by-user, per-user active quotas at claim time, and weighted fair queuing.
- Keep the durable enqueue path unconditional below the emergency safety ceiling; fairness belongs
  in claiming/scheduling, never in the request route.
- Confirm `FOR UPDATE SKIP LOCKED` remains correct with four independent replicas.
- Define explicit treatment for retries, priority jobs, and users with one versus many chat sessions.

## Acceptance criteria

1. A load fixture proves no user can occupy all global slots indefinitely while other users wait.
2. Claiming remains atomic, lease-fenced, and horizontally safe across four or more replicas.
3. Queue wait p50/p95/p99 and throughput are compared against the current FIFO baseline.
4. The solution adds no web-request round trip and does not weaken the emergency queue ceiling.

## Non-goals

- Reintroducing `max_running` as an admission rejection.
- Reserving permanently idle capacity per account.
- Replacing the existing durable Postgres queue without measured evidence.
