<!-- slow-chat-recs2.md -->

Yep — this DAG makes the bottleneck pretty obvious: **you’re gating `startAgentStream` behind your slowest two steps**:

- **F→G ontology load + access check**
- **H persistUserMessage** (plus optional voice-note linkage)

So even if your model is fast, your **TTFT is forced to wait** on DB + cache + possibly heavy ontology hydration.

Below are the highest-leverage changes, in order.

---

## 1) Split “access gate” from “ontology hydration”

Right now `G` is doing two jobs:

1. **access validation** (must be correct, must happen before persisting)
2. **ontologyContext load** (can be slow)

If you split those, you can safely parallelize **H (persist)** with **G2 (slow load)** without writing forbidden messages.

### New flow (best win)

```
E resolveSession
→ F resolveProjectFocus
→ G1 access_check (fast RPC)
   ├─► H persistUserMessage (fast insert)  (now safe)
   └─► G2 ontology_load (slow)             (in parallel)
(G2 + H done)
→ J startAgentStream
```

### What “fast access_check” looks like

Make it an RPC (or single SQL query) that returns **true/false + canonical project/session ids** with **minimal joins**.

- Use a _single indexed lookup_:
    - `sessions.id` belongs to `user_id`
    - `project_membership` exists for `(user_id, project_id)`
    - any “focus overrides” resolved already in `F`

**Avoid** loading ontology tables in this call.

---

## 2) Start streaming before ontology finishes (stream a “preface”)

Even if you can’t start the model yet, you can make the UX feel instant.

### Practical trick

As soon as `authenticate + rateLimit + parseRequest` are done, start SSE and send:

- an “accepted” event
- a “working” event
- optionally: a quick “plan / what I’m about to do” message

This drops perceived latency dramatically.

**Important:** don’t leak private content. This preface should be generic (e.g. “Loading project context…”), not the user’s data.

---

## 3) Make persistence non-blocking for TTFT (but still correct)

Even after access-check split, `H` can still be a speed bump if you wait on it before streaming model tokens.

Two safe approaches:

### Approach A: Persist in parallel; allow stream to begin

Once `G1` passes, you can:

- kick off `H` (insert message)
- kick off `J` (agent stream)

Then, when `H` returns, attach `message_id` to the run (or send a “server_state” SSE event with the ID).

This is safe if you can handle:

- stream continuing even if persistence fails (rare; but handle it)

### Approach B: “Provisional message”

Insert a row immediately with:

- `status = 'pending'`
- minimal fields
  Then update it after the stream completes.

This is robust for retries and crashes.

---

## 4) Reduce ontology load cost (your real tax)

Even with parallelism, if `ontologyCacheService.loadWithSessionCache` is heavy, you’re paying it every turn.

Big improvements here:

### A) “Thin ontology” for chat turns

Most turns don’t need the full ontology. Create tiers:

- **Tier 0 (always)**: small session summary + focus ids + a few “hot” entities
- **Tier 1 (sometimes)**: expanded project context snapshot
- **Tier 2 (rare)**: full ontology graph

Your loader should accept a **budget** like:

```ts
loadOntology({ projectId, budget: 'thin' | 'standard' | 'full' });
```

### B) Precompute a “project_context_snapshot”

Instead of assembling context from many tables on every chat:

- maintain a `project_context_snapshot` table (or materialized view)
- update it when project changes (trigger / job)
- your chat preflight reads **one row**

This is often a _night-and-day_ change.

### C) Make sure cache keys are stable

If your cache key includes anything that changes per request (timestamps, message ids, etc.), you’re missing the cache constantly.

---

## 5) Bundle Supabase queries into 1–2 RPCs

Your graph shows multiple conceptual stages; if those stages each do several queries, that’s a round-trip killer.

Ideal DB pattern:

- `resolveSessionBundle()` → returns session + metadata + recent convo ids
- `resolveFocusAndAccess()` → returns focus + access_ok
- (optional) `fetchOntologyThin()` → returns the thin snapshot

You want **2 DB round trips** before streaming model tokens.

---

## 6) Check the usual Supabase “slow path” suspects

These are common “why is this slow only on Supabase?” causes:

### A) RLS policies doing heavy joins

RLS can be surprisingly expensive if your policies do subqueries/joins per row.

- Prefer **membership tables with composite indexes**
- Prefer policy checks that are **simple EXISTS** on indexed columns

### B) Missing indexes

If any of these appear in WHERE clauses, index them:

- `session_id`
- `user_id`
- `project_id`
- `created_at`
- any membership join keys: `(project_id, user_id)`

### C) Cold starts + DB connection overhead (Edge/Serverless)

If `+server.ts` is serverless and creates fresh DB clients often, your first query is slow.

Mitigations:

- reuse client where possible
- connection pooling (depends on your hosting)
- avoid doing 3–6 sequential queries on cold start

---

## 7) A concrete “best” DAG for you

This preserves your “don’t persist inaccessible requests” rule:

```
A authenticateRequest
B rateLimiter
C parseRequest
→ start SSE immediately (send preface events)

D createServices
E resolveSessionBundle (1 DB call)
F resolveProjectFocus (pure / cheap)
G1 access_check (fast DB call)
  ├─► H persistUserMessage (async)
  └─► G2 ontologyThinLoad (async / cached)
await Promise.all([H, G2])  // or only await G2 if you allow persistence after stream
J startAgentStream
```

---

## If you want the _fastest_ next step

Instrument timing around each node and print a single log line like:

```
preflight_ms: {
  auth: 12,
  rate: 4,
  parse: 2,
  resolveSession: 85,
  focus: 18,
  accessCheck: 25,
  ontologyLoad: 420,
  persist: 60,
  total: 627
}
```

Then you’ll know instantly whether:

- ontology load is the monster (likely)
- RLS/membership checks are slow
- persistence is slow
- or cold start dominates

If you paste one of those timing dumps (even from local), I’ll tell you exactly which refactor above will give you the biggest win and what to do first.
