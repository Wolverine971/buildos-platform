---
description: Run the daily Reddit warmup research pass — prioritize subs from the tracker, discover engagement-worthy threads via the JSON API, open top threads in Chrome for review, and log the scan.
argument-hint: "[optional sub focus]"
disable-model-invocation: true
---

# Reddit Warmup - Daily Engagement Scan

You are running a daily Reddit engagement scan for BuildOS. Your job in **Stage 1** (this command) is ONLY to **source threads**. You do **not** craft replies.

**This command runs in TWO STAGES:**

1. **Stage 1 (This Command):** Discover threads from the tracker's prioritized subs using Reddit's JSON API. Score them. Output the daily engagement doc. Open the top 5–7 in Chrome for human review. Update the tracker's `Last Visited` column.
2. **Stage 2 (Separate, Later):** `/reddit-reply` — craft comments per the 90/10 playbook. **Not built yet** — per the research spec, Stage 2 depends on `docs/marketing/social-media/reddit/reddit-reply-strategy.md`, which is written after a month of manual commenting yields real voice data.

---

## Output

Create a daily engagement doc at:

```
docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md
```

**Create this file FIRST before scanning.** Update it continuously as you find threads — don't batch at the end.

---

## Required Reading (Load These First)

Read these before anything else. They define the entire scan.

1. **Skill:** `.claude/skills/reddit/SKILL.md` — JSON API patterns, rate limits, URL map.
2. **Tracker (source of truth for "who to scan"):** `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`
3. **Brand guardrails:** `docs/marketing/brand/brand-guide-1-pager.md`
4. **Strategy:** `buildos-strat.md` §Part 4 (Reddit Strategy)
5. **Anti-AI positioning:** `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`
6. **Creator wedge:** `docs/marketing/strategy/thinking-environment-creator-strategy.md`

### Check for duplicates

Scan the last 7 days of Reddit engagement docs to avoid re-suggesting threads already seen:

```
docs/marketing/social-media/daily-engagement/*_reddit-warmup.md
```

Extract thread URLs from previous docs and maintain a "seen" list.

---

## Browser + Rate-Limit Setup

**Prerequisite:** User is logged into Reddit in Chrome with their burner account (per T10). If no account exists yet, the scan is still valuable — we can still discover + open threads for review; we just can't interact.

**WebFetch does not work on reddit.com.** Use curl via Bash, per the skill.

**Rate limit:** Reddit is ~10 req/min for anon. Pace `sleep 7` between requests. The `fetch-sub.sh` helper in the repo handles this:

```
docs/marketing/social-media/reddit/tools/fetch-sub.sh
```

---

# STAGE 1: SOURCE THREADS

> **Your job in Stage 1 is ONLY to find threads.** Do not craft replies. Capture thread data with reasoning, score, and hand off to human review.

---

## Phase 0: Sub prioritization

Load the tracker and pick which subs to scan this run. **Scan at most 5–6 subs per session** — rate limits and attention budget.

### Priority order for this session

Walk the tracker in this order, stopping when you hit 5–6 subs:

