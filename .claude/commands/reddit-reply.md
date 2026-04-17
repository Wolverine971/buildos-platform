---
description: Draft Reddit comments from a Stage 1 warmup doc using the reply strategy's voice rails, per-sub rules, and the 95/5 product-mention discipline.
argument-hint: "[warmup-file]"
disable-model-invocation: true
---

# Reddit Reply — Stage 2 Comment Drafting

You are drafting Reddit comments for BuildOS based on a completed `/reddit-warmup` Stage 1 doc.

This is the **reply-writing + execution-notes pass** of the two-stage Reddit flow:

1. **Stage 1 — `/reddit-warmup`** — sources threads, scores them, opens tabs, updates the tracker.
2. **Stage 2 — `/reddit-reply` (this command)** — reads the Stage 1 queue, reads the reply strategy, reads each queued sub's profile + rules, drafts comments, and runs every draft through the strategy's quality gate.

Reddit is the strictest platform BuildOS operates on: 80%+ of SaaS companies get banned inside 30 days for violating the 90/10 rule. **This command's default posture is "don't post it unless every rail holds."** A comment you delete is a comment that didn't cost trust.

If the user later confirms which drafts they actually posted, update the related docs and the relevant sub's profile `Notes log` from `Drafted` to `Posted`.

---

## Input

The user can provide:

- A date like `2026-04-17`
- A warmup doc path
- Nothing

If no argument is provided, use the newest completed warmup doc in:
`docs/marketing/social-media/daily-engagement/`

Resolution rules:

1. Prefer a warmup doc marked `STAGE 1 COMPLETE`.
2. If there are multiple completed warmups for the same date, use the most recent completed file, not the first alphabetically.
3. Ignore files still marked `STAGE 1 IN PROGRESS`.
4. The source warmup doc should match `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup*.md`.

Create the reply doc by deriving it from the exact warmup filename:

- Replace `_reddit-warmup` with `_reddit-replies`
- Preserve any suffixes like `-pm`, `-night`

Examples:

- `2026-04-17_reddit-warmup.md` → `2026-04-17_reddit-replies.md`
- `2026-04-17_reddit-warmup-pm.md` → `2026-04-17_reddit-replies-pm.md`

Never overwrite a different same-day replies doc just because the date matches.

---

## Required Reading (Load These First, In Order)

The order matters — strategy sets the rails, tracker flags the canaries, profiles calibrate voice per sub.

1. **The source warmup doc** — the Stage 1 priority list + constraints already captured per thread.
2. **`/docs/marketing/social-media/reddit/reddit-reply-strategy.md`** — voice + angle + decision rails. Non-negotiable.
3. **`/docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`** — sanctioned-surface cadence, AI-hard-ban list, cultural canaries, per-sub rule summaries.
4. **`/docs/marketing/brand/brand-guide-1-pager.md`** — terms to use / avoid, especially the "avoid at first contact" list.
5. **`/docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`** — why we don't lead with AI.
6. **Per-sub profiles** — read the profile for every sub that has a thread in the Stage 1 queue:
   `/docs/marketing/social-media/reddit/subreddit-profiles/<sub>.md`
   Load **all of them** before drafting — voice calibration is per-sub, and skipping this step will produce outsider-sounding drafts.

Do not skip any of the above. Reddit's per-sub culture is specific enough that cross-loading between subs is the most common failure mode.

---

## Command Boundary

`/reddit-reply` should:

1. Read the prioritized thread list from the Stage 1 warmup doc.
2. For every thread, re-verify: the sub's AI-hard-ban status, sanctioned-surface status, and cultural canary signal.
3. For every thread, classify the engagement mode using the strategy's 4 patterns (A, B, C, D).
4. Draft 2–3 comment options per thread using the assigned pattern plus one alternate.
5. Run every draft through the 7-question quality gate. Flag any draft that fails a gate.
6. Produce a **Skip Recommendation** section for any queued thread where the gates say "don't post."
7. Write a standalone replies doc.
8. Append a `Drafted` entry to the `Notes log` of each sub's profile.
9. If the user confirms a specific comment was actually posted, record the exact text, update the sub profile's `Notes log` to `Posted`, and log any reply reactions we can observe.

`/reddit-reply` should **not**:

