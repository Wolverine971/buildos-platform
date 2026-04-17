<!-- docs/marketing/social-media/reddit/reddit-subreddit-research-spec.md -->

# BuildOS Reddit Subreddit Research Spec

> **✅ Status: COMPLETED 2026-04-17.** This spec defined the one-time (now quarterly re-runnable) research pass that produced the tracker + profile database. **Live operational docs are below.** Keep this spec for quarterly re-runs and as the template for any future audit of new target subs.
>
> **Current operational surfaces:**
>
> - **[Subreddit Tracker](./reddit-subreddit-tracker.md)** — live tracker with all 19 target subs, cadence, cultural canaries, recurring threads
> - **[Profile INDEX](./subreddit-profiles/INDEX.md)** — per-sub profile database
> - **[/reddit-warmup command](../../../../.claude/commands/reddit-warmup.md)** — daily Stage 1 engagement flow
> - **[Reddit skill](../../../../.claude/skills/reddit/SKILL.md)** — JSON-API + browser patterns (Chrome needed for interaction)
>
> **Known delta from this spec to actual output:** the spec's tier list sums to 19 subs (not 20 as the prose claimed); r/Newsletter singular doesn't exist as an active sub and was substituted with r/Newsletters plural; r/youtubers turned out to be CLOSED and was de-prioritized; the research used the Reddit JSON API instead of manual browser scraping (WebFetch is blocked on reddit.com, but curl with a User-Agent works fine and is 10× faster).

---

**Task ID:** T3 in `buildos-strat-tasks.md`
**Prerequisite for:** T4 (evergreen thread inventory), T10 (Reddit karma accumulation), and the `/reddit-warmup` command (now built)
**Owner:** DJ (execute via Chrome + Claude Code browser session, OR JSON API via `tools/fetch-sub.sh`)
**Estimated effort:** ~4 hours for all 19 subs, or batch over 2–3 sessions. JSON API approach completes in ~20 minutes.
**Output location:** `docs/marketing/social-media/reddit/`

---

## Goal

Produce a full dossier of the subreddits where BuildOS should build karma, participate authentically, and eventually post — framed around the **creator wedge** (authors, YouTubers, podcasters) with **productivity and ADHD as supporting lanes**. The output must be structured so a future `/reddit-warmup` slash command can consume it directly, same way `/twitter-warmup` consumes `twitter-accounts-tracker.md` and the `twitter-profiles/` directory.

---

## Required Reading Before Starting

Load these into context first:

1. **Positioning guardrails:**
    - `docs/marketing/brand/brand-guide-1-pager.md` — non-negotiable voice + terms
    - `docs/marketing/strategy/thinking-environment-creator-strategy.md` — creator wedge rationale
    - `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md` — don't lead with AI

