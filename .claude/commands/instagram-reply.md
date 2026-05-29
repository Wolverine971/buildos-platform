---
description: Draft Instagram replies from a queued warmup document using BuildOS voice and relationship context.
argument-hint: "[warmup-file]"
disable-model-invocation: true
path: .claude/commands/instagram-reply.md
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
- `/docs/marketing/social-media/comment-log.md`
- `/docs/marketing/social-media/discovery/instagram/candidates.md`
- `/docs/marketing/social-media/people/README.md`

Then read the account profile for every queued account listed in the warmup doc.

If an Instagram browser automation skill exists at `.claude/skills/instagram/SKILL.md`, read and follow it before interacting with Instagram. The account-switching workflow in `references/workflows.md` is required, not optional.

---

## Command Boundary

`/instagram-reply` should:

1. Read the reply queue from the warmup doc.
2. Read each queued account profile.
3. Draft 2-3 reply options per queued post.
4. Avoid repeating old angles or phrasing from past interactions.
5. Write a separate replies doc.
6. Update account histories with `Drafted` notes.
7. Add or update `Drafted` rows in `docs/marketing/social-media/comment-log.md`.
8. If the user confirms actual posting, record the exact comment, mark it `Posted`, and update ladder state.

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
3. **Match the comment posture to the relationship state.** A stranger gets a real question or a genuine cheer — not a founder lesson. Lived moments only earn their place when there's already some relationship or when the lived moment is genuinely small and not wrapped in a takeaway.
4. Sound like a real person texting on their phone — lowercase-friendly, short, specific to one thing in the post.
5. Match the author's tone, vocabulary, and emotional energy.
6. Add one sharp observation OR one real question OR one specific cheer — never a mini-essay, never a thesis.

### Mode Selection (relationship-driven)

The mode you pick depends on the relationship state, not on a "mix it up" quota.

**No relationship / first-ever touch (most common case for new accounts):**

The strongest opener is almost always one of:

- **Real question:** Something you genuinely want to know about how they think or what they actually said. Questions invite a response, which is the actual goal of a first touch. Example: _"genuinely curious — do you optimize for your own taste or for what your audience seems to want? feel like those pull in opposite directions"_
- **Specific cheer:** Short, specific, no thesis attached. Example: _"11 films, 100+ awards, none compromised. quietly insane résumé."_
- **Tiny lived moment, no takeaway:** Only if the moment is small, specific, and doesn't end in a wrapped lesson. Example: _"rewrote my onboarding flow 5 times last year. each version felt right when i shipped it. only the 5th made people actually finish."_ — works because there's no "this is what most people miss" cap on it.

**Some relationship (already commented, exchanged a like/reply, or DJ has a documented past touchpoint):**

- Lived moments and soft "thinking environment" / "context" / "project memory" language earn more room.
- Continuity is welcome — reference (without mirroring) what you've talked about before.
- Still no thesis wrappers, still no founder bio dumps.

**Commenter mining (replying to a commenter on a watering hole, not the principal):**

- Lead with a real reaction + question whenever possible. The question earns elaboration, which is the mining signal.
- Or: a warm peer reaction ("oh same, this got me too — anything actually helping for you?")
- Never relay the principal's framing back at the commenter.
- Never mention BuildOS on a first mining pass.

### Banned Patterns (these read as thought-leader posture, hated by user)

Do not write any of these constructions:

- **"X is the part / thing / moat / trap / question"** — sounds like a LinkedIn opener. Examples to never produce:
  - "the iteration is the actual moat"
  - "this is the trap"
  - "the X is the thing"
  - "the rhythm thing only shows up when…"
- **"that's what most people miss / skip past / don't understand / get wrong"** — generic thought-leader framing. Hated.
- **"X is the part i keep relearning"** / **"i have to keep reminding myself X"** — formulaic. Hated.
- **"X hits different"** as a reframe of the creator's point — sounds polished and LinkedIn-y when used as a reframe.
- **Tidy aphorisms at the end of a comment** ("the absence feels louder than the criticism ever could," "the best corrections don't feel good in the moment").
- **Analyzing the subject from a distance** ("Sullivan sounds like someone who knew exactly what he was doing").
- **A "founder version" wrapper on every emotional topic.**
- **Stacking a founder bio into a comment.**
- **Generic praise:** "love this," "so true," "fire content," "100%," "this is gold."