- Relax the strategy's 95/5 rule. If the thread is not a sanctioned surface and the OP hasn't explicitly asked for a tool recommendation in a rule-permissive sub, the draft mention level is Level 0.
- Produce a "soft" BuildOS mention. On Reddit, soft = stealth = ban-adjacent.
- Draft replies for sub/thread combinations that violate hard-ban rules (e.g., a BuildOS-mention draft for r/ADHD, r/productivity, r/getdisciplined, or r/ExperiencedDevs).
- Post anything. Drafting only. Posting is manual and human-confirmed.

---

## The Reddit Mention Level System

Reddit mention-fit is stricter than Instagram/LinkedIn. Use this mapping:

- **Level 0 — no mention.** The vast majority of all drafts. Pure craft / peer / empathy comment. No BuildOS, no "a tool I built," no soft workflow-language-that-points-to-BuildOS. Use in: all threads in AI-hard-ban subs, all empathy threads, all r/ADHD / r/productivity / r/getdisciplined / r/ExperiencedDevs threads, and all non-sanctioned threads outside those subs by default.
- **Level 1 — workflow language only.** Generic workflow / system / project-home language is fine, still no explicit BuildOS mention. Use when: the sub's profile permits Level 1 phrasing in this thread type AND the AI-hard-ban list says we can describe the behaviour without AI-as-noun. Example: "I keep a running consistency log tied to scene IDs" — that's Level 1 because it describes workflow without naming BuildOS.
- **Level 2 — explicit founder-disclosed BuildOS mention.** Reserved for sanctioned surfaces per the tracker: Sunday Tool Thread (r/writing), fortnightly Self-promo (r/Notion), Wednesday Product Thread (r/podcasting), Monthly Tool thread (r/VideoEditing), Weekly Self-Promo (r/selfpublish, r/Newsletters), self-promotion-flaired post (r/Substack), IAmA/case-study format (r/solopreneur), non-disruptive-ads-with-context (r/worldbuilding Rule 7 — but only in tool-question threads with real worldbuilding content from DJ). Disclosure is the first five words. Exact script is in the strategy doc.

Default to the **more conservative level** if there's any ambiguity between the warmup doc's assignment and what the actual thread + sub context supports when you read it.

**If a thread in the Stage 1 queue was marked "Comment-only" by warmup but you think Level 2 is now available based on closer read** — do NOT upgrade it without reviewing the sub's rules in the profile. Downgrades are allowed; upgrades require the sub's profile to explicitly sanction the surface.

---

## Pattern Library (From Reply Strategy)

Draft comments using these four patterns. Pick the one that fits the thread; alternate options in a single draft set should use different patterns.

**Pattern A — Validation + One Lived Detail.**
For empathy, overwhelm, "is this normal?" threads. 1–3 sentences. Validates OP's feeling, adds one specific concrete detail from DJ's own work. No solution, no pitch. Level 0.

**Pattern B — Specific Process From Your Own Work.**
For "how do you do X?" threads where DJ has actual lived process. 3–6 sentences. Names the specific problem → describes the process change in short sentences → ends on the honest limitation ("still fails when..."). Level 0 in non-sanctioned surfaces; Level 1 when workflow language is permissible.

**Pattern C — Genuine Craft Question Back.**
For threads where DJ doesn't have a strong take but the framing is interesting. 1–2 sentences. One line of acknowledgment + one specific craft question that extends the thread. Level 0. Great for low-effort daily karma.

**Pattern D — Sanctioned-Surface Founder Mention.**
For Sunday Tool thread, fortnightly self-promo, monthly tool thread, IAmA/case-study format, or Rule-7-permissive tool-question threads where the asker has described a workflow BuildOS solves. 4–7 sentences. Full founder disclosure in first five words → specific match to the asker's problem → explicit mention of what BuildOS does NOT replace → honest limitation. Level 2.

Every reply draft must declare its pattern + level. If you can't pick a pattern, the thread is probably a skip.

---

## Per-Draft Quality Gate (The 7 Questions)

Run every single draft through this. A draft that fails any of the seven goes into **Skip Recommendation** — don't propose it as a reply option.

1. **Phone test.** Does this read like a real Redditor typed it on their phone? (If it sounds drafted, cut it back.)
2. **Would DJ post this if BuildOS didn't exist?** (If no, it's a product pitch disguised as engagement.)
3. **Specific thing test.** Is there exactly one concrete detail a reader could picture?
4. **Vocabulary test.** Does the draft use at least one sub-native term correctly?
5. **AI framing test.** Is "AI" in any noun or verb position? (If yes, rewrite to describe the behaviour.)
6. **Disclosure test.** If the draft mentions BuildOS, is the founder tag in the first five words?
7. **Closer test.** Is the last line a soundbite, aphorism, or tidy reframe of the OP's point? (If yes, delete it.)

