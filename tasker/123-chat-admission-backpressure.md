<!-- tasker/123-chat-admission-backpressure.md -->

# 123 — Chat admission backpressure

**Status:** PARKED by DJ (2026-10-18): hold until growth makes it matter  
**Priority:** P3 · **Opened:** 2026-10-18 · **Wake condition:** before a launch, an ad push, or
any week where chat turns wait more than a few seconds to start

## What it is

Agentic chat admission never turns a send away because the worker is busy. The web route passes
`p_capacity_available: true` on every send
(`apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`, comment "Admission no
longer treats transient worker pressure as a rejection"), and the admission RPC only checks it for
NULL. Nothing reads the worker's `/agentic-chat/capacity` endpoint. When every slot is busy, turns
wait in `queue_jobs` until one frees up. That has been deliberate since
`20260825161846_agentic_chat_queue_first_admission.sql`: worker pressure is "an operational scaling
signal, not a reason to lose a user turn."

Found by the agentic chat teardown (artifact `6pa2L6AK…`, finding "Admission never refuses on worker
load").

## Why it is parked

Production, last 30 days (read-only, 2026-10-18): at most 2 of 16 slots busy at once (4 Railway
replicas × `CHAT_CONCURRENCY` 4), peak queue depth 1, queue wait p99 0.72 s and max 1.53 s, zero
never-claimed timeouts since the sweeper shipped on 09-24. Saturation alone would need roughly 480
queued turns to reach the 10-minute timeout. Today only a worker outage makes anyone wait.

Limits that do exist: 100 queued turns per user, 20 admitted turns per user per 60 s, and one
queued or running turn per chat session (`20261017201000_agentic_chat_admission_rate_limit.sql`).
There is no service-wide cap.

What a user sees when it does happen: "Thinking…", then "Taking longer than usual…" after 20 s,
then after 10 minutes the stranded-turn cron cancels the turn with "BuildOS couldn't start this
reply because the chat service was unavailable. Please send it again." No position in line.

## The build when it wakes (recommended)

Refuse in SQL when the queue has stopped draining. No extra network hop on the send path.

1. New migration that replaces `create_agentic_chat_turn_with_job`: after the duplicate check, read
   the oldest ready pending `agentic_chat_turn` job (one lookup on
   `idx_queue_jobs_pending_claim_priority`). When it is older than ~120 s, return the existing
   `capacity_exceeded` outcome with `capacity_reason 'pressure_closed'` and
   `retry_after_seconds 30`.
2. The web parser already accepts `pressure_closed` (`worker-turn-admission.server.ts`) and the
   browser already treats `WORKER_CAPACITY_EXCEEDED` as "not admitted" and puts the draft back. The
   only web change is the copy in `apps/web/src/routes/api/agent/v2/turns/+server.ts` (today "Too many
   worker turns… for this account"): branch on `capacityReason`, and avoid "queue" and "worker" in
   user-facing words.
3. Before picking the threshold, measure how long claiming pauses during a Railway rolling deploy
   (drain is ~67 s); the threshold has to sit above it.
4. `pnpm db:rehearse` the migration, dry-run in prod with ROLLBACK, apply, record.

Rejected: probing the worker's capacity endpoint on every send. It answers for one replica only and
adds up to 1.5 s to every send.

## Exit condition

The refusal is live and verified, or DJ decides the queue-first behavior stays for good (then
delete this tracker and note the decision in the agentic chat docs).