If a draft uses any of those constructions, it's wrong — rewrite it.

### Pre-Send Gut Check

Before recording any draft, ask:

1. **Does this sound like a doc?** If yes, cut. Real comments are typed on a phone.
2. **Am I dropping a founder lesson on a stranger?** If there's no relationship and the comment ends in a wrapped takeaway, replace it with a real question or a genuine cheer.
3. **Did I co-sign the creator first, or did I jump straight to my reframe?** Validate or react first. Then add one real thing if you have one. Then stop.
4. **Is there a banned pattern in here?** (See list above.) If so, rewrite.
5. **Could a brand account have written this?** If yes, cut.

### Constraints

- 1-2 sentences preferred, 3 max.
- A good comment can be one sentence — don't pad.
- Lowercase-friendly is fine (often better).
- No hashtags.
- Minimal emoji, only if natural to the post's tone.
- Never sound like a brand account pretending to be a person.

### BuildOS-Specific Guardrails

- On ADHD struggle posts, default to **Level 0**.
- On emotional or mental-health posts, do not force a systems/product angle.
- On builder or tool-frustration posts, a soft BuildOS-adjacent angle may fit at **Level 1**.
- Only use **Level 2** when the post is explicitly about the exact problem BuildOS solves AND there's at least some relationship — never Level 2 on a first-ever touch.
- If you mention BuildOS, do it transparently and casually.

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
3. **Determine the relationship state** explicitly: _no relationship_, _some relationship_, or _commenter mining_. Record it in the draft so the mode selection is auditable.
4. Check `comment-log.md` for duplicate pending or posted touches.
5. Note repetition risks.
6. Draft 2-3 comment options using the mode picker rules. For _no relationship_ items, **at least one option must be a real question**.
7. Run the **Pre-Send Gut Check** on every option before recording it. If a draft uses any banned pattern, rewrite it before saving — do not record bad drafts and "let the user pick."
8. Update the replies doc immediately.
9. Add a `Drafted` row to the account profile history if one does not already exist for this post.
10. Add or update a matching `Drafted` row in `comment-log.md`.

## Step 4: Record Execution State

If the user has not confirmed posting yet:

- Mark each item `Drafted - Pending Posting`
- Add a short reconciliation checklist so the next pass can mark each item `Posted`, `Skipped`, or `Still pending`
- Keep the related `comment-log.md` row at `Drafted`

If the user confirms a specific comment was posted:

- Record the exact comment in the replies doc
- Update the account profile history to `Posted`
- Update `Last Engaged` and any open loops
- Update the matching `comment-log.md` row to `Posted`
- Advance ladder state from `stage_2_queued` to `stage_3_commented_once`, or from `stage_3_commented_once` to `stage_4_visible_presence` if this is a repeated confirmed touch
- If the account exists in `discovery/instagram/candidates.md`, update its state to `engaged`

If the user confirms a reply was skipped:

- Mark it `Skipped` in the replies doc
- Update the account profile row to `Skipped`
- Update the matching `comment-log.md` row to `Skipped`
- If the candidate should not resurface, update `candidates.md` to `monitor` or `skip` with a reason

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

**Suggested Comment Option 1 (mode: [question | lived moment | cheer] - [angle]):**

> [comment]

**Suggested Comment Option 2 (mode: [question | lived moment | cheer] - [angle]):**

> [comment]

**Suggested Comment Option 3 (mode: [question | lived moment | cheer] - [angle]):**

> [comment]

> **Mode picker:**
>
> - **No relationship:** lead with at least one **question** option. Add a small **lived moment** without a takeaway and/or a specific **cheer**.
> - **Some relationship:** lived moments earn more room; continuity is welcome.
> - **Commenter mining:** lead with reaction + question. Never relay the principal's framing back.
> - Never produce three "lived moment with a takeaway wrapper" options. That's the failure mode.

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

## Loop Updates

| Account | Comment Log | Candidate Queue | Ladder Update |
|---------|-------------|-----------------|---------------|
| @handle | Added Drafted row | queued_for_warmup unchanged | stage_2_queued |
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