In the replies doc, for each draft, record which gates it passed and which (if any) were close calls.

---

## Sub-Specific Rule Enforcement

Before drafting for any sub, do these checks — gate failures = no draft, not a "we'll see."

### AI-Hard-Ban Subs (From Tracker)

The 8 subs where leading with "AI" = death:

- r/writing, r/selfpublish, r/worldbuilding, r/screenwriting, r/NewTubers, r/productivity, r/getdisciplined, r/ObsidianMD

In these subs: no "AI" noun, no "AI-powered" adjective, no "uses AI to X" verb framing. Describe behaviour only. If a draft can't clear this, skip the thread.

### Comment-Only-Forever Subs

r/ADHD (Rule 8: absolute permaban on any promotion — no loopholes), r/productivity (Rule 2: even asked-for recs get removed), r/getdisciplined (Rule 4: link-posting = permaban), r/ExperiencedDevs (BuildOS is off-topic). Threads in these subs can only get Level 0 drafts — reject any BuildOS or category-pitch phrasing.

### Cultural Canary Check

Before drafting, scan the sub's profile `Cultural canaries` section (or the tracker's canary list). Representative canaries:

- r/ObsidianMD: first-post-promo = ban (1,360↑)
- r/productivity: "NO ADVERTISING IS ALLOWED OF ANY KIND" pinned
- r/screenwriting: "Please stop submitting your vibe-coded software" (111↑)
- r/worldbuilding: top 2 of week are both anti-AI (3,801↑ + 3,766↑)
- r/ExperiencedDevs: "How many of you feel your stomach turn whenever you run into AI content?" (173↑)

If a thread is inside an active canary cultural moment, default to Level 0 even if the sub's rules would otherwise permit Level 1/2. Cultural canaries override rule text.

### Sanctioned-Surface Check

If the warmup doc flagged a live sanctioned surface for the day (Sunday Tool Thread, fortnightly promo, etc.), prioritize drafting a Pattern D option for that surface even if it's not in the top 5 threads — sanctioned surfaces are the rare, high-EV mention opportunities and are cadence-gated.

### Founder Disclosure Mandate

Any Level 2 draft must start with an up-front founder disclosure in the first five words. Approved templates (from the strategy doc):

- _"full transparency — I'm the founder of a tool called BuildOS."_
- _"quick disclosure: I'm the person building a tool called BuildOS."_
- _"obligatory founder disclosure — I built a tool called BuildOS."_

Anything buried, abbreviated, or parenthesized fails the Disclosure gate.

### Link Hygiene

- Level 0 / Level 1 drafts: **no links, ever.**
- Level 2 drafts: **no link unless the sanctioned thread explicitly asks for URLs** (most weekly Tool threads do; some fortnightly promo threads do). Naked domain only — no tracking parameters, no short links, no "click my profile."

---

## Memory-Aware Rules (Per-Sub History, Not Per-User)

Reddit relationships compound at the **sub** level, not the individual-redditor level. The profile's `Notes log` is our mini-CRM.

Before drafting for a sub:

- Read its profile's `Notes log` for what DJ has already commented on this sub, what themes he's covered, what angles he's used.
- Avoid repeating the same lived-experience story across threads (e.g., if DJ already used the "Act 3 consistency collapse" story in r/worldbuilding this week, pick a different one this time).
- If a draft is a continuation of a thread DJ has already commented on, mark the draft as a follow-up and link to the earlier comment.
- Cross-sub overlap: if DJ's r/writing comment on Tuesday already used a craft angle, don't reuse the same angle in r/selfpublish on Friday — there's known audience overlap, and repetition reads as performance.

When the profile log is empty (fresh sub), lean into Pattern C (craft question back) for first appearances. Low-stakes, no burnable mistakes.

---

## Workflow

### Step 1: Resolve the Warmup Doc

Use the provided date or path. If none is given, find the newest completed warmup doc (marked `STAGE 1 COMPLETE`). If multiple exist for the same date, use the most recent and preserve its exact basename.

### Step 2: Create or Open the Replies Doc

Derive the replies filename from the exact warmup filename by replacing `_reddit-warmup` with `_reddit-replies`. If the replies doc already exists, update it in place instead of overwriting it.

### Step 2A: Reconcile Existing Draft State

If a replies doc already exists for this warmup:

