<!-- slow-chat-speed-recs.md -->

Got it. “Agentic chat is slow” almost always comes from **one of 6 bottlenecks**:

1. model latency (TTFT + tokens/sec)
2. too much context (prompt bloat / retrieval bloat)
3. tool loop design (serial calls, unnecessary steps)
4. DB / network round trips (Convex/Supabase + external APIs)
5. streaming/UI buffering (you _are_ streaming but user doesn’t feel it)
6. cold starts / queueing (serverless/edge/cpu contention)

Here’s a practical way to speed it up **today**.

---

## 1) Make it _feel_ fast first (TTFT)

Users judge speed by **time to first token**, not total time.

### Do this:

- **Stream immediately**: send a “thinking header” within ~200ms (even if it’s just: “Okay—here’s what I’m doing…”).
- **Two-phase response**:
    - Phase A: quick outline / next step / clarifying assumption (1–3 sentences)
    - Phase B: detailed answer continues streaming

### Common bug:

You’re waiting for _tools + DB + model_ before sending anything. Fix by streaming a header before tool execution.

---

## 2) Stop sending huge context every turn (this is #1 killer)

Agentic systems often re-send:

- entire conversation
- entire project context doc
- tool schemas
- long memories
- retrieved chunks (too many)

### Fix pattern: “context budget”

- Keep a **rolling summary** (1–2k tokens) + last ~10 messages
- Put everything else behind retrieval (and retrieve _small_)

**Hard rule:** never send a 30k “project context” doc to the model on every message.

### Also: split context types

- **system**: stable rules
- **developer**: stable product behavior
- **memory**: short bullets
- **retrieval**: only what’s needed _this turn_

---

## 3) Fix agent loops: stop serial tool chains

If your agent does:

1. query DB
2. call web
3. call another tool
4. then finally responds

…that’s death by round trips.

### Speed pattern: parallelize

Run in parallel:

- retrieval query
- DB fetch
- any cheap classifiers (intent, routing)
  Then merge results once.

### Speed pattern: “tool gating”

Before calling a tool, require a cheap check:

- “Do I _need_ DB for this?”
- “Do I _need_ RAG for this?”
- “Can I answer from short memory?”

A huge % of turns don’t need tools.

---

## 4) Reduce tool call count with “one-call payloads”

Instead of:

- `getProject()`
- `getTasks()`
- `getRecentRuns()`

Do:

- `getChatContextBundle(projectId)` returning exactly what the agent needs.

This applies to both Supabase and Convex.

---

## 5) Make your DB path fast (Convex vs Supabase specifics)

### If you’re using **Convex**

Convex is often fast, but slowness comes from:

- too many reactive subscriptions
- queries that do extra scans
- doing “N+1” in app code
- actions calling external APIs while the UI waits

Do this:

- consolidate reads into one query
- precompute “chat context view” documents
- move slow work to **actions** and let UI continue
- show partial output while action runs

### If you’re using **Supabase**

Common slow points:

- RLS policies causing expensive checks
- too many separate queries per message
- cold edge function + DB connection overhead
- missing indexes on filter columns

Do this:

- check indexes on: `project_id`, `user_id`, `created_at`, `run_id`
- prefer one RPC function returning a bundle
- add connection pooling (if applicable)
- don’t do heavy joins on every turn—cache “context snapshots”

---

## 6) Cache what’s stable (and cache at the right layer)

Good caches:

- embeddings for docs (never re-embed same text)
- “project context snapshot” (updated when project changes)
- tool results with TTL (e.g., “user profile” 5 minutes)
- model responses for identical prompts (if you have repeated patterns)

Bad cache:

- caching final chat responses blindly (rarely repeats exactly)

---

## 7) Streaming + chunking tricks that matter

If you stream but it _still_ feels slow:

- your server buffers until it has a certain amount
- your client only renders after newline / chunk threshold
- you’re using SSE incorrectly and the proxy buffers

Quick fixes:

- flush chunks frequently (every ~50–200 tokens)
- send a heartbeat chunk early
- ensure your hosting/proxy supports unbuffered streaming

---

## 8) “Agentic” doesn’t have to mean “slow”

A fast pattern that still feels agentic:

1. **Immediate**: short response + plan (no tools yet)
2. **Background**: tools run (DB + retrieval)
3. **Continue**: refine answer or produce artifacts as results arrive

Even without true background jobs, you can simulate this by:

- returning a partial response fast
- then sending an update message when tools finish (if your UI supports it)

---

# The fastest wins (if you only do 3 things)

1. **Stop sending giant context** → rolling summary + targeted retrieval
2. **Bundle DB calls** into one “context pack” query/RPC
3. **Parallelize tools** + stream immediately (TTFT focus)

---

## If you paste this, I can tell you exactly where the lag is

Send any **one** of these and I’ll diagnose quickly:

- a single request timeline (timestamps for: request start → DB → model start → first token → done)
- your agent loop pseudocode
- your typical prompt size (tokens) + how many tool calls per turn

Even without that: if you tell me whether this slow chat is on the **Supabase project** or the **Convex project**, I’ll give you a tailored “speed patch list” for that stack.
