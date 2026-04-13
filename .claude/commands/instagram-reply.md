---
description: Draft Instagram replies from a queued warmup document using BuildOS voice and relationship context.
argument-hint: "[warmup-file]"
disable-model-invocation: true
---

# Instagram Reply - @djwayne3 Reply Drafting

You are drafting Instagram replies for **@djwayne3** based on a completed warmup queue.

This command is the **reply-writing and execution-notes pass**. It reads the warmup doc, reads the account profiles for the queued accounts, drafts comments, and records what was drafted so the relationship history stays useful over time.

If the user later confirms which replies were actually posted, update the related docs and account profiles from `Drafted` to `Posted`.

---

## Input

The user can provide:

- A date like `2026-04-07`
- A warmup doc path
- Nothing

If no argument is provided, use the newest completed warmup doc in:
`docs/marketing/social-media/daily-engagement/`

Resolution rules:

1. Prefer a completed warmup doc that already contains a `Reply Queue`.
2. If there are multiple completed warmups for the same date, use the most recent completed file, not the first alphabetically.
3. Ignore files still marked `STAGE 1 IN PROGRESS`.
4. If no structured warmup exists, fall back to the newest completed legacy warmup doc and enter legacy compatibility mode.

The source warmup doc should be:
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_instagram-warmup*.md`

Create the reply doc by deriving it from the exact warmup filename:

- Replace `_instagram-warmup` with `_instagram-replies`
- Preserve any suffixes like `-pm`

Examples:

- `2026-04-07_instagram-warmup.md` -> `2026-04-07_instagram-replies.md`
- `2026-04-07_instagram-warmup-pm.md` -> `2026-04-07_instagram-replies-pm.md`

Never overwrite a different same-day replies doc just because the date matches.

---

## Required Reading

Read these first:

- The source warmup doc
- `/docs/marketing/brand/brand-guide-1-pager.md`
- `/docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `/docs/marketing/social-media/FOUNDER_CONTEXT.md`
- `/docs/marketing/content/drafts/why-i-built-buildos.md`
- `/docs/marketing/social-media/instagram-voice-quick-ref.md`
- `/docs/marketing/social-media/instagram-profiles/README.md`

Then read the account profile for every queued account listed in the warmup doc.

---

## Command Boundary

`/instagram-reply` should:

1. Read the reply queue from the warmup doc.
2. Read each queued account profile.
3. Draft 2-3 reply options per queued post.
4. Avoid repeating old angles or phrasing from past interactions.
5. Write a separate replies doc.
6. Update account histories with `Drafted` notes.
7. If the user confirms actual posting, record the exact comment and mark it `Posted`.

If the warmup doc is a legacy doc without a `Reply Queue`, convert it into a working queue first using legacy compatibility mode.

Do not change the warmup sourcing decisions unless there is a clear error.

---

## Memory-Aware Reply Rules

Treat the account profile like a mini CRM before you draft anything.

For each queued post:

- Check what `@djwayne3` has already said to this account.
- Check what themes you have already commented on.
- Avoid repeating the same reframe, phrasing, or emotional posture.
- If prior comments were all value-heavy, consider a lighter or more casual option.
- If the account has responded well to a certain tone, keep that in mind.
- If the relationship is brand new, avoid sounding overfamiliar.

When profile history and today's post suggest a natural continuation, use that continuity.

---

## BuildOS Mention Fit

Mention-fit levels from the warmup doc still apply:

- **Level 0:** No BuildOS or product/category mention.
- **Level 1:** Soft workflow, system, or context language is fine, but no explicit product mention.
- **Level 2:** Direct "this is why I'm building this" or explicit BuildOS mention is natural.

If the warmup doc and the actual post context disagree, default to the more conservative level.

---

## Comment Crafting Rules

### Core Principles

1. Most comments should not mention BuildOS.
2. Be a community member first, not a marketer in the comments.
3. Add one sharp observation, not a mini-essay.
4. Match the author's tone, vocabulary, and emotional energy.
5. Keep comments short enough to feel typed on a phone.
6. Sound like a real person, not a polished caption generator.

### Modes

Draft with a mix of:

- **Value:** One concrete insight or lived-experience reframe
- **Cheerleader:** Pure energy, quick and specific
- **Casual:** Human, present, lightly personal

Do not produce three value comments in a row for the same post.

### Constraints

- 1-2 sentences preferred, 3 max
- No hashtags
- Minimal emoji, only if natural
- Avoid generic praise like "love this" or "so true"
- Avoid preachy phrasing
- Avoid stacking your whole founder bio into a comment
- Never sound like a brand account pretending to be a person

