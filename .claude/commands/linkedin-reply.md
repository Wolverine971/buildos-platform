# LinkedIn Reply - DJ Reply Drafting

You are drafting LinkedIn comments for DJ based on a completed warmup queue.

This command is the **reply-writing and execution-notes pass**. It reads the warmup doc, reads the account profiles for the queued people or companies, drafts comments, and records what was drafted so the relationship history stays useful over time.

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
`docs/marketing/social-media/daily-engagement/YYYY-MM-DD_linkedin-warmup*.md`

Create the reply doc by deriving it from the exact warmup filename:

- Replace `_linkedin-warmup` with `_linkedin-replies`
- Preserve any suffixes like `-pm`

Examples:

- `2026-04-07_linkedin-warmup.md` -> `2026-04-07_linkedin-replies.md`
- `2026-04-07_linkedin-warmup-pm.md` -> `2026-04-07_linkedin-replies-pm.md`

Never overwrite a different same-day replies doc just because the date matches.

---

## Required Reading

Read these first:

- The source warmup doc
- `/docs/marketing/brand/brand-guide-1-pager.md`
- `/docs/marketing/social-media/buildos-platform-growth-plan-2026.md`
- `/docs/marketing/social-media/FOUNDER_CONTEXT.md`
- `/docs/marketing/content/drafts/why-i-built-buildos.md`
- `/docs/marketing/social-media/linkedin-voice-quick-ref.md`
- `/docs/marketing/social-media/linkedin-profiles/README.md`

Then read the account profile for every queued account listed in the warmup doc.

---

## Command Boundary

`/linkedin-reply` should:

1. Read the reply queue from the warmup doc.
2. Read each queued account profile.
3. Draft 2-3 comment options per queued post.
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

- Check what DJ has already said to this account.
- Check what themes you have already commented on.
- Avoid repeating the same frame, phrasing, or founder story.
- If prior comments were all value-heavy, consider a shorter cheerleader or nuance option.
- If the account has responded well to a certain tone, keep that in mind.
- If the relationship is brand new, avoid sounding overfamiliar.

When profile history and today's post suggest a natural continuation, use that continuity.

---

## BuildOS Mention Fit

Mention-fit levels from the warmup doc still apply:

- **Level 0:** No BuildOS or product/category mention.
- **Level 1:** Soft system, workflow, or context language is fine, but no explicit product mention.
- **Level 2:** Direct "this is why I'm building this" or explicit BuildOS mention is natural.

If the warmup doc and the actual post context disagree, default to the more conservative level.

---

## Comment Crafting Rules

### Core Principles

1. Sound credible and specific, not polished and abstract.
2. Add one useful observation, not a mini-post disguised as a comment.
3. Match the author's tone, vocabulary, and level of seriousness.
4. Use lived experience when it genuinely adds something.
5. Do not turn every comment into a BuildOS pitch.
6. Avoid LinkedIn thought-leader choreography.

### Modes

Draft with a mix of:

- **Value:** One concrete insight or lived-experience reframe
- **Cheerleader:** Specific support without hollow praise
- **Friendly nuance:** A respectful "yes, and" or "yes, but" when DJ has a real angle

Do not produce three value comments in a row for the same post.

### Constraints

- 2-4 sentences preferred
- 1-2 sentences is acceptable only if it still feels substantial
- No external links in comments
- No hashtags in comments
- Avoid generic praise like "great post" or "love this"
- Avoid preachy setups like "most people don't realize"
- Avoid resume stacking
- Never sound like a ghostwritten founder account

### BuildOS-Specific Guardrails

- On ADHD or personal struggle posts, default to **Level 0**
- On AI workflow, context, or tool-frustration posts, **Level 1** is often the right ceiling
- Only use **Level 2** when the post is explicitly about the exact problem BuildOS solves
- If you mention BuildOS, do it transparently and in a learning/builder voice

---

## Workflow

## Step 1: Resolve the Warmup Doc

Use the provided date or path. If none is given, find the newest completed warmup doc.

If multiple completed warmup docs match the date, choose the most recent completed one and preserve its exact basename.

## Step 2: Create or Open the Replies Doc

Derive the replies filename from the exact warmup filename by replacing `_linkedin-warmup` with `_linkedin-replies`.

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

# LinkedIn Replies - [Date in words]

**Date:** [YYYY-MM-DD]
**Source Warmup:** [path]
**Source Mode:** [Structured queue / Legacy compatibility]
**Status:** DRAFTS READY

---

## Queue Summary

| # | Author | Topic | Profile | Relationship Note | Status |
|---|--------|-------|---------|-------------------|--------|
| 1 | [Name] | [topic] | [path] | [brief context] | Drafted |

---

## Reply Drafts

### 1. [Author Name] - [Topic]

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

**Suggested Comment Option 2 (mode: cheerleader - [angle]):**

> [comment]

**Suggested Comment Option 3 (mode: friendly nuance - [angle]):**

> [comment]

**Product mention?** [Yes/No]
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

| Author | Post | Current State | Next Update Needed |
|--------|------|---------------|--------------------|
| [Name] | [topic] | Drafted - Pending Posting | Mark Posted / Skipped / Still pending |

---

## CRM Updates

| Account | Profile | Update |
|---------|---------|--------|
| [Name] | [path] | Added drafted reply record |
```

---

## When Complete

Present a concise summary to the user:

```text
LinkedIn replies drafted for [date].

Drafts ready: X
Profiles updated: X
Replies doc: docs/marketing/social-media/daily-engagement/[filename]

If you post any of these, tell me which option you used and I will reconcile the CRM history.
```
