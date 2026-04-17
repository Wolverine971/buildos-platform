<!-- docs/marketing/distribution/RECURRING.md -->

# Recurring Distribution Work

Anything that needs to run on a cadence lives here. One-shot tasks live in the work stream files. If a one-shot task finishes and becomes a repeat, move it here.

---

## Daily

### Reddit karma cadence (T10)

**Workstream:** [WS03](workstreams/WS03-reddit-creator-wedge.md)
**Time per day:** 15–20 min
**Started:** TBD (date of first comment)
**Target:** ~500 comment karma per primary sub in 90 days
**Gate it unlocks:** T27 (first promotional post) — do not post until hit
**Done when:** daily gap of >3 days breaks the cadence; restart tracking

**Daily recipe:**
1. Open Chrome, go to the next sub in the Tier 1 rotation (see [WS03 task T10](workstreams/WS03-reddit-creator-wedge.md#t10))
2. Find 2–3 threads where you can add honest, specific value
3. Comment without mentioning BuildOS
4. Log the sub in a weekly tracker note (just to keep cadence honest)

**Do not batch more than 5 comments/day across all subs — looks like a campaign.**

### (Future) `/reddit-warmup` command

Once T03 tracker + profiles exist, the daily Reddit work becomes a command run like `/twitter-warmup` / `/instagram-warmup`. Spec'd at the bottom of [`../social-media/reddit/reddit-subreddit-research-spec.md`](../social-media/reddit/reddit-subreddit-research-spec.md).

---

## Weekly

### Content freshness sweep

**Workstream:** [WS02](workstreams/WS02-llm-citation-geo.md) (connected to T08 + content freshness power law)
**Time:** 20 min
**Day:** Monday
**What to do:**
1. Review blog posts edited in the last week — verify `dateModified` bumped
2. Spot-check `/changelog` (once live from T23) — anything shipped this week logged?
3. If any comparison page is >13 weeks old and still canonical, flag for refresh (LLM freshness signal degrades past that)

### Reddit scan (active phase only — after 500 karma hit)

**Workstream:** WS03, post-T10
**Cadence:** 2–3× per week once posting-eligible
**Supersedes daily karma mode** once you're posting, not just commenting

---

## Monthly

### LLM citation remeasure (T28)

**Workstream:** [WS02](workstreams/WS02-llm-citation-geo.md)
**Time:** 1 hr
**Day:** First Monday of the month
**What to do:**
1. Re-run the 6 baseline prompts from T01 against ChatGPT, Claude, Perplexity
2. Log results at `docs/marketing/measurement/llm-citation-YYYY-MM.md`
3. Compare to previous months — note position shifts + framing drift
4. If framing drifts toward "ADHD tool" or "AI PM tool," flag as strategy risk and trace the source

### Drift audit

**Workstream:** all — this is a meta-task
**Time:** 30 min
**Day:** First of month
**What to do:**
1. Pick 5 random tasks from `buildos-strat-tasks.md`
2. Verify status in task list matches status in workstream file matches code/content reality
3. Fix any drift
4. Log in this file under "Drift Audits"

**Drift Audits log:**
- YYYY-MM-DD: [summary of what was found, who fixed]

---

## Quarterly

### Deep content piece cadence (T32)

**Workstream:** [WS04](workstreams/WS04-flagship-content.md)
**Time:** ~1 week of writing
**Cadence:** One 2,500–4,000 word piece per calendar quarter, minimum
**Candidate topic list:** see WS04 + `buildos-strat.md` §5

**Quarterly checkpoint:**
- Q2 2026: T15 (thinking-environment framework doc)
- Q3 2026: T25 (next piece from candidates)
- Q4 2026: TBD
- Q1 2027: TBD

**Done when:** piece shipped across build-os.com + Medium/Substack + one-time promo on Reddit (rules-compliant), X, LinkedIn.

### Integration marketplace re-scan

**Workstream:** [WS06](workstreams/WS06-developer-integration.md)
**Time:** 1 hr
**What to do:**
- Re-inventory integrations (new services added?)
- Check status of submitted listings (approved? rejected? need refresh?)
- Any new partner marketplaces to target?

---

## Event-Triggered (Not Calendar)

### Every blog post edit
- Bump `dateModified` frontmatter
- Re-validate JSON-LD on the page (Rich Results Test)
- If page is >2 months old at edit, also add a "Last revised" note in body

### Every public page published by a user (post-T12)
- `Article` JSON-LD must render
- "Made with BuildOS" attribution must render (T13 check)
- If page is the first shared by that user, consider featuring in the gallery seed set (T26)

### Every Reddit mention of BuildOS (not ours)
- Log in `docs/marketing/measurement/reddit-mentions-log.md` (create if missing)
- Note sentiment + whether you should respond
- If it's in a strict sub, do not reply without disclosing founder role

### Every new code surface that renders publicly
- Check for JSON-LD (at minimum `Article`, `SoftwareApplication`, or `BreadcrumbList` as appropriate)
- Verify sitemap.xml updated
- Verify llms.txt references if it's a major new section

---

## What NOT to put here

- One-shot spec writing (put in the appropriate workstream task brief)
- Research burst tasks (T03, T05 — workstream task)
- Product-build tasks (workstream task, even if multi-phase)

If you're unsure, default to workstream. Move here only when the same thing has been done 3+ times on cadence.