1. Read it before drafting anything new.
2. Find any items still marked `Drafted - Pending Posting`.
3. Preserve those items and add a `Reconciliation Needed` section if actual posting status is still unknown.
4. Never silently duplicate or replace earlier drafts.

### Step 3: Pre-Draft Read-Through

For each prioritized thread in the warmup:

1. Re-open the thread URL (or its cached JSON if fetch-sub.sh has it) and re-read the OP and the top 3 comments.
2. Check: has the thread drifted since Stage 1 scored it? (New top comments can change the engagement mode — e.g., if a top comment already said what DJ would say, pick a different angle.)
3. Classify: which of the 4 patterns fits? Which mention level does this sub + thread actually support?
4. Decide: proceed to draft, or flag as Skip with one-line reason.

### Step 4: Draft Per Thread

For each thread that passes Step 3:

1. Read the sub's profile + `Notes log` (CRM pass).
2. Pull the sub's voice notes, recurring thread patterns, cultural canaries.
3. Draft **2–3 comment options**, each using a different pattern where possible:
   - Option 1: the strongest pattern for this thread
   - Option 2: a different pattern (shorter, or different angle)
   - Option 3: (only if the first two are weak) a third pattern
4. Run each option through the 7-question quality gate. Record pass/fail per gate in the replies doc.
5. If fewer than 2 options pass all gates, recommend Skip.
6. Update the replies doc immediately — do not batch.
7. Append a `Drafted` entry to the sub profile's `Notes log`.

### Step 5: Skip Recommendations

For every thread the warmup queued but this command judges should be skipped, include a Skip Recommendation with:

- One-line reason (which gate failed, or which canary is active)
- Whether to revisit later (e.g., "revisit at next Sunday Tool Thread")
- Whether DJ should still *read* the thread for pattern signal

### Step 6: Record Execution State

If the user has not confirmed posting yet:

- Mark each item `Drafted - Pending Posting`
- Add a reconciliation checklist so the next pass can mark each item `Posted`, `Skipped`, or `Still pending`

If the user confirms a specific comment was posted:

- Record the exact comment text in the replies doc
- Update the sub profile's `Notes log` to `Posted`, with date and thread URL
- Note any early reactions (upvotes, replies, removals) if observable

---

## Reply Doc Template

Use this structure exactly. Update in place as you go; do not batch.