2. **Strategy source of truth for this task:**
    - `buildos-strat.md` §Part 4 (Reddit Strategy) — target sub list, playbook, 90/10 rule
    - `buildos-strat-tasks.md` T3 (this task's definition of done)

3. **Pattern reference (existing house style for these docs):**
    - `.claude/commands/twitter-warmup.md` — Stage 1/Stage 2 command pattern
    - `docs/marketing/social-media/twitter-accounts-tracker.md` — tracker format to mirror
    - `docs/marketing/social-media/twitter-profiles/INDEX.md` — profile index format

---

## Positioning Guardrails (Non-Negotiable)

Every observation, note, and (later) comment must stay inside these rails:

- **Category:** thinking environment for people making complex things
- **Primary audience in Reddit work:** authors, YouTubers, podcasters, newsletter operators, course creators, founder-creators
- **Supporting affinity only:** ADHD, founders, indie builders — don't lead with these
- **Don't lead with "AI"** — lead with relief ("turn messy thinking into structured work")
- **Don't use "ontology" in comments** — it's deep-content-only language
- **90/10 rule:** 90% value contribution, 10% BuildOS mention, always with founder disclosure

---

## Outputs (What This Task Produces)

### 1. Master tracker

`docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`

Single-file index of all 20 subreddits, mirroring `twitter-accounts-tracker.md`. Format:

```markdown
# BuildOS Reddit Subreddit Tracker

**Last full scan:** YYYY-MM-DD
**Scan cadence:** Weekly (during karma phase) → 2–3× weekly (once posting)

## Tier 1 — Primary Creator Subs (Authors)

| Subreddit       | Subscribers | Daily Active (est.) | Promo Tolerance | BuildOS Fit | Last Visited | Profile |
| --------------- | ----------- | ------------------- | --------------- | ----------- | ------------ | ------- |
| r/writing       |             |                     |                 |             |              | [link]  |
| r/selfpublish   |             |                     |                 |             |              | [link]  |
| r/worldbuilding |             |                     |                 |             |              | [link]  |
| r/screenwriting |             |                     |                 |             |              | [link]  |

## Tier 1 — Primary Creator Subs (YouTubers)

[same table structure]

## Tier 2 — Secondary Creator Subs

[same table structure]

## Tier 3 — Cross-Cutting (Productivity / Tool-Switchers)

[same table structure]

## Tier 4 — Supporting Affinity

[same table structure]
```

### 2. Per-subreddit profiles

`docs/marketing/social-media/reddit/subreddit-profiles/{sub-name}.md` (one file per sub, 20 total)

Use sub name without `r/` prefix as filename. Format (frontmatter + body):

```markdown
---
subreddit: r/writing
tier: 1
audience_wedge: authors
subscribers: 3100000
daily_active_estimate: 45000
promo_tolerance: strict
buildos_fit: high
last_scanned: 2026-04-17
---

# r/writing

## One-line summary

[Who uses it, what they post about]

## Self-promotion rules (verbatim)

> [Paste rules from sidebar + rules page exactly]

## Karma / account age requirements

- Comment karma minimum: [X or none]
- Account age minimum: [X or none]
- Approved submitter flow: [yes/no]

## Moderation posture

[strict / moderate / lax — with evidence: recent removed posts, mod comments, etc.]

## Culture & voice

- Tone of top comments: [dry, supportive, critical, etc.]
- What gets upvoted: [e.g. craft insights, honest struggles, specific examples]
- What gets downvoted: [e.g. any tool plug, AI references, self-help clichés]

## Sub-specific terminology

[Jargon that signals an insider vs. an outsider]

## Thread types where BuildOS would be a legit recommendation

1. "What tool do you use for [outlining / drafting / tracking revisions]?"
2. "I can't stick with [Scrivener / Notion / index cards] — what else is out there?"
3. "How do you keep track of [scene beats / character arcs / research notes] across a long project?"
4. [etc.]

## Recent real examples (3–5 threads)

| Date       | Thread title | URL | Why BuildOS is relevant | Upvotes | Comments |
| ---------- | ------------ | --- | ----------------------- | ------- | -------- |
| 2026-04-14 | ...          | ... | ...                     | ...     | ...      |

## Voice notes for future commenting

- [Specific things to mention / avoid]
- [Shared references the sub respects]
- [Stylistic notes — e.g. "lowercase is fine here" / "formal prose expected"]

## Karma-building strategy for this sub

- What topics to comment on first
- Which weekly threads to watch (e.g. Wednesday critique threads, Monday "what are you working on")
- Realistic time to 100 / 500 karma here

## Notes log

- YYYY-MM-DD: [observation]
```

### 3. Profile index

`docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md`

Simple grouped list by tier, each linking to its profile file. Mirror `twitter-profiles/INDEX.md`.

---

## Target Subreddit List (from `buildos-strat.md` Part 4)

Research all 20. Add others only if you find a sub with >50K subs where BuildOS is a natural fit.

### Tier 1 — Primary Creator Subs

**Authors:**

1. r/writing
2. r/selfpublish
3. r/worldbuilding
4. r/screenwriting

**YouTubers:** 5. r/YouTubers 6. r/NewTubers 7. r/VideoEditing

### Tier 2 — Secondary Creator Subs

8. r/podcasting
9. r/Substack
10. r/Newsletter
11. r/contentcreation
12. r/creators
13. r/solopreneur

### Tier 3 — Cross-Cutting (Productivity / Tool-Switchers)

14. r/productivity
15. r/getdisciplined
16. r/Notion
17. r/ObsidianMD

### Tier 4 — Supporting Affinity (Participate authentically, don't lead with BuildOS)

18. r/ADHD
19. r/ExperiencedDevs

### Candidates to consider (only if time permits)

- r/books (discussion, not creator-oriented — only if relevant)
- r/WritersGroup
- r/selfhosted (for Obsidian/PKM overlap — low priority)
- r/SaaS, r/Entrepreneur, r/startups (founder-creator overlap — explicitly de-prioritized per strat, but note the rules for future)

---

## Process (Run in Chrome + Claude Code)

### Step 0 — Browser warm-up

- Open Chrome to `https://www.reddit.com/`
- Ensure you are logged into the burner account you're building karma on (per T10). If no account exists yet, you can browse logged-out — but the account cadence (T10) should start the same day as this research.
- Keep a second tab on `https://old.reddit.com/` — rule text is often clearer there.

### Step 1 — Per subreddit, in this order

For each sub in the target list:

**1a. Capture headline stats**

- Navigate to `https://www.reddit.com/r/{sub}/about/`
- Capture subscriber count (shown on sidebar)
- For daily-active estimate, check either:
    - The "X users here now" live counter in sidebar (note time of day)
    - Recent top-week thread comment counts as a proxy
- Flair/filters to note: Does the sub have a "tool recommendation" flair? Weekly recurring threads?

**1b. Capture rules verbatim**

- Navigate to `https://www.reddit.com/r/{sub}/about/rules/` (or `https://old.reddit.com/r/{sub}/about/rules/` if easier)
- Copy the self-promotion / solicitation / "no advertising" rules word-for-word into the profile doc
- Also check pinned posts on the sub's front page — many subs have a "read before posting" sticky with additional promo rules
- Note any karma or account-age gates mentioned

**1c. Assess moderation posture**

- Scan `https://www.reddit.com/r/{sub}/new/` — look for removed posts (they show as `[removed]`)
- If 5+ removed posts visible in the latest 50, mark as strict
- Check mod comment tone if any mod has replied publicly in last week

**1d. Capture 3–5 recent thread examples**

- Use sub's search with queries like:
    - `"what tool"`, `"what app"`, `"recommend"`, `"alternative to Notion"`, `"alternative to Scrivener"`
    - `"how do you organize"`, `"how do you track"`, `"keep losing"`
    - `"can't stick with"`, `"switching from"`
- Filter to "past month" or "past week"
- For each captured thread: title, URL, upvotes, comment count, and a one-liner on why BuildOS would be a legit (not forced) recommendation

**1e. Capture culture signal**

- Open top 3 threads of the past week (hot tab)
- Read top comments: what's the voice? What gets praised? What gets downvoted?
- Note any sub-specific jargon (e.g. r/screenwriting uses "beats" + "sluglines"; r/worldbuilding uses "magic systems")

**1f. Write the profile doc**

- Use the template from Outputs §2 above
- Save as `subreddit-profiles/{sub-name}.md`
- Update master tracker + index

### Step 2 — Master tracker assembly

After all 20 profiles exist:

- Populate `reddit-subreddit-tracker.md` with one row per sub
- `BuildOS Fit` column uses: `high` / `medium` / `low-but-relevant` / `de-prioritize`
- `Promo Tolerance` uses: `strict` / `moderate` / `lax`

### Step 3 — Profile index

- Create `subreddit-profiles/INDEX.md` — grouped by tier, linking each file

### Step 4 — Commit

- Commit all files
- Update `buildos-strat-tasks.md` T3 with `✅ Completed YYYY-MM-DD` and a link to the tracker

---

## Selection Criteria for "Recent Threads" (per sub)

Capture threads that:

- Are from the last 30 days (prioritize last 7 for freshness)
- Have a real tool-recommendation or workflow question
- Have moderate engagement (10+ comments, <300 — high-comment threads are oversaturated)
- Would support a **founder-disclosed** BuildOS mention as genuinely useful (not forced)
- Match creator workflows first, productivity second, ADHD third

Skip threads that:

- Are pure venting with no question
- Are already flooded with tool plugs
- Are from mods asking mod questions
- Are promotional (self-post launches)

---

## Browser Navigation Cheat Sheet (Reddit)

| Purpose                        | URL                                                                      |
| ------------------------------ | ------------------------------------------------------------------------ |
| Sub front                      | `https://www.reddit.com/r/{sub}/`                                        |
| Sub rules                      | `https://www.reddit.com/r/{sub}/about/rules/`                            |
| Sub "about" (sidebar)          | `https://www.reddit.com/r/{sub}/about/`                                  |
| Sub new                        | `https://www.reddit.com/r/{sub}/new/`                                    |
| Sub top (week)                 | `https://www.reddit.com/r/{sub}/top/?t=week`                             |
| Sub search                     | `https://www.reddit.com/r/{sub}/search/?q={query}&restrict_sr=1&t=month` |
| Old Reddit (cleaner rule text) | `https://old.reddit.com/r/{sub}/about/rules/`                            |
| Site-wide search               | `https://www.reddit.com/search/?q={query}`                               |
| Global search via Google       | `site:reddit.com/r/{sub} "{query}"`                                      |

Useful keyboard shortcuts (on reddit.com): `j/k` navigate posts · `a/z` upvote/downvote · `s` save. (You're not engaging during research — but they're handy to know.)

---

## Open Research Questions to Flag (Not Blocking)

While scanning, note findings for these in a scratchpad at the bottom of the master tracker — these feed T4 and future strategy:

1. Which subs have weekly recurring threads (e.g. "what are you working on Wednesday") where low-friction karma accrues?
2. Which subs have an official "tool talk" or "resources" sticky — these are goldmines later.
3. Are there mod-run Discord communities worth joining alongside the sub?
4. Which creator-adjacent redditors show up repeatedly as high-value commenters? (Lead for T4 research task 4 — "creator-adjacent redditors to follow")
5. Cross-sub overlap: does the same user base show up in r/writing + r/selfpublish + r/worldbuilding? (Signals whether to target one or all.)

---

## Definition of Done (T3)

- [ ] `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` committed with all 20 subs
- [ ] `docs/marketing/social-media/reddit/subreddit-profiles/` contains 20 `{sub-name}.md` files
- [ ] `docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md` committed
- [ ] Rules captured verbatim for every sub
- [ ] 3–5 recent example threads per sub
- [ ] Each sub rated on `BuildOS Fit` + `Promo Tolerance`
- [ ] T3 in `buildos-strat-tasks.md` marked complete with date + link

---

## Future: `/reddit-warmup` Command

Once T3 is done, the research outputs directly feed a warmup command that mirrors `/twitter-warmup` and `/instagram-warmup`. Here's the intended shape — **not to build now, but design the research so it fits.**

### Planned file layout

```
.claude/
  skills/
    reddit/
      SKILL.md               # browser-automation basics (mirror twitter/SKILL.md)
      references/
        workflows.md         # detailed click/selector patterns
  commands/
    reddit-warmup.md         # Stage 1: source threads
    reddit-reply.md          # Stage 2: craft comments (separate command)
```

### Planned command flow

**Stage 1 — `/reddit-warmup`:**

1. Create daily engagement doc at `docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md`
2. Load `reddit-subreddit-tracker.md` — prioritize Tier 1 and any sub not visited in 7+ days
3. For each prioritized sub:
    - Check `new/` and `hot/` — capture 2–3 threads matching the "thread types" listed in each sub's profile
    - Check any weekly recurring threads (from open question §1 above)
4. Score each thread on: freshness, BuildOS fit, engagement potential (comments ÷ age), reply competition
5. Surface top 5–7 for Stage 2
6. Update `Last Visited` on tracker

**Stage 2 — `/reddit-reply`:** _(built 2026-04-17; see `.claude/commands/reddit-reply.md`)_

1. Load Stage 1 doc + `docs/marketing/social-media/reddit/reddit-reply-strategy.md` + per-sub profiles for every queued sub
2. Re-read each thread (top comments may have drifted since Stage 1 scored it)
3. Classify engagement via the strategy's 4-pattern library (A: validation + lived detail, B: specific process, C: craft question back, D: sanctioned founder mention)
4. Draft 2–3 comment options per thread, each with a different pattern where possible
5. Run every draft through the 7-question quality gate; flag Skip Recommendations for any thread where gates fail
6. Enforce sub-specific rules: AI-hard-ban vocabulary, sanctioned-surface gating, comment-only-forever subs, founder-disclosure-in-first-five-words, link hygiene
7. Append a `Drafted` entry to each sub profile's `Notes log`; reconcile to `Posted` on user confirmation

**Strategy doc status:** v0.1 is in place (initial framing grounded in brand guide + anti-AI positioning + per-sub profiles + cross-platform voice memory). v1.0 rewrite is scheduled after ~30 days of real reply data. Until then the command defaults to Skip when quality gates are ambiguous.

### What the research output must enable

- Tracker has every field the warmup command needs to scan + prioritize subs
- Profiles have enough voice/culture notes that comment drafting stays sub-appropriate
- Rules are captured verbatim so the warmup command can flag any comment that violates them
- `thread types` section is structured enough that the command can fuzzy-match new threads against it

If a field feels useful for the future warmup but isn't in the template, **add it now** — research cost is the same, and backfilling later is a tax.

---

## Notes for the Executing Agent

- **Do not comment, vote, save, or subscribe during research.** Pure read-only.
- **Do not draft comment templates in this task.** That's T4 (research task 3 in strat doc) and properly belongs to a separate writing pass.
- **Take screenshots** of rules pages for the subs with the strictest rules — easier to reference later than re-navigating.
- **Don't rush r/writing, r/ADHD, r/productivity** — these are the big three by traffic and should each get more than average attention.
- **If a sub turns out to be de-prioritized on closer inspection** (e.g. overrun with AI-slop posts, dead, or hostile beyond workable), still create a minimal profile and mark it `de-prioritize` — future-us will thank present-us for the paper trail.

---

_Created: 2026-04-17_
_Last updated: 2026-04-17_
