<!-- docs/marketing/user-guides/user-guide-suite-meeting-brief-2026-06-23.md -->

# Meeting Brief — BuildOS User Guide Suite

**Date prepared:** 2026-06-23
**BuildOS task:** "Create User Guide Suite (ADHD/TPM/Writers/Devs)" — `82dfb1b6-e39d-48cb-8c32-d13c3e620daa` (was overdue since 2026-05-22, priority 2)
**Prepared by:** Claude (via BuildOS MCP + repo)

> This is an internal working doc for our review meeting. It is **not** a published blog post (filename is prefixed `_` and `published` is not set, so it won't appear on the site). Delete or move it whenever.

---

## TL;DR

Four persona guides are **written and published live** under a new `user-guides` blog category. They'll ship on the next web build/deploy. This brief is what we review together: what got made, the decisions I made, what's accurate, and what's still open.

---

## What shipped

New category: **User Guides** (`/blogs/user-guides`, color `teal`)

| #   | Guide                                  | Slug / URL                                                  | Words (approx) | Role                                         |
| --- | -------------------------------------- | ----------------------------------------------------------- | -------------- | -------------------------------------------- |
| 1   | **BuildOS for Writers**                | `/blogs/user-guides/buildos-for-writers`                    | ~1,150         | **Flagship** — leads the suite, priority 0.9 |
| 2   | BuildOS for Developers                 | `/blogs/user-guides/buildos-for-developers`                 | ~1,150         | Indie builders / engineers, AI-tool angle    |
| 3   | BuildOS for Technical Project Managers | `/blogs/user-guides/buildos-for-technical-project-managers` | ~1,150         | TPM / program managers, risk + portfolio     |
| 4   | BuildOS for Scattered Minds (ADHD)     | `/blogs/user-guides/buildos-for-adhd-minds`                 | ~1,050         | Supporting affinity lane, relief-first       |

All four: `author: DJ Wayne`, `published: true`, dated `2026-06-23`, cross-linked to each other's natural getting-started companions.

---

## Decisions made (your three calls, applied)

1. **Publish state → live.** All four set `published: true`. They go out on the next build. _(If you'd rather gate them, flip to `published: false` at the meeting — one-line change each.)_
2. **Location → new `user-guides` category.** Required two small code registrations to render: `BLOG_CATEGORIES` in `src/lib/utils/blog.ts` and `DEFAULT_CATEGORY_METADATA` in `scripts/generate-blog-context.ts`. `blog-context.json` regenerated (104 posts, 9 categories).
3. **ADHD framing → keep all 4, Writers as flagship, ADHD as supporting lane.** Per the current **Brand Guide** + **Marketing Strategy 2026**, which moved ADHD from a front door to a supporting affinity wedge. The ADHD guide deliberately avoids ADHD-first hype ("hits different for ADHD minds" was flagged 4/10 in the existing audit) and leads with relief + externalized working memory.

---

## Voice & positioning grounding

Pulled from BuildOS docs (current source of truth):

- **Brand Guide** (`010068ad`) — category, promise, differentiator, voice traits, terms-to-use / terms-to-avoid.
- **Marketing Strategy 2026** (`b36e74dc`) — audience order (authors + YouTubers primary; ADHD/founders supporting), show-don't-tell, lead-with-relief.
- **Target Audience** (`770fbed8`).

Every guide follows the positioning stack: **category → promise → proof → contrast → moat**, and the voice rules (grounded, clear, relieving, contrarian, systems-literate; no AI hype; no FOMO closes). I deliberately did **not** use the older "side hustle to empire" Brand Voice Reference doc (`be7936d0`) — it conflicts with the 2026 reposition.

## Product accuracy

Features referenced are grounded in the existing live posts (`how-buildos-works.md`, `under-the-hood.md`): brain dump → goals / plans / tasks / documents (+ milestones, risks), **Project Lens** zoom + scoped chat modes (Project Audit, Project Forecast, Entity Focus, Global Chat), daily briefs, SMS reminders, flexible props/facets. No invented features.

**Typecheck:** `svelte-check` run on the web app after the `blog.ts` change (result noted in chat).

---

## Agenda for our meeting

1. **Read the flagship (Writers) first** — is the voice right? It sets the tone for the other three.
2. **ADHD framing gut-check** — does "Scattered Minds, supporting lane, no hype" feel right, or do you want it dropped/swapped for a YouTubers guide (the fully on-strategy move)?
3. **Publish call** — leave live, or pull to draft until you've read all four?
4. **Hero images** — `pic` is currently metadata-only (OG uses the site default), so no broken images. Do we want real hero art per guide before/after promoting them?
5. **Suite hub + cross-linking** — should `who-is-buildos-for.md` (flagged for rewrite) point into this suite? Should the homepage/landing link the persona guides?
6. **Distribution tie-in** — these were scoped to "land after the LinkedIn queue when guides get referenced more." Which LinkedIn/IG posts should link which guide?
7. **Missing personas** — YouTubers/creators is the primary wedge and has _no_ guide yet. Add a 5th?

## Open items / follow-ups

- [ ] YouTubers/creators guide — primary wedge, currently uncovered.
- [ ] Decide on hero images (`pic`) per guide.
- [ ] Reconcile/retire `who-is-buildos-for.md` against this suite (it's the ADHD-heavy 2024-vintage page).
- [ ] BuildOS task `82dfb1b6` — mark in-progress/done. **I did not write to BuildOS** (per your standing "no writes unless asked" rule). Say the word and I'll update the task status + add a doc linking the suite.
- [ ] Consider a `/blogs/user-guides` suite index intro / pinning the flagship.
