---
description: Run Stage 0 Instagram discovery to find new BuildOS-fit accounts and prepare a warmup handoff.
argument-hint: "[optional lane or focus]"
disable-model-invocation: true
---

# Instagram Discover - Stage 0 Account Discovery

You are running Instagram discovery for **@djwayne3**.

This command finds new people and accounts worth tracking. It does **not** write comments, like posts, follow accounts, DM anyone, or draft final replies.

The job is to keep the top of the relationship pipeline full:

1. Search priority lanes.
2. Score account fit.
3. Create or update profile memory.
4. Write a clean handoff for `/instagram-warmup`.
5. Mark what should be skipped so it is not rediscovered.

---

## Required Context

Read these first:

- `/docs/marketing/social-media/instagram-engagement-targets.md`
- `/docs/marketing/social-media/discovery/instagram/search-terms.md`
- `/docs/marketing/social-media/discovery/instagram/candidates.md`
- `/docs/marketing/social-media/instagram-profiles/README.md`
- `/docs/marketing/social-media/people/README.md`
- `/docs/marketing/social-media/comment-log.md`
- `/docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `/docs/marketing/social-media/instagram-voice-quick-ref.md`
- `/docs/marketing/brand/brand-guide-1-pager.md`

Also scan the last 14 days of:

- `/docs/marketing/social-media/daily-engagement/`
- `/docs/marketing/social-media/instagram-profiles/`

If an Instagram browser automation skill exists at `.claude/skills/instagram/SKILL.md`, read and follow it before interacting with Instagram.

---

## Inputs

The user can provide:

- a lane: `Solo`, `PKM`, `AI`, `Course`, `Author`, `Freelance`, `WateringHole`, `ADHD`
- a source account: `@handle`
- a search term or hashtag
- nothing

If no input is provided, run the default lane rotation:

1. `Solo`
2. `PKM`
3. `WateringHole`
4. `Author`
5. `Course`

Keep ADHD as a supporting lane only unless the user explicitly asks for it.

---

## Outputs

Update:

- `docs/marketing/social-media/discovery/instagram/candidates.md`
- `docs/marketing/social-media/discovery/instagram/search-terms.md`
- `docs/marketing/social-media/instagram-profiles/<handle>.md`
- `docs/marketing/social-media/people/<canonical-id>.md` when a cross-platform person node is warranted

Create a dated discovery run note only when the scan is substantial:

`docs/marketing/social-media/discovery/instagram/YYYY-MM-DD_discovery.md`

Do not overwrite an existing dated discovery note. Add a suffix if needed.

---

## Candidate States

Use these states consistently in `candidates.md`:

- `new` - found but not yet profiled
- `profiled` - profile exists, not yet ready for warmup
- `queued_for_warmup` - should be considered by `/instagram-warmup`
- `engaged` - a real touch happened and is logged
- `monitor` - worth watching but not an engagement target now
- `skip` - disqualified; do not resurface without a new reason

---

## Scoring

Score every candidate on three axes.

### Comment Fit (0-10)

Should DJ engage with this account's post now?

Factors:

- recent post freshness
- natural reply angle
- comment visibility
- tone match
- whether a BuildOS-adjacent thought can be shared without forcing the product

### Track Worthiness (0-10)

Is this person worth a long-term relationship?

Factors:

- audience overlap with BuildOS
- follower range and comment quality
- cross-platform presence
- creator, founder, writer, operator, PKM, or course-builder fit
- evidence of real workflow pain or real project load

### Lead Class

Pick one:

- `direct_user`
- `audience_multiplier`
- `research_lead`
- `proof_lead`
- `competitor_intel`
- `watering_hole`

---

## Workflow

### Step 1: Resolve Focus

Use the user's argument if provided. Otherwise, choose the next under-worked lane by checking recent warmup docs and `candidates.md`.

### Step 2: Search

Use the active terms in `search-terms.md`.

For each term or source account:

1. Search recent posts, reels, account recommendations, and comment sections.
2. Skip accounts already in `skip`, `engaged`, or recently reviewed states unless there is a new signal.
3. Capture accounts that show actual work, not just aesthetics or generic productivity content.

### Step 3: Score And Classify

For each candidate, capture:

- handle
- display name
- profile URL
- follower count
- lane
- lead class
- source term or source account
- recent post URL
- bio summary
- content themes
- comment quality
- Comment Fit
- Track Worthiness
- recommended state
- why this person matters
- next best action

### Step 4: Create Or Update Memory

Create or update `instagram-profiles/<handle>.md` when:

- Comment Fit >= 7
- Track Worthiness >= 7
- the account appears repeatedly
- the account is a likely direct user, audience multiplier, or proof lead
- the account is a high-value watering hole

Create or update `people/<canonical-id>.md` when:

- the person has multiple platform identities
- they are a high-value creator/founder/writer
- they are likely to become a relationship target beyond Instagram

### Step 5: Update Candidate Queue

Append or update rows in `candidates.md`.

Top candidates should be marked `queued_for_warmup` with a specific handoff:

- which post to inspect
- why now
- which angle to test
- what to avoid

Disqualified accounts should be marked `skip` with the reason.

### Step 6: Handoff

End with a concise handoff:

```text
Instagram discovery complete.

Candidates found: X
Queued for warmup: X
Profiles created/updated: X
Skip-list candidates: X
Best next command: /instagram-warmup [lane or date]
Candidate queue: docs/marketing/social-media/discovery/instagram/candidates.md
```

---

## Dated Discovery Note Template

```markdown
<!-- docs/marketing/social-media/discovery/instagram/YYYY-MM-DD_discovery.md -->

# Instagram Discovery - [Date]

**Date:** YYYY-MM-DD
**Account:** @djwayne3
**Focus:** [lane / source account / term]
**Status:** COMPLETE

---

## Summary

- **Candidates found:** X
- **Queued for warmup:** X
- **Profiles created/updated:** X
- **Terms tested:** X
- **Terms to retire or revise:** X

---

## Warmup Handoff

| Priority | Account | Lane | Lead Class | Post URL | Comment Fit | Track Worthiness | Profile | Recommended Action |
|----------|---------|------|------------|----------|-------------|------------------|---------|--------------------|
| 1 | @handle | Solo | direct_user | URL | 8 | 9 | path | Inspect in next warmup |

---

## New Candidates

| Account | Lane | Lead Class | Followers | Source | Comment Fit | Track Worthiness | State | Why |
|---------|------|------------|-----------|--------|-------------|------------------|-------|-----|
| @handle | PKM | direct_user | 4.8K | #notiontemplate | 7 | 8 | queued_for_warmup | [reason] |

---

## Skip / Retire

| Account Or Term | Reason | Action |
|-----------------|--------|--------|
| @handle | bot-bait CTA pattern | mark skip |

---

## Search-Term Notes

- [term]: [hit rate / quality / next action]
```