1. **Any sub with `Last Visited` older than 7 days** (or `---` if the user argument doesn't override).
2. **Tier 1 subs that are active** (r/writing, r/selfpublish, r/worldbuilding, r/NewTubers, r/VideoEditing, r/screenwriting — skip r/youtubers: it's CLOSED).
3. **Tier 2 high-fit** (r/solopreneur, r/Substack) — DJ's native peer groups for BuildOS.
4. **Tier 3 sanctioned-surface** (r/Notion — check for the fortnightly Self-promo & Showcase thread; flag it if live today).
5. **Tier 4 karma-farm** (r/ADHD, r/getdisciplined) — comment-only but high-karma potential.

**User argument:** if `$1` is a sub name, limit this run to just that sub.

### Subs to always skip

- **r/youtubers** — currently CLOSED (per the profile). Skip until reopened.
- **r/productivity** / **r/getdisciplined** / **r/ADHD** — scan for lived-experience comment opportunities only; **never look for mention surfaces**. These are karma-farm-only.

---

## Phase 1: Fetch thread candidates per sub

For each prioritized sub, run the helper script. It fetches about/rules/top-week/top-month/new/hot + search, paces requests safely, and writes a synthesis-ready summary.

```bash
# Load the sub's profile to get its thread-type patterns
SUB="writing"
PROFILE="docs/marketing/social-media/reddit/subreddit-profiles/${SUB}.md"

# Extract search queries from the profile's "Thread types" section
# (or use defaults matching the sub's wedge)
# Pass them as positional args to fetch-sub.sh
./docs/marketing/social-media/reddit/tools/fetch-sub.sh "$SUB" \
    "what tool" "alternative to" "how do you organize" "keep losing"
```

**What the script produces:**

- `/tmp/reddit-research/raw/${SUB}-*.json` — raw endpoint data
- `/tmp/reddit-research/summary/${SUB}.md` — human-readable summary with: about, rules, top-week, top-month, hot, new (with removed-count), search results

Read the summary file and use it to identify candidate threads.

### Candidate thread criteria

Include threads that:

- Are from the last 48 hours (prioritize <24h for freshness)
- Match a thread-type pattern listed in the sub's profile file (under `## Thread types where BuildOS would be a legit recommendation`)
- Have **10–300 comments** — enough engagement to matter, not so crowded we can't be seen
- Are NOT on the 7-day "seen" list from previous scans
- Are NOT in a sub's `cultural canary` thread or auto-modded removed post

Skip threads that:

- Have the sub's cultural-canary markers (e.g. "vibe-coded", "AI slop", "market research", "check out my tool")
- Are pure venting with no question/hook
- Are already flooded with tool plugs (glance at first 5 comments)
- Are promotional self-posts from launchers
- Are in weekly self-promo threads (those are for Stage 2 posting, not Stage 1 commenting)

---

## Phase 2: Score each candidate thread

Score each candidate on four dimensions. Weights:

| Factor                   | Weight | Scoring                                                                           |
| ------------------------ | ------ | --------------------------------------------------------------------------------- |
| **Freshness**            | 3×     | <6h = 10, 6–12h = 8, 12–24h = 6, 24–48h = 4, >48h = 1                             |
| **BuildOS thesis fit**   | 3×     | Thesis-exact (e.g. "my lore keeps contradicting itself") = 10, thesis-adjacent = 7, tool-question only = 5, loose topical = 3 |
| **Engagement velocity**  | 2×     | comments ÷ hours-since-post; >20/hr = 10, 10–20 = 8, 5–10 = 6, 2–5 = 4, <2 = 2      |
| **Reply competition**    | 2×     | <10 existing comments = 10, 10–30 = 7, 30–80 = 5, 80–150 = 3, >150 = 1             |

Apply these modifiers:

- **Cultural-canary penalty:** if the thread's OP or top comments contain the sub's canary phrases, subtract 15 points (effectively drop it).
- **Sanctioned-surface bonus:** if the thread IS a sub's sanctioned promo thread (e.g. r/writing Sunday Tools, r/VideoEditing Monthly Developer thread, r/podcasting Wednesday Product thread, r/Notion fortnightly Self-promo), **flag it separately** — this is a Stage 2 post opportunity, not a Stage 1 comment opportunity.

**Select top 5–7 threads across all scanned subs** for the daily engagement doc.

---

## Phase 3: Write the daily engagement doc

Use this format. **Update the doc as you work — don't batch.**

```markdown
<!-- docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md -->

# Reddit Warmup - [Date in words]

**Date:** [YYYY-MM-DD]
**Account:** [burner handle or `unauthenticated` if no account yet]
**Scan Time:** [timestamp]
**Subs scanned:** [N] — [list]
**Status:** STAGE 1 COMPLETE — Awaiting human review

---

## Notifications & Inbox

**Checked:** [Yes/No]
**Notable:** [any replies to our comments that need follow-up; mentions]

---

## Sanctioned-Surface Threads Live This Session

| Sub      | Thread                                            | URL | Cadence          | Action                                                                 |
| -------- | ------------------------------------------------- | --- | ---------------- | ---------------------------------------------------------------------- |
| r/writing | Sunday Writing Tools, Software, and Hardware     | ... | weekly (Sundays)  | If today is Sunday: evaluate for a founder-disclosed BuildOS mention.  |
| r/Notion | Fortnightly Self-promo & Showcase                 | ... | fortnightly       | If live today: evaluate for a BuildOS-as-complement post.              |
| ...      | ...                                               | ... | ...               | ...                                                                    |

**If any of the above is live today, surface it before the general thread list** — it's higher-leverage than a comment opportunity.

---

## Priority Summary — Top 5–7 Thread Opportunities

| Priority | Sub           | Thread Topic                              | Age | Score | Engagement Mode                         | Why                           |
| -------- | ------------- | ----------------------------------------- | --- | ----- | --------------------------------------- | ----------------------------- |
| 1        | r/solopreneur | How do you keep your projects organised?  | 4h  | 86    | Founder-disclosed reply (sub allows)    | Literal BuildOS thesis thread |
| 2        | r/Substack    | Anyone else feel writing isn't the problem? | 8h  | 79    | Comment-only (craft-first)             | Thesis-exact                  |
| 3        | ...           | ...                                       | ... | ...   | ...                                     | ...                           |

---

## Thread Opportunities (Detail)

### 1. [Sub] — [Thread title]

**Post Link:** [full URL]

**Thread Opening:**
> [first 1–3 sentences of the OP so reviewer can see the ask]

**Stats:** X upvotes · Y comments · [age]
**Thread type:** [matches which pattern from the sub's profile]
**Score:** XX (freshness XX, fit XX, velocity XX, competition XX)

**Why This Thread:**
[1–2 sentences on why this is a good engagement opportunity — ground it in the sub's culture and BuildOS's fit per the profile]

**Engagement Mode:** [one of:]
- `Comment-only, no product mention` (Tier 4 subs, non-sanctioned threads in strict subs)
- `Founder-disclosed comment with BuildOS mention` (when sub's profile says this thread type allows it)
- `Save for sanctioned-surface post` (Stage 2 — defer to the sub's weekly/fortnightly/monthly thread)

**Constraints for Stage 2:**
- [List any sub-specific rules the reply must respect: flair, AutoMod karma gate, required founder disclosure, "never mention AI" flag, etc.]

**Reply:** _Pending Stage 2_

---

[Repeat for each opportunity; write to doc as you go]

---

## New Pattern Observations

[Short bullets — unusual threads, shifts in culture, new recurring-thread candidates for the tracker's "recurring threads" section]

- ...

---

## Scan Log

| Sub               | Scanned | Threads considered | Top thread made the cut | Notes                             |
| ----------------- | ------- | ------------------ | ----------------------- | --------------------------------- |
| r/writing         | Yes     | 14                 | No (all below threshold) | Sunday tool thread not live today |
| r/solopreneur     | Yes     | 11                 | Yes (#1)                 | Literal thesis thread; 4h old     |
| ...               | ...     | ...                | ...                     | ...                               |

---

## Tracker Updates

**Updated `Last Visited` in `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` for:**
- [list of subs scanned today]

---

## Strategy Observations

[Raw observations — patterns worth sending to the strategy log or noting in profiles]

- [What's shifting?]
- [What's working vs not?]

---

**Created:** [timestamp]
**Stage 1 Completed:** [timestamp]
**Stage 2 Status:** Pending — `reddit-reply-strategy.md` not yet written (see research spec §Stage 2)
```

---

## Phase 4: Open top threads in Chrome for review

After scoring, open the top 5–7 threads in Chrome for human review. On macOS:

```bash
# Build the list from the doc's priority table — one URL per line in a temp file
cat /tmp/reddit-top-threads.txt

# Open each in a new tab
while IFS= read -r url; do open "$url"; done < /tmp/reddit-top-threads.txt
```

If any `Sanctioned-Surface Threads Live` are flagged, open those first.

---

## Phase 5: Update the tracker

Open `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` and update the `Last Visited` column for every sub scanned this session. Also append to the `## Scan History` table:

```
| YYYY-MM-DD | [N subs] | [one-line summary] |
```

If you observed a new recurring-thread pattern (e.g. "noticed r/Substack has a pinned Friday writer-feedback thread"), add it to the tracker's `### Recurring weekly / monthly threads` section.

If a sub's `Promo Tolerance` or `BuildOS Fit` rating seems wrong based on today's evidence, don't change it silently — add a note in that sub's profile's `## Notes log` and flag it in the daily doc's `Strategy Observations`.

---

## Phase 6: Hand off to human

Present this summary to the user:

```
Reddit Warmup Stage 1 complete for [date].

## Subs Scanned: X
- [sub] ([last visited date])
- ...

## Threads Sourced: X total candidates → 5–7 prioritized

## Sanctioned-Surface Threads Live Today: [count]
- [list if any]

## Top 3 Opportunities
1. [sub] [thread title] — score XX — [one-line why]
2. ...
3. ...

## Chrome Tabs Opened: [count]

## Stage 2 Status
Not yet available. `reddit-reply-strategy.md` needs to be written after
a month of manual commenting yields real voice data (per research spec).
For now, review the opened threads and reply manually in the browser,
following each sub's profile's `Voice notes for future commenting`.

Full daily doc: docs/marketing/social-media/daily-engagement/YYYY-MM-DD_reddit-warmup.md
Tracker updated: docs/marketing/social-media/reddit/reddit-subreddit-tracker.md
```

Do **not** auto-launch Stage 2 — it doesn't exist yet.

---

## Hard Constraints (Cross-Sub, Non-Negotiable)

Every thread you surface must respect these, or the recommendation is invalid:

1. **90/10 value-first rule.** If the thread wouldn't genuinely benefit from DJ's comment, don't surface it.
2. **Founder disclosure** required whenever BuildOS is mentioned. Every time.
3. **Sanctioned surfaces only** for any BuildOS mention — check the sub's profile for where that is.
4. **AI-framing hard-ban subs** (see tracker's `AI-framing hard-ban subs` list). In these, BuildOS must be framed as "workflow / project home / thinking environment," never as "AI tool."
5. **No market research, beta recruiting, user interviews** — several subs ban this with permaban consequences.
6. **Respect cultural canaries** — the tracker lists high-upvote mod/community posts that draw anti-promo lines.
7. **Account gates:** do not surface threads the user can't comment on because of AutoMod karma/age gates (check sub profile's `Karma / account age requirements`).

---

## Execution Notes

1. **Write to the daily doc as you go** — do not accumulate in memory.
2. **Use the JSON API for discovery** — WebFetch is blocked on reddit.com.
3. **Pace 7s between requests** — Reddit rate-limits at ~10/min for anon.
4. **`fetch-sub.sh` is your friend** — it already handles pacing, retry, and summarization.
5. **Skip r/youtubers** until it reopens.
6. **Never surface BuildOS-mention opportunities in r/ADHD, r/productivity, r/getdisciplined, r/ExperiencedDevs** — only lived-experience comments.
7. **Quality over quantity** — 5 great threads beats 15 mediocre ones.
8. **Time-box the scan:** 30 minutes is plenty. The JSON API is fast.

---

## Related Documentation

| File                                                                                          | Role                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `.claude/skills/reddit/SKILL.md`                                                              | Browser + API basics                                   |
| `.claude/skills/reddit/references/workflows.md`                                               | Detailed flows and selectors                           |
| `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`                              | Live tracker — subs, cadence, recurring threads, canaries |
| `docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md`                              | Per-sub profile database                               |
| `docs/marketing/social-media/reddit/subreddit-profiles/{sub}.md`                              | Rules, culture, thread types, voice notes (per sub)    |
| `docs/marketing/social-media/reddit/tools/fetch-sub.sh`                                       | Rate-limit-aware JSON API fetcher                       |
| `docs/marketing/social-media/reddit/reddit-subreddit-research-spec.md`                        | Research spec that generated the profiles (archived, re-runnable) |
| `buildos-strat.md` §Part 4                                                                    | Reddit strategy (source of truth)                      |
| `buildos-strat-tasks.md` T3 / T10                                                             | Research + karma-accumulation tasks                    |
| `docs/marketing/brand/brand-guide-1-pager.md`                                                 | Voice + terms guardrails                               |

---

_This command is Stage 1 only. Stage 2 (`/reddit-reply`) will be built after the first month of manual commenting produces voice data for the reply-strategy doc._

_Last Updated: 2026-04-17_
