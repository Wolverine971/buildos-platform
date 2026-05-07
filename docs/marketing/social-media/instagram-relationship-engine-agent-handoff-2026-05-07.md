<!-- docs/marketing/social-media/instagram-relationship-engine-agent-handoff-2026-05-07.md -->

# Instagram Relationship Engine Agent Handoff

**Date:** 2026-05-07
**Owner:** DJ
**Purpose:** Hand off the upgraded Instagram lead-generation and relationship-building workflow to an agent that can operate it, refine it, and optionally set up scheduled runs.

---

## What We Built

DJ already had a working Instagram warmup system:

- `/instagram-warmup` found posts/accounts worth engaging with.
- `/instagram-reply` drafted comments from warmup queues.
- `docs/marketing/social-media/instagram-profiles/` stored account-level intel.
- `docs/marketing/social-media/daily-engagement/` stored dated warmup and reply docs.

The gap: the system found engagement opportunities but did not fully close the loop. It did not consistently track:

- who was newly discovered
- who was worth tracking
- which drafts were posted
- which drafts went stale
- who reacted
- who should get a second touch
- when a relationship was ready for DM, deeper research, or campaign outreach

We upgraded the system into a lightweight relationship pipeline.

---

## New System Shape

The intended operating loop is:

```text
/instagram-discover
  -> fills discovery queue with new candidates

/instagram-warmup
  -> promotes the best candidates/posts into today's reply queue

/instagram-reply
  -> drafts comments and records pending touches

Manual posting by DJ
  -> DJ chooses and posts only the best comments

comment-log.md reconciliation
  -> records Posted / Skipped / Reacted / DM / Converted

/instagram-intel
  -> audits stale items, follow-ups, lane performance, and next actions
```

This turns daily engagement from a list of posts into a compounding relationship engine.

---

## Files Added Or Updated

### New Commands

- `.claude/commands/instagram-discover.md`
  - Stage 0 discovery command.
  - Finds new BuildOS-fit accounts through search terms, source accounts, and commenter mining.
  - Scores `Comment Fit`, `Track Worthiness`, and `Lead Class`.
  - Writes candidates into the discovery queue.

- `.claude/commands/instagram-profile-research.md`
  - Deep research pass for one account.
  - Updates account-level profile memory.
  - Creates a cross-platform person node only when warranted.

- `.claude/commands/instagram-intel.md`
  - Pipeline audit command.
  - Finds stale drafts, pending queues, follow-up opportunities, accounts ready for DM, and lanes that are working or failing.

### New Data Files

- `docs/marketing/social-media/discovery/instagram/search-terms.md`
  - Search-term queue for discovery.
  - Tracks active, testing, retired, and skipped terms.

- `docs/marketing/social-media/discovery/instagram/candidates.md`
  - Stage 0 candidate queue.
  - `/instagram-discover` writes here.
  - `/instagram-warmup` reads from here.

- `docs/marketing/social-media/comment-log.md`
  - Cross-run touchpoint ledger.
  - Tracks `Queued`, `Drafted`, `Posted`, `Skipped`, `Reacted`, `DM Sent`, and `Converted`.
  - Seeded with the May 6 PM draft backlog and May 7 warmup queue.

- `docs/marketing/social-media/people/README.md`
  - Explains cross-platform person records.

- `docs/marketing/social-media/people/_template.md`
  - Template for high-value people who matter beyond Instagram.

### Updated Existing Files

- `.claude/commands/instagram-warmup.md`
  - Now reads the discovery candidate queue before scanning from scratch.
  - Now checks `comment-log.md` for stale or duplicate touches.
  - Captures lead class and ladder stage.

- `.claude/commands/instagram-reply.md`
  - Now writes drafted rows into `comment-log.md`.
  - Now updates the ledger when DJ confirms `Posted` or `Skipped`.
  - Now advances relationship ladder state after confirmed posting.

- `docs/marketing/social-media/instagram-profiles/_template.md`
  - Added canonical person ID, lane, lead class, ladder stage, next action, and ledger links.

- `docs/marketing/social-media/instagram-profiles/README.md`
  - Documents the relationship between profiles, candidates, people nodes, and the comment ledger.

- `docs/marketing/social-media/README.md`
  - Points agents to discovery, comment log, profile memory, and people graph.

- `docs/marketing/social-media/daily-engagement/README.md`
  - Clarifies that daily engagement docs are working files, not the long-term source of truth.

---

## Core Concepts

### Discovery Candidate

A potential account or person found by `/instagram-discover`.

States:

- `new`
- `profiled`
- `queued_for_warmup`
- `engaged`
- `monitor`
- `skip`

### Comment Fit

0-10 score for whether DJ should engage with a specific account/post now.

Factors:

- freshness
- natural reply angle
- comment visibility
- tone match
- whether a BuildOS-adjacent thought can fit without forcing the product

### Track Worthiness

0-10 score for whether this person/account is worth a long-term relationship.

Factors:

- audience overlap with BuildOS
- follower range and comment quality
- cross-platform presence
- creator/founder/writer/operator/PKM/course-builder fit
- evidence of real workflow pain or real project load

### Lead Class

Use one:

- `direct_user`
- `audience_multiplier`
- `research_lead`
- `proof_lead`
- `competitor_intel`
- `watering_hole`

### Ladder Stage

Use one:

- `stage_0_discovered`
- `stage_1_reviewed`
- `stage_2_queued`
- `stage_3_commented_once`
- `stage_4_visible_presence`
- `stage_5_dm_ready`
- `stage_6_dm_sent`
- `stage_7_activated`
- `stage_-1_cold_or_skip`

Do not advance ladder state unless a real action is confirmed in `comment-log.md` or a profile relationship history row.

---

## Immediate Next Moves

The next agent should operate the loop, not write another strategy doc.

### Step 1: Reconcile Current Backlog

Run or emulate:

```text
/instagram-intel
```

Goal:

- identify every `Drafted - Pending Posting` item
- identify stale queue items
- identify duplicate touches
- recommend what DJ should post, skip, or archive

Primary files:

- `docs/marketing/social-media/comment-log.md`
- `docs/marketing/social-media/daily-engagement/2026-05-06_instagram-replies-pm.md`
- `docs/marketing/social-media/daily-engagement/2026-05-07_instagram-warmup.md`
- related files in `docs/marketing/social-media/instagram-profiles/`

Expected output:

- short list of comments worth posting now
- short list to skip
- ledger updates for skipped/stale items

### Step 2: Generate Fresh Candidates

Run one of:

```text
/instagram-discover Solo
/instagram-discover PKM
```

Recommendation: start with `PKM` if the current queue is heavy on founder/author targets, or `Solo` if the candidate queue is empty.

Goal:

- add fresh candidates to `discovery/instagram/candidates.md`
- create or update profiles for high-fit accounts
- mark low-quality accounts `skip`
- update `search-terms.md` with term quality notes

### Step 3: Promote Best Candidates Into Warmup

Run:

```text
/instagram-warmup
```

Goal:

- inspect `queued_for_warmup` candidates first
- scan live Instagram surfaces next
- produce 5-7 high-quality opportunities
- enforce lane balance
- avoid duplicate pending posts

### Step 4: Draft Replies

Run:

```text
/instagram-reply
```

Goal:

- draft 2-3 options per selected opportunity
- update account profiles with `Drafted` rows
- update `comment-log.md` with `Drafted` rows

### Step 5: Manual Posting

Important: do not automate posting comments.

DJ should manually choose and post only the best comments. Then DJ should report what happened:

```text
Posted option 2 on @handle
Skipped @otherhandle
@thirdhandle liked the comment
```

The agent should then update:

- reply doc
- account profile
- `comment-log.md`
- candidate state
- ladder stage

---

## Recommended Cron / Automation Plan

Do not schedule automated posting. Schedule only read/research/audit work and handoff docs.

### Safe To Automate

- discovery scans
- stale queue audits
- profile refresh suggestions
- weekly lane performance review
- reminder docs listing what DJ should manually post or reconcile

### Not Safe To Automate

- posting comments
- liking posts
- following accounts
- sending DMs
- changing relationship stage without evidence

### Suggested Cron Schedule

Use local cron, Codex automations, GitHub Actions, or another scheduler, depending on where the command runner lives.

Recommended schedule:

```text
Daily 8:00 AM ET
  Run /instagram-intel
  Purpose: show stale drafts, pending posting, and urgent follow-ups.

Daily 8:30 AM ET
  Run /instagram-discover with rotating lanes:
    Monday: Solo
    Tuesday: PKM
    Wednesday: Author
    Thursday: Course
    Friday: WateringHole
  Purpose: keep candidates.md fresh.

Daily 11:00 AM ET
  Run /instagram-warmup
  Purpose: create the day's reply queue.

Manual after warmup
  DJ reviews /instagram-reply output and posts selected comments.

Friday 3:00 PM ET
  Run /instagram-intel weekly review
  Purpose: summarize lane performance, reactions, stale profiles, and next week's focus.
```

### Cron Output Requirements

Every scheduled run should write a dated file or update an existing queue. It should not just print terminal output.

Suggested output files:

- discovery runs:
  - `docs/marketing/social-media/discovery/instagram/YYYY-MM-DD_discovery.md`

- intel audits:
  - `docs/marketing/social-media/instagram/YYYY-MM-DD_intel.md`

- warmup runs:
  - `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup.md`

### Automation Guardrails

Any automation runner must:

- read `comment-log.md` before suggesting engagement
- never re-queue a post already drafted or posted
- mark stale candidates as `monitor` or `skip`
- never engage from a browser session without explicit DJ approval
- never claim a relationship advanced unless the ledger proves it
- keep ADHD as a supporting lane, not the default lane

---

## What Success Looks Like

After 1-2 weeks, the system should answer:

- which Instagram lane is producing the best people
- which comments got reactions
- which relationships are warming up
- which accounts are stale or over-touched
- which people are ready for DM or research outreach
- which discovery terms should be amplified or retired

The end state is not "more comments." The end state is a visible relationship pipeline:

```text
discovered -> reviewed -> queued -> drafted -> posted -> reacted -> DM/research/user/proof
```

---

## First Assignment For The Next Agent

Start here:

```text
Read this handoff.
Read comment-log.md.
Read 2026-05-06_instagram-replies-pm.md.
Read 2026-05-07_instagram-warmup.md.
Run /instagram-intel logic manually if command execution is unavailable.

Then produce:
1. a reconciliation list for DJ
2. updates to comment-log.md for stale/skipped items
3. a recommendation for whether the next discovery run should be Solo or PKM
4. a cron implementation plan appropriate to the available runner
```

Do not build a second system. Use the files above as the source of truth.