```markdown
<!-- docs/marketing/social-media/daily-engagement/<derived replies filename>.md -->

# Reddit Replies - [Date in words]

**Date:** [YYYY-MM-DD]
**Source Warmup:** [path]
**Strategy Version:** reddit-reply-strategy.md v[X.Y]
**Status:** DRAFTS READY

---

## Queue Summary

| # | Sub | Thread | Pattern | Mention Level | Gates Passed | Status |
|---|-----|--------|---------|---------------|--------------|--------|
| 1 | r/[sub] | [short title] | [A/B/C/D] | [0/1/2] | 7/7 | Drafted |
| 2 | r/[sub] | [short title] | — | — | [skip reason] | Skip |

---

## Reply Drafts

### 1. r/[sub] — "[Thread Title]"

**Post Link:** [URL]
**Profile:** [path to sub profile]
**Thread Type:** [which pattern from the sub's profile — "continuity," "tool rec," etc.]
**Sub Context Flags:** [any of: AI-hard-ban, active canary, sanctioned surface, karma-only, comment-only-forever]

**Thread Read-Through (post-Stage-1):**
- OP opening: [1-line recap of the ask]
- Top comments so far: [what's been said already — avoid repeating]
- Drift from Stage 1: [if any — e.g., "saturated now, competition 3 → 7"]

**Sub Profile Notes Log (recent):**
- [Date — what DJ said there already, if anything]

**Do Not Repeat:**
- [previous angle / lived-experience story used this week across any sub]

---

**Option 1 — Pattern [A/B/C/D], Mention Level [0/1/2]:**

> [Draft comment text]

- **Phone test:** ✓ / ✗ ([note if close call])
- **Value-without-BuildOS test:** ✓ / ✗
- **Specific thing test:** ✓ / ✗
- **Vocabulary test:** ✓ / ✗ (sub-native terms used: [list])
- **AI framing test:** ✓ / ✗
- **Disclosure test:** ✓ / ✗ / N/A (N/A only if Level 0)
- **Closer test:** ✓ / ✗

**Option 2 — Pattern [A/B/C/D], Mention Level [0/1/2]:**

> [Draft comment text]

[Same 7-gate block]

**Option 3 — Pattern [A/B/C/D], Mention Level [0/1/2]:**
(Only if Options 1–2 are weak.)

> [Draft comment text]

[Same 7-gate block]

**Recommended option:** [1 / 2 / 3]
**Why:** [one line]
**Execution Status:** Drafted - Pending Posting
**If Posted, Record Exact Comment Here:** Pending

---

### 2. r/[sub] — "[Thread Title]"

[Same structure]

---

## Skip Recommendations

### r/[sub] — "[Thread Title]"

**Post Link:** [URL]
**Why skip:** [one-line reason — gate failure, canary active, sub rule mismatch]
**Revisit condition:** [when, if ever — "next Sunday Tool Thread," "if OP asks for tool recs in a reply," "never"]
**Read anyway for pattern signal?:** [Yes/No — whether DJ should still read the thread for voice calibration]

---

## Execution Plan

- **Recommended posting order:** [1 → 2 → 3]
- **Spacing:** Reddit rate limits are generous for logged-in accounts; natural pacing is ~5–10 min between comments across different subs. Within the same sub, spread across 30+ minutes.
- **Timing window:** [when DJ should post — Reddit traffic varies by sub; most creator subs peak 9am–noon EST weekdays]
- **Disclosure enforcement:** All Level 2 drafts must preserve the first-five-word disclosure if DJ edits before posting.
- **Link rule:** [per-draft link status]

---

## Reconciliation Needed

| Sub | Thread | Current State | Next Update Needed |
|-----|--------|---------------|--------------------|
| r/[sub] | [title] | Drafted - Pending Posting | Mark Posted / Skipped / Still pending |

---

## Sub Profile Updates

| Sub | Profile | Notes Log Entry Added |
|-----|---------|-----------------------|
| r/[sub] | [path] | [YYYY-MM-DD Drafted: [brief]] |

---

## Pattern / Gate Observations

(Optional — log any patterns you see across drafts. Useful input for the strategy doc's v1.0 update.)

- [e.g., "Pattern B drafts for r/worldbuilding feel stronger when the honest-limitation line is specific to a scene id, not a generic 'still fails sometimes.'"]
- [e.g., "The AI framing gate tripped twice on phrases that used 'automatically' — worth adding to strategy's avoid list."]
```

---

## When Complete

Present a concise summary to the user:

```text
Reddit replies drafted for [date].

Drafts ready:      X   (passed all 7 gates)
Skip recommended:  Y   (gate failures or canary conflicts)
Sanctioned-surface drafts: Z

Replies doc: docs/marketing/social-media/daily-engagement/[filename]

Reminders before posting:
- Founder disclosure is the first five words on any Level 2 reply.
- No links unless the sanctioned thread expects them.
- If a draft feels polished on second read, cut the last sentence.

If you post any of these, tell me which option you used and I'll
reconcile the sub profile Notes log from Drafted to Posted.
```

---

## Notes for the Executing Agent

- **The strategy doc is the source of truth on voice.** If this command's guidance ever drifts from `reddit-reply-strategy.md`, the strategy wins.
- **Default to Skip.** When in doubt, recommend skipping the thread. A skipped comment costs nothing. A badly-framed comment can burn a sub for a year.
- **Never post.** This command drafts only. Posting is manual and happens in the browser where DJ can edit live.
- **v0.1 strategy caveat.** The reply strategy is still pre-voice-data. When a draft feels forced by the strategy's rails but DJ's instinct says something else, note the tension in the "Pattern / Gate Observations" section — that's how v1.0 gets informed.
- **Log what DJ uses.** When the user confirms a posted comment, compare it to the drafted option. Any diff between drafted text and posted text is signal for how DJ actually talks. Log that diff in the Pattern/Gate Observations section for v1.0.
- **No TaskCreate for this workflow.** The doc itself is the tracking surface.

---

## Related

- Stage 1 command: `.claude/commands/reddit-warmup.md`
- Reply strategy: `docs/marketing/social-media/reddit/reddit-reply-strategy.md`
- Tracker: `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`
- Sub profiles: `docs/marketing/social-media/reddit/subreddit-profiles/`
- Reddit skill (browser + JSON API): `.claude/skills/reddit/SKILL.md`
- Cousin commands (different platform rules — do not cross-load voice): `.claude/commands/linkedin-reply.md`, `.claude/commands/instagram-reply.md`

_Last Updated: 2026-04-17_
