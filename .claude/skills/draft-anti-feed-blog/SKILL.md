---
name: draft-anti-feed-blog
description: Draft a single ranked blog post for the BuildOS anti-feed / thinking-environment cluster. Reads the consolidated brief at docs/marketing/anti-feed/blog-context.md, picks the next-up T## from the WS09 dashboard (or a user-specified topic), produces a 1,200–2,000 word draft with frontmatter and cross-links, and saves it under apps/web/src/content/blogs/philosophy/. Triggers on "/draft-anti-feed-blog", "draft the next anti-feed blog", "write the next cluster blog", "draft T## blog", "write T## post". Does NOT build publish kits, TikTok scripts, or non-cluster blog posts — use the old `anti-feed` skill for those.
---

# Draft Anti-Feed Cluster Blog

A focused, single-purpose skill: produce one ranked cluster blog from the BuildOS anti-feed / thinking-environment cluster (WS09).

This skill follows the **argument-based pattern** — its entire brand, voice, audience, vocabulary, output spec, and drafting flow lives in **one consolidated context file**:

**`docs/marketing/anti-feed/blog-context.md`** ← always read this first.

When the brand guide, topic map, or anti-AI doctrine changes, the context file gets updated in one place and this skill picks it up next run. No skill edits needed.

---

## When to load this skill

- User runs `/draft-anti-feed-blog`
- User asks to draft the next cluster blog (T34–T43 range or beyond)
- User asks to write a specific T## post
- User asks for a free-topic blog inside the anti-feed cluster vocabulary

Do **not** load for:

- Publish kits (Twitter / LinkedIn / Instagram / TikTok / Reddit) → old `anti-feed` skill, menu option 2
- Standalone TikTok scripts → old `anti-feed` skill, menu option 3
- Founder essays, changelog posts, product launches → different mode, different voice
- Brand or positioning decisions → brand guide is the arbiter

---

## The flow

### Step 0 — Load the context file (always)

Read `docs/marketing/anti-feed/blog-context.md` in full. One read, end-to-end. This is the single source of truth for voice, audience, vocabulary, output format, and the drafting flow.

Do not proceed without this read. Do not paraphrase from memory; the file changes and the annealing log accumulates.

### Step 1 — Identify the target post

Per §11 Step 1 of the context file:

1. Open `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md` and read the live status dashboard.
2. Pick the highest-priority 🟡 or ⚪ row (lowest T-number on tie). Skip ✅ and ⏸.
3. Confirm with user: "Next up is **T## — {title}**. Draft it now?"
4. If user names a different T## or a free topic, use that.

### Step 2 — Outline before prose

Per §11 Step 2:

Produce a 5-bullet outline (lead-with-relief opener, mechanic/claim, reframe with term-to-own, BuildOS frame, the practice). Show to user. Wait for confirmation or edits **before writing prose**. Do not skip this gate.

### Step 3 — Draft

Per §11 Step 3 + §10 (output format):

- Length: 1,200–2,000 words (aim 1,500)
- Body shape: hook → mechanic → reframe → BuildOS section (≤15%) → practice → closing line
- Inline checks while drafting: no AI in hook, ≥1 term-to-own appears 3+ times, ≥1 external source cited, em-dash density natural

### Step 4 — Frontmatter + cross-links

Per §10:

- Fill frontmatter exactly (every field)
- ≥2 inline links to prior cluster posts (verify the files exist in `apps/web/src/content/blogs/philosophy/`)
- 1 link to `docs/marketing/strategy/anti-feed-content-topic-map.md`
- Pick cross-links by **vocabulary continuity**, not just topic adjacency

### Step 5 — Voice checklist (pre-save gate)

Run every item in §11 Step 5 of the context file. Show the user the checklist with results. **If any item fails, revise before saving.** This is non-negotiable.

### Step 6 — Save

Save to `apps/web/src/content/blogs/philosophy/{slug}.md`. Confirm to user: path, word count, reading time.

### Step 7 — Annealing log

Ask: **"Any learnings from this draft to capture in the annealing log?"**

If yes — append a dated entry to §13 of `docs/marketing/anti-feed/blog-context.md` using the entry format in §13. If the entry includes a "Rule update" line, also edit the relevant rule section (§3, §4, §6, §10, or §11) of the context file in the same edit.

If no — skip silently.

### Step 8 — Hand-off prompt

Prompt: **"Draft saved at `{path}`. Want to build the publish kit now?"**

- Yes → invoke the old `anti-feed` skill (menu option 2). Don't try to build the kit yourself.
- No → end run.

### Step 9 — Status update reminder

Surface this reminder before ending the run:

> "Update three places before this counts as done: WS09 dashboard (T## → 🔵 or ✅), `docs/marketing/distribution/README.md` task quick-map, `buildos-strat-tasks.md`. All three or it's drift."

This skill does **not** write status updates itself.

---

## Hard limits

Repeated from §12 of the context file, because prompt drift is real:

- **No publish kits.** Old `anti-feed` skill, option 2.
- **No standalone TikTok scripts.** Old `anti-feed` skill, option 3.
- **No status-dashboard writes.** Surface the reminder; user updates.
- **No posting / publishing.** Save to disk only.
- **No non-cluster blog posts.** Different mode, different skill.
- **No new vocabulary coining mid-post.** Flag for user; do not add to canon unilaterally.

---

## Why this skill is so thin

The argument-based pattern: **the skill is the process, the context file is the knowledge.** Voice, audience, vocabulary, anti-patterns, proof assets, ranked posts, output format — all in `blog-context.md`. This file just enforces the flow.

When the brand guide updates, the topic map shifts, or a new anti-pattern emerges from real drafts: edit the context file once. Every future run picks it up. No skill rewrites, no drift between skill and source-of-truth.

The annealing log inside the context file is the feedback loop. Every run that produces a learning makes the next run sharper.

---

## Source of truth

- **Context (this skill consumes):** `docs/marketing/anti-feed/blog-context.md`
- **Live status (read each run):** `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`
- **Output destination:** `apps/web/src/content/blogs/philosophy/{slug}.md`
- **Companion skill (publish kits):** `.claude/skills/anti-feed/SKILL.md` (menu option 2)