### BuildOS-Specific Guardrails

- On ADHD struggle posts, default to **Level 0**
- On emotional or mental-health posts, do not force a systems/product angle
- On builder or tool-frustration posts, a soft BuildOS-adjacent angle may fit at **Level 1**
- Only use **Level 2** when the post is explicitly about the exact problem BuildOS solves
- If you mention BuildOS, do it transparently and casually

---

## Workflow

## Step 1: Resolve the Warmup Doc

Use the provided date or path. If none is given, find the newest completed warmup doc.

If multiple completed warmup docs match the date, choose the most recent completed one and preserve its exact basename.

## Step 2: Create or Open the Replies Doc

Derive the replies filename from the exact warmup filename by replacing `_instagram-warmup` with `_instagram-replies`.

If the replies doc already exists, update it in place instead of overwriting it.

## Step 2A: Reconcile Existing Draft State

If a replies doc already exists for this warmup:

1. Read it before drafting anything new.
2. Find any items still marked `Drafted - Pending Posting`.
3. Preserve those items and add a `Reconciliation Needed` section if actual posting status is still unknown.
4. Never silently duplicate or replace earlier drafts.

## Step 2B: Legacy Compatibility Mode

If the source warmup doc does not contain a `Reply Queue`, treat it as a legacy warmup doc.

In legacy mode:

1. Read the `Priority Summary` and `Post Opportunities` sections.
2. Extract the top 3-5 opportunities from the legacy doc.
3. Use the post details to build a temporary queue.
4. Create or update account profiles for those accounts if needed.
5. Note clearly in the replies doc that the queue was reconstructed from a legacy warmup file.

## Step 3: Draft Per Queued Opportunity

For each queued item:

1. Read the account profile.
2. Pull the relationship intel and past touchpoints.
3. Note repetition risks.
4. Draft 2-3 comment options with different modes.
5. Update the replies doc immediately.
6. Add a `Drafted` row to the account profile history if one does not already exist for this post.

## Step 4: Record Execution State

If the user has not confirmed posting yet:

- Mark each item `Drafted - Pending Posting`
- Add a short reconciliation checklist so the next pass can mark each item `Posted`, `Skipped`, or `Still pending`

If the user confirms a specific comment was posted:

- Record the exact comment in the replies doc
- Update the account profile history to `Posted`
- Update `Last Engaged` and any open loops

---

## Reply Doc Template

Use this structure:

```markdown
<!-- docs/marketing/social-media/daily-engagement/<derived replies filename>.md -->

# Instagram Replies - [Date in words]

**Date:** [YYYY-MM-DD]
**Account:** @djwayne3
**Source Warmup:** [path]
**Source Mode:** [Structured queue / Legacy compatibility]
**Status:** DRAFTS READY

---

## Queue Summary

| # | Account | Topic | Profile | Relationship Note | Status |
|---|---------|-------|---------|-------------------|--------|
| 1 | @handle | [topic] | [path] | [brief context] | Drafted |

---

## Reply Drafts

### 1. @handle - [Topic]

**Post Link:** [URL]
**Profile File:** [path]
**BuildOS Mention Fit:** [0/1/2]

**Relationship Intel:**

- [summary]
- [last touchpoint]

**Do Not Repeat:**

- [previous angle or phrasing to avoid]

**Suggested Comment Option 1 (mode: value - [angle]):**

> [comment]

**Suggested Comment Option 2 (mode: casual - [angle]):**

> [comment]

**Suggested Comment Option 3 (mode: cheerleader - [angle]):**

> [comment]

**Product mention?** [Yes/No]
**Story reply opportunity?** [Yes/No]
**Execution Status:** Drafted - Pending Posting
**If Posted, Record Exact Comment Here:** Pending

---

## Execution Plan

- **Recommended order:** [1 -> 2 -> 3]
- **Timing window:** [when to post]
- **Spacing:** [recommended delay between comments]
- **Product mention rules:** [if any]
- **Follow-up opportunities:** [if any]

---

## Reconciliation Needed

| Account | Post | Current State | Next Update Needed |
|---------|------|---------------|--------------------|
| @handle | [topic] | Drafted - Pending Posting | Mark Posted / Skipped / Still pending |

---

## CRM Updates

| Account | Profile | Update |
|---------|---------|--------|
| @handle | [path] | Added drafted reply record |
```

---

## When Complete

Present a concise summary to the user:

```text
Instagram replies drafted for [date].

Drafts ready: X
Profiles updated: X
Replies doc: docs/marketing/social-media/daily-engagement/[filename]

If you post any of these, tell me which option you used and I will reconcile the CRM history.
```
