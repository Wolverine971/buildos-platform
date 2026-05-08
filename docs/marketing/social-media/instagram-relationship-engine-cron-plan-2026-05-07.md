<!-- docs/marketing/social-media/instagram-relationship-engine-cron-plan-2026-05-07.md -->

# Instagram Relationship Engine Cron Plan

**Date:** 2026-05-07
**Project:** BuildOS
**Purpose:** Turn the Instagram relationship engine handoff into a practical scheduled automation plan using OpenClaw cron.

---

## Current State

BuildOS does **not** yet have the full relationship engine running continuously.

Current automation coverage includes only one slice of the loop:

- **BuildOS Instagram Warmup** — `8:35 AM ET`
- Runs:

```bash
cd /Users/djwayne/buildos-platform && claude --chrome --dangerously-skip-permissions "/instagram-warmup"
```

That is useful, but it only covers the warmup stage.

---

## Intended Relationship Engine Loop

The target operating loop is:

1. `/instagram-intel` — reconcile stale, pending, and reaction state
2. `/instagram-discover` — keep new candidates flowing
3. `/instagram-warmup` — promote best opportunities into the day’s queue
4. `/instagram-reply` — draft comments and update the ledger
5. **Manual posting by DJ**
6. reconciliation back into `comment-log.md`

So the missing problem is not just “add more cron.”
The missing problem is **automation coverage across the actual workflow**.

---

## Why OpenClaw Cron Is The Right Runner

Use **OpenClaw cron** for this workflow because:

- it is already in use
- it can announce results back to Telegram
- the workflow is doc/file-centric, not deployment-centric
- it can safely automate research, queue maintenance, drafting, and reconciliation without automating social actions directly

---

## Recommended Automation Shape

This should run as a **scheduled daily operating loop**, not as a literally always-running continuous process.

Best shape:

- **3 daily jobs + 1 weekly review**
- optional drafting pass depending on how much DJ wants pre-written comments ready automatically

---

## Recommended Daily Jobs

### 1. Daily Intel Audit

**Time:** `8:00 AM ET`

**Command:**

- `/instagram-intel`

**Purpose:**

- audit stale drafted items
- read `comment-log.md`
- identify pending posting items
- identify duplicate or stale opportunities
- produce a reconciliation output for DJ

**Expected output:**

- intel summary doc
- recommended post / skip / archive list
- queue hygiene guidance

---

### 2. Daily Discovery Run

**Time:** `8:30 AM ET`

**Command:**

- `/instagram-discover <rotating lane>`

**Recommended lane rotation:**

- **Monday:** Solo
- **Tuesday:** PKM
- **Wednesday:** Author
- **Thursday:** Course
- **Friday:** WateringHole

**Purpose:**

- keep `candidates.md` fresh
- widen the top of the funnel
- avoid overfitting to one lane

**Expected output:**

- updated `docs/marketing/social-media/discovery/instagram/candidates.md`
- dated discovery run file
- notes in `search-terms.md`

---

### 3. Daily Warmup Run

**Time:** `11:00 AM ET`

**Command:**

- `/instagram-warmup`

**Purpose:**

- promote best candidates into the day’s queue
- produce 5–7 strong opportunities
- maintain lane balance
- avoid duplicate pending posts

**Expected output:**

- updated daily warmup doc
- queue ready for reply drafting

---

## Optional Same-Day Drafting

### 4. Daily Reply Drafting

**Time:** `11:20 AM ET`

**Command:**

- `/instagram-reply`

**Purpose:**

- prepare comment drafts automatically
- update profile docs
- update `comment-log.md`

**Use this only if:**

- DJ wants ready-to-review drafts each day
- the current queue quality is stable enough to justify auto-drafting

**If not:**
keep `/instagram-reply` manual after warmup review.

---

## Weekly Review Job

### Friday Relationship Review

**Time:** `3:00 PM ET`

**Command:**

- `/instagram-intel weekly review`

**Purpose:**

- summarize lane performance
- identify stale profiles
- identify follow-up opportunities
- determine what to stop doing
- determine which lanes are compounding relationship value

**Expected output:**

- weekly review doc
- lane performance summary
- stale queue cleanup recommendations
- next-week focus suggestion

---

## What Should Not Be Automated

These should remain manual unless explicitly redesigned later:

- posting comments
- liking posts
- following accounts
- sending DMs
- changing ladder stage without ledger evidence

This system should automate:

- research
- discovery
- queuing
- drafting
- reconciliation

It should **not** automate public or private social actions.

---

## Guardrails

Any automation runner should:

- read `docs/marketing/social-media/comment-log.md` before suggesting engagement
- never re-queue a post already drafted or posted
- mark stale candidates as `monitor` or `skip`
- never act from a browser session without explicit DJ approval
- never claim a relationship advanced unless the ledger proves it
- keep ADHD as a supporting lane, not the default lane

---

## Best Next Step

Recommended order:

### Step 1

Reconcile the current backlog first:

- `docs/marketing/social-media/comment-log.md`
- `docs/marketing/social-media/daily-engagement/2026-05-06_instagram-replies-pm.md`
- `docs/marketing/social-media/daily-engagement/2026-05-07_instagram-warmup.md`

Reason:

- otherwise new automation gets layered on top of stale queue state and unresolved drafted items

### Step 2

After backlog cleanup, implement the cron plan.

---

## Recommendation

Best near-term path:

1. backlog reconciliation
2. OpenClaw cron setup for intel + discover + warmup
3. optionally add `/instagram-reply` once queue quality is stable
4. keep posting and DMs manual

This gives BuildOS a **real scheduled relationship engine**, not just a daily warmup command.
