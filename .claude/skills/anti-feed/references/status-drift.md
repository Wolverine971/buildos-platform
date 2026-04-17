# Status update discipline & voice checklist

Every content artifact this skill produces triggers writes in three places. Miss one and it's drift. This file is the checklist.

## The three-place rule

When a task's status changes (⚪ → 🟡, 🟡 → 🔵, 🔵 → ✅), update:

1. **Workstream file** status dashboard
    - WS09: `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`
    - WS10: `docs/marketing/distribution/workstreams/WS10-short-form-video.md`
2. **Distribution README task map**
    - `docs/marketing/distribution/README.md` — "Task → Work Stream Quick Map" table
3. **Root task list**
    - `buildos-strat-tasks.md` — per-task line status

All three in the same commit (or the same session if not committing yet).

## Status glyphs (canonical)

| Glyph | Meaning |
| ----- | ------- |
| ⚪    | Not started |
| 🟡    | Ready — unblocked |
| 🔵    | In progress |
| ✅    | Done |
| ⏸    | Blocked |
| 🔁    | Recurring |

## Voice checklist

Run before marking any content task ✅. If any item fails, revise before completing.

### Category & audience

- [ ] First contact does NOT lead with AI
- [ ] Category line "thinking environment for people making complex things" appears OR is clearly implied
- [ ] Audience order respected: authors → YouTubers → podcasters → newsletter operators → course creators → founder-creators
- [ ] ADHD is NOT in the hook, headline, title, or opening paragraph (it may appear as supporting affinity deeper in)

### Vocabulary

- [ ] At least one term from the topic map "terms to own" appears
- [ ] Vocabulary is used at least twice in a blog post, at least once in social copy
- [ ] "Interest media" is credited to Devin Nash on first use in any given artifact
- [ ] No banned first-contact terms: ontology, agentic orchestration, context infrastructure, AI-powered productivity, multi-agent, knowledge fabric

### Receipts

- [ ] Every claim of the form "research shows / studies show / people are" has a named source
- [ ] Named sources include a URL where possible
- [ ] Numbers are real: "2.2B views," "$666K/month," "1,610 clippers" — not rounded marketing numbers

### Cross-link discipline (blogs only)

- [ ] ≥2 inline links to prior cluster posts
- [ ] ≥1 link to the topic map for readers who want more
- [ ] `Article` JSON-LD validates
- [ ] `dateModified` is today

### Tone

- [ ] No emoji unless user explicitly asked
- [ ] No "🔥" / "💯" / "🧵" openers on any platform
- [ ] No listicle headlines (no "5 TIPS TO...", no "HERE'S WHY X IS DEAD")
- [ ] Closing line is memorable, standalone-quotable

### TikTok-specific (WS10 only)

- [ ] Script passes all 6 items of the WS10 rejection rubric (see [tiktok-scripts.md](./tiktok-scripts.md))
- [ ] CTA is chosen-input, not "follow me"
- [ ] One term-to-own is named at least twice

## What drift looks like in practice

These are the most common drift patterns. Catch them.

- **Status change in workstream file only.** README + strat-tasks still show old status.
- **Blog shipped, dashboard forgotten.** File on disk is ✅ but WS09 still shows 🟡.
- **Publish kit exists, no status update.** The publish-kit file implies ~2 hours of work; the dashboard shows zero progress.
- **TikTok script drafted inside a publish kit, WS10 T48 row still ⚪.** The kit is the evidence; update WS10 too.

## Commit discipline

When updating status, commit message format:

```
{area}: {one-line what} ({status before → after})

Examples:
WS09: T35 drafted (🟡 → 🔵)
WS09: T34 published (🔵 → ✅)
WS10: T48-T34 scripts drafted (⚪ → 🔵)
```

## When in doubt

Default to updating MORE files, not fewer. Drift is invisible damage; over-updating is a 30-second cost. Not a close call.
