---
name: marketing
description: One command to run BuildOS marketing ops from a durable queue instead of memory. Reads docs/marketing/ops/queue.json + cadence.json, runs the deterministic status engine (scripts/marketing/ops/status.mjs), and routes into the four pipeline stages — QUEUE/STATUS, ASSETS, PUBLISH, ENGAGE/LEARN — reusing the anti-feed, draft-anti-feed-blog, ideate/moodboard, and platform warmup skills. Triggers on "/marketing", "marketing status", "what's due to post", "marketing backlog", "spin up what I need to post", "log metrics for X", "what marketing is overdue".
---

# Marketing Ops Pipeline

The single entry point for running BuildOS marketing as a **pipeline off a queue**, not a set of ad-hoc sessions. The queue is the memory between sessions — you always pick up exactly where you left off.

Full design + schema: **`docs/marketing/ops/README.md`** (read once for context; don't re-read every run).

## The prime directive

**ALWAYS run the status engine first, every single invocation, before doing anything else:**

```bash
node scripts/marketing/ops/status.mjs --today=<today>
```

Pass `--today=YYYY-MM-DD` using the real current date from the environment context (the script defaults to system time, but pin it so the report is deterministic and matches what the user sees). This prints the 🔴 overdue / 🟡 due / 🟢 ready-to-post / 🔵 next / 🖼️ asset-gaps / 📦 backlog picture. Everything below is a response to what that report shows.

Never hand-compute cadence or "what's overdue" yourself — that math is the engine's job (rerouted to a deterministic tool on purpose). Your job is to read its output and act.

## Routing (args)

| Invocation | Do this |
| --- | --- |
| `/marketing` (no args) | Run the engine, show the report, then recommend the single highest-leverage next action (top 🔴, else top 🟢, else 🔵). Offer to start it. |
| `/marketing backlog` | Backlog synthesis — see `references/backlog-synthesis.md`. |
| `/marketing assets [id]` | Stage ② — see `references/stage-assets.md`. |
| `/marketing publish [id]` | Stage ③ — see `references/stage-publish.md`. |
| `/marketing post [id] [platform]` | The posting sub-step of stage ③ — drive the platform skill, then mark the deliverable posted. |
| `/marketing engage` / `/marketing metrics` | Stage ④ — see `references/stage-engage.md`. |
| `/marketing add "<idea>"` | Add a new queue item (idea). See `references/queue-editing.md`. |
| `/marketing done <id> <deliverable> [url]` | Mark a deliverable posted (with URL) or a blog published. See `references/queue-editing.md`. |

If args are ambiguous, run the no-arg flow (status + recommend) and ask which thread to pull.

## The four stages (what each reuses — do NOT rebuild)

- **① QUEUE / STATUS** — the engine + `queue.json`. This skill owns it.
- **② ASSETS** — `/ideate` and `/moodboard` commands + the **Real Media Policy** (`docs/marketing/brand/BUILDOS_REAL_MEDIA_POLICY.md` — zero AI images of product/founder; real screenshots/recordings/Inkprint cards only). Resolves each deliverable's `asset_needs` → `assets`.
- **③ PUBLISH** — drafting reuses the `anti-feed` skill (publish kit, menu option 2) and `draft-anti-feed-blog` (the blog itself); posting reuses the `twitter` / `linkedin` / `instagram` / `reddit` browser skills. Voice comes from the brand guide + per-platform voice quick-refs (see stage-publish).
- **④ ENGAGE / LEARN** — pull post metrics via the platform browser skills into each item's `metrics[]`, then synthesize what's working to steer the next posts.

## The core loop (no-arg flow)

1. Run the engine (prime directive).
2. Read the report. Identify the **one** highest-leverage move:
   - Any 🔴 overdue → the oldest/most-blocking one.
   - Else any 🟢 ready-to-post → the one with least window left.
   - Else 🔵 next blog due → draft it.
3. State the recommendation in one line + why, then offer to run it (respect DJ's vision-first + decision-brief style — don't dump the whole report unless asked; lead with the recommendation).
4. When the user does an action (drafts a kit, posts a lane, generates an asset), **update `queue.json` immediately** (see `references/queue-editing.md`) and **re-run the engine** so the new picture is visible. The queue must never drift from reality.

## Golden rules

- The engine output is the source of truth for *timing*; `queue.json` is the source of truth for *state*. Keep them honest — patch the queue the moment something changes.
- Reuse the existing skills for content generation and posting. This skill orchestrates; it does not re-implement drafting, kit-building, or browser posting.
- Respect the Real Media Policy in every asset decision.
- One recommendation at a time. Marketing debt is paid down one overdue item at a time, not in a batch panic.
- After any queue edit, re-run the engine and show the delta.
