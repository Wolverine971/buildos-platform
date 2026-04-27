<!-- buildos-strat-tasks.md -->

# BuildOS Distribution Strategy: Task List

**Companion to:** `buildos-strat.md`
**Created:** 2026-04-16
**Owner:** DJ
**Legend:** `[C]` Code · `[W]` Content/Writing · `[R]` Research · `[O]` Ops

**Ranking model:** Leverage (1–5) × Urgency (1–5) ÷ Effort (hours). Higher = do sooner.

---

## Top 5 — Do This First

These unblock everything else. Bias toward completing them inside Week 1–2.

| #   | Task                                              | Type | Effort               | Why it's P0                                                                                          |
| --- | ------------------------------------------------- | ---- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | **LLM citation baseline measurement**             | [R]  | ~2 hrs               | Without a baseline, we can't claim any GEO lever is working. Blocks the primary success metric.      |
| 2   | **End-user publish UX audit**                     | [R]  | ~4 hrs               | Unblocks the single highest-leverage code task (public pages Phase 1).                               |
| 3   | **Add `SoftwareApplication` + `FAQPage` JSON-LD** | [C]  | ~3 hrs               | Low-effort, permanent, measurably boosts LLM citation rate.                                          |
| 4   | **Creator-subreddit research + rules inventory**  | [R]  | ~4 hrs               | Reddit runway is 3 months of karma before first post. Every day not started is a day later to posts. |
| 5   | **Start Reddit karma accumulation**               | [O]  | 15 min/day × 90 days | Same 3-month clock. Starting this week means posts in July, not August.                              |

---

## Wave 1 — Days 1–30: Foundations & Measurement

Goal: Establish baseline, start the Reddit clock, close quick-win schema gaps, scope the Phase 1 publish UI.

### Research & Measurement

**T1. LLM citation baseline** `[R]` · 2 hrs · Leverage 5 / Urgency 5

- Run the 6 prompts in `buildos-strat.md` §3 research task 4 against ChatGPT, Claude, Perplexity
- Record: does BuildOS appear? position? framing? match to "thinking environment" positioning?
- Save results to `docs/marketing/measurement/llm-citation-baseline-2026-04.md`
- **Done when:** baseline file committed + monthly re-run cadence entered on calendar

**T2. End-user publish UX audit** `[R]` · 4 hrs · Leverage 5 / Urgency 5 · **✅ Spec drafted 2026-04-16**

- Inventory existing components: where could a publish toggle live? (project page, DocumentModal, settings, share menu)
- Map the existing `/api/onto/documents/[id]/public-page/{prepare,confirm,live-sync}` flow to a minimum user journey
- Identify missing UI pieces (toggle, slug editor, copy-link, visibility selector)
- **Done when:** design brief in `apps/web/docs/features/public-pages/phase-1-ui-brief.md` with annotated screenshots of target entry points
- **Output:** [apps/web/docs/features/public-pages/phase-1-ui-brief.md](apps/web/docs/features/public-pages/phase-1-ui-brief.md) (v3, 9 PRs, ~13.5 days). Screenshots still pending from DJ.
- **Key finding:** DocumentModal already contains ~95% of the publish UI. Phase 1 is about discoverability (project-panel `Published` section), sharing (copy-link), author-owner-bar on public pages, URL canonicalization to `/p/{user_name}/{slug}`, views + comments, and mobile parity — not rebuilding the flow.

**T3. Creator-subreddit research** `[R]` · 4 hrs · Leverage 4 / Urgency 5 · **✅ Completed 2026-04-17**

- For each target sub (see `buildos-strat.md` Part 4 list): subscriber count, daily active estimate, self-promotion rules verbatim, 3–5 recent threads where BuildOS would be a legit rec
- **Done when:** `docs/marketing/social-media/reddit/target-subs-2026.md` committed
- **Output:**
    - [docs/marketing/social-media/reddit/reddit-subreddit-tracker.md](docs/marketing/social-media/reddit/reddit-subreddit-tracker.md) — master tracker with 20 subs + recurring-thread inventory + cultural canaries
    - [docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md](docs/marketing/social-media/reddit/subreddit-profiles/INDEX.md) — profile database index
    - `docs/marketing/social-media/reddit/subreddit-profiles/{sub}.md` — 20 per-sub profiles with rules verbatim, culture signal, thread-type inventory, and karma-building plans
- **Key findings:** r/youtubers is CLOSED (de-prioritize); r/NewTubers has a formal mod-approval path for product posts (highest-EV); r/Notion self-promo thread is fortnightly (not weekly); ADHD/productivity/getdisciplined have zero BuildOS mention surface (karma-farm only); 8 subs hard-ban AI framing (sidebar or rule text); 14 of 20 subs are `strict` / `strict-but-structured` on promo — the 90/10 rule is non-negotiable on Reddit.

**T4. Schema markup gap check** `[R]` · 1 hr · Leverage 3 / Urgency 4

- Confirm exactly which pages are missing `SoftwareApplication` and `FAQPage`
- Draft the JSON-LD blocks (content, not code yet)
- **Done when:** draft blocks in PR description or scratch doc, ready for T5 to implement

**T5. Domain-level GEO baseline** `[R]` · 2 hrs · Leverage 3 / Urgency 3

- Check current state of: Wikipedia entry (likely none), Wikidata entity, brand-query ranking on Google
- Identify which entity anchors we should create
- **Done when:** notes in baseline file with T1

### Code

**T6. Add `SoftwareApplication` schema to homepage** `[C]` · 1 hr · Leverage 4 / Urgency 4

- File: `apps/web/src/routes/+page.svelte`
- Use existing `SEOHead` component's `jsonLd` prop
- Include `@type: "SoftwareApplication"`, `name`, `description`, `applicationCategory: "BusinessApplication"`, `operatingSystem: "Web"`, `offers`
- **Done when:** schema validates on schema.org validator + Rich Results Test

**T7. Add `FAQPage` schema to `/help`** `[C]` · 2 hrs · Leverage 3 / Urgency 3

- File: wherever `/help` route lives
- Requires FAQ content to exist as structured data (inventory first, add if missing)
- **Done when:** validates + Rich Results Test passes

**T8. `dateModified` accuracy pass on blog posts** `[C]` · 1 hr · Leverage 2 / Urgency 3

- Ensure frontmatter `lastmod` is updated when blog content is edited (not just published)
- Consider a git-hook or CI check
- **Done when:** spot-check of 5 blog posts shows accurate `dateModified`

### Content

**T9. README overhaul** `[W]` · 4 hrs · Leverage 4 / Urgency 4

- Rewrite `/README.md` and `apps/web/README.md` per `buildos-strat.md` §3.7
- Creator-framed category line, concrete before/after example, screenshots with alt text, Mermaid architecture diagram, links to `/how-it-works` and framework doc
- **Done when:** both READMEs pushed; screenshots render on GitHub

### Ops

**T10. Reddit account hygiene + karma start** `[O]` · 1 hr setup, then 15 min/day · Leverage 5 / Urgency 5

- Pick a real-sounding username (not branded)
- Set up profile (no BuildOS in bio for now)
- Comment daily in 2–3 target creator subs, purely value-contribution
- Target: ~500 comment karma per primary sub in 90 days
- **Done when:** account exists + daily cadence started (verify weekly)

**T11. Create r/buildos subreddit** `[O]` · 30 min · Leverage 2 / Urgency 4

- Pure defensive squat. Low effort.
- Set basic rules, description, sidebar
- Don't promote until public pages Phase 1 ships
- **Done when:** subreddit exists + moderated

---

## Wave 2 — Days 30–90: Build the Core Surface

Goal: Ship the end-user publish UI. Publish the flagship content. Make the site look like a thinking environment, not a SaaS.

### Code

**T12. Public pages Phase 1 — end-user publish UI** `[C]` · ~13.5 eng days (per v3 spec) · Leverage 5 / Urgency 5 · **✅ All 9 PRs + onboarding claim implemented 2026-04-17 (uncommitted, one-swoop)**

- **Biggest code task in this doc.** Blocks Phases 2–5 and most content loops.
- Build from T2 design brief: [apps/web/docs/features/public-pages/phase-1-ui-brief.md](apps/web/docs/features/public-pages/phase-1-ui-brief.md)
- **v3 locked scope (one-swoop delivery):** copy-link + footer attribution + URL canonicalization · `Published` insight panel in project right rail · unpublish · view tracking · author-only Owner Bar on public pages · author attribution + stub `/p/{user_name}` · comments on public pages · `users.username` + onboarding claim · mobile parity · polish.
- **9 PR sequence** in the brief's Implementation Sequencing section. All 9 landed in one session. See the brief's **Implementation status** + **Follow-ups** + **Explicitly punted** sections for the must-do short follow-ups (comment notifications to doc author, scroll-to-publish on `?openPublish=true`, unit test for comment access gate) and the deferred items (project header chip, comment report endpoint, mobile long-press menu, etc.).
- **Done when:** any authenticated user can publish, share-link, unpublish, comment on, and view stats for a project doc — from web UI on desktop and mobile — QA'd on staging.
- **Pre-merge actions:** apply migrations `20260430000000_add_public_page_views.sql` and `20260430000001_add_users_username.sql`, run `pnpm gen:types`, browser smoke test all happy paths per brief checklist.

**T13. Verify "Made with BuildOS" attribution on public page template** `[C]` · 1 hr · Leverage 4 / Urgency 4

- Check `apps/web/src/routes/(public)/p/[slug]/+page.svelte` and `/p/[slugPrefix]/[slugBase]/+page.svelte`
- If missing or weak: add tasteful footer badge linked to homepage with UTM (`utm_source=public-page&utm_medium=attribution`)
- **Done when:** every public page renders the badge + link resolves with UTM params

**T14. Promote `/how-it-works` to dedicated route** `[C]+[W]` · 1 day · Leverage 4 / Urgency 3

- Current state: blog post at `/blogs/getting-started/how-buildos-works`
- New state: dedicated route `/how-it-works` with richer layout
- Content per `buildos-strat.md` §3.3 — capture surface, working map, project memory, calendar, daily briefs
- JSON-LD `Article` schema
- Redirect old blog URL → new route (301)
- **Done when:** route live, schema validates, old URL redirects

### Content (The Flagship)

**T15. Thinking-environment framework doc** `[W]` · ~1 week · Leverage 5 / Urgency 5

- Working title: "How BuildOS Holds a Complex Project Together: The Thinking-Environment Framework"
- 2,500–4,000 words
- Specific numerical claims where possible
- Question-based headers
- JSON-LD `Article` schema, accurate `datePublished` + `dateModified`
- Publish to: build-os.com blog + Medium + Substack cross-post (canonical = build-os.com)
- **Done when:** all three surfaces live + linked from homepage, README, `/how-it-works`

**T16. Refresh Notion comparison (creator-framed)** `[W]` · 1 day · Leverage 3 / Urgency 3

- Current: `buildos-vs-notion-adhd-minds.md` (ADHD-framed, stale positioning)
- New: reframe as "BuildOS vs Notion for creators" or split into "for authors" + "for YouTubers" variants
- 301 redirect from old slug
- **Done when:** refreshed post live + redirect in place

**T17. Write 2 new creator-framed comparisons** `[W]` · 2 days · Leverage 3 / Urgency 2

- BuildOS vs Scrivener for long-form fiction
- BuildOS vs Milanote / Workflowy for creative thinking
- Honest weaknesses included; no strawmanning
- **Done when:** both live with schema

### Ops

**T18. Integration marketplace inventory** `[O]` · 4 hrs · Leverage 3 / Urgency 2

- List every integration BuildOS has (start with `.env.example` + `packages/`)
- For each: find partner marketplace / directory / "built on" page
- Capture submission URL, required assets, copy-length constraints
- **Done when:** `docs/marketing/distribution/integration-marketplaces.md` has the full inventory

**T19. Integration marketplace submissions (wave 1)** `[O]` · 2 days · Leverage 3 / Urgency 2

- Submit to top 5 partner directories from T18
- Use creator-framed copy (not "AI-first PM tool")
- **Done when:** 5 listings submitted; track approval status

**T20. Wikipedia / Wikidata entity creation** `[O]` · 3 hrs · Leverage 3 / Urgency 2

- BuildOS likely has no entity anchor — this is a direct LLM-citation lever
- Wikidata first (much lower bar than Wikipedia)
- Wikipedia only if notability threshold is realistically cleared
- **Done when:** Wikidata entity exists; Wikipedia decision documented

---

## Wave 3 — Days 90–180: Expand the Surface

Goal: Ship the viral mechanics (clone-as-template, gallery). Keep Reddit rhythm. Start the quarterly cadence.

### Code

**T21. Public pages Phase 3 — visual design audit** `[C]` · 1 week · Leverage 4 / Urgency 3

- Align public page template with Inkprint design system
- Visual bar: Notion-level polish. Feels like a working surface, not a dashboard.
- Use `design-update` skill
- **Done when:** public page template matches brand guide visual direction

**T22. Public pages Phase 4 — clone-as-template** `[C]` · 1–2 weeks · Leverage 5 / Urgency 3

- "Use this as a template" action on public pages
- Preserves structure, clears personal data, creates new authenticated project for viewer
- Track clone count; display as social proof ("X people used this template")
- **Done when:** any logged-in viewer can clone a public project into their workspace

**T23. Public changelog at `/changelog`** `[C]+[W]` · 2 days · Leverage 3 / Urgency 2

- Dated weekly entries; raw "what shipped" format (Linear / Vercel / Resend style)
- Can be markdown-driven or route-rendered
- Use `compound-engineering:changelog` skill for generation
- **Done when:** live at `/changelog`; first 4 weeks backfilled

**T24. `/compare` hub page** `[C]+[W]` · 1 day · Leverage 2 / Urgency 2

- Index of all comparison pages with `ItemList` JSON-LD
- **Done when:** live + links to all comparison posts

### Content

**T25. First quarterly deep piece (beyond framework)** `[W]` · 1 week · Leverage 4 / Urgency 3

- Pick from candidates in `buildos-strat.md` §5 (pattern study on creator project structures, or AI-chat stateless-context problem)
- Same rigor as T15
- **Done when:** published across build-os.com + Medium + Substack + promoted once on Reddit, X, LinkedIn

**T26. Seed 10–20 DJ public projects for gallery** `[W]` · 2 days · Leverage 4 / Urgency 2

- Prerequisite for Phase 5 gallery
- Mix: a book project structure, a video-series plan, a launch plan, a research project
- Make them genuinely useful to read (collaboration-framed, not vanity)
- **Done when:** projects published with collaboration-seeking framing

### Ops

**T27. Reddit posts begin** `[O]` · ongoing · Leverage 5 / Urgency 3

- **Gate:** only after ~500 comment karma per primary sub (hit around day 90)
- Start with creator subs: r/writing, r/YouTubers, r/Substack
- Follow post targets in `buildos-strat.md` Part 4
- **Done when:** first post lands + didn't get banned + re-run monthly

**T28. Monthly LLM citation re-measurement** `[R]` · 1 hr/month · Leverage 4 / Urgency 3

- Recurring. Same prompts as T1. Track delta month-over-month.
- **Done when:** calendar reminder set; first re-run committed

---

## Wave 4 — Days 180+: Compound

Goal: Compound the surface. Gallery live. Sustained content cadence.

**T29. Public pages Phase 5 — discovery gallery** `[C]` · 2 weeks · Leverage 5 / Urgency 2

- Route: `/gallery` or `/showcase`
- Filterable by creator type (book, video series, podcast, newsletter, launch, research)
- Seeded with T26 projects
- **Done when:** live + featured on homepage

**T30. URL migration to `/@username/project-name`** `[C]` · 1 week + migration · Leverage 3 / Urgency 2 · **⚠ Partially pulled into T12 per v3 spec**

- **v3 update (2026-04-16):** The `/p/{user_name}/{slug}` form is now canonical as part of T12 (see [phase-1-ui-brief.md URL format section](apps/web/docs/features/public-pages/phase-1-ui-brief.md)). Infrastructure already supports the two-part route. T30 now narrows to: (1) decide on dedicated `username` field vs derived-from-name (currently derived); (2) eventual `/@username/project-name` format vs the current `/p/user_name/slug` — a pure cosmetic migration for later.
- Only after Phase 5 stabilizes
- 301 redirects from old `/p/{slug}` URLs
- **Done when:** new URL pattern live + redirects verified

**T31. Public pages Phase 6 — social layer (likes/comments/follows)** `[C]` · multi-week · Leverage 2 / Urgency 1

- **Gate:** only if gallery has sustained activity. Empty social layers hurt the product.
- Revisit decision at day 270.

**T32. Quarterly deep piece cadence** `[W]` · ongoing · Leverage 4 / Urgency 2

- One new 2,500–4,000 word piece per quarter minimum
- Covers remaining candidate topics from §5

**T33. Lighthouse / Core Web Vitals tooling** `[C]+[O]` · 4 hrs · Leverage 1 / Urgency 2

- Not urgent, but worth verifying table-stakes performance
- Lighthouse CI on marketing pages; baseline scores recorded
- **Done when:** scores tracked monthly alongside T28

---

## WS09 — Anti-Feed Content Cluster (T34–T45)

Parallel cluster play. **Different cadence from WS04 flagship** — 10 posts in ~3 months at 7–10 day intervals, vocabulary-ownership-focused. See [`docs/marketing/strategy/anti-feed-content-topic-map.md`](docs/marketing/strategy/anti-feed-content-topic-map.md) for the canonical topic map and [WS09](docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md) for execution detail.

**T34. "Social Media Is Dead. What You're Using Is Interest Media."** `[W]` · 1 d · Leverage 5 / Urgency 4 · **✅ Published 2026-04-17**

- Manifesto post; coins "interest media"; credits Devin Nash
- Output: [`apps/web/src/content/blogs/philosophy/social-media-is-dead-interest-media.md`](apps/web/src/content/blogs/philosophy/social-media-is-dead-interest-media.md)

**T35. "You Stopped Choosing What You Think About"** `[W]` · 1 d · Leverage 5 / Urgency 5 · **🔵 Drafted 2026-04-27**

- Felt-experience post; owns "chosen input" (13×); required vocab "chosen input," "direction of the arrow," "anti-feed"
- Links to T34 + `your-morning-without-the-algorithm.md` + `anti-ai-assistant-execution-engine.md`
- Output: [`apps/web/src/content/blogs/philosophy/you-stopped-choosing-what-you-think-about.md`](apps/web/src/content/blogs/philosophy/you-stopped-choosing-what-you-think-about.md) (2,238 words, ~11 min)
- Publish kit: [`docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-kit.md`](docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-kit.md) — all 5 lanes drafted (X, LinkedIn, IG, 2 TikToks, 3 Reddit)
- WS10 T48 row: 🔵 / 🔵 (scripts drafted, not recorded)
- Drafted on T44 due date (2026-04-27); next gate is publish + posting

**T36. "What a Thinking Environment Actually Is"** `[W]` · 1 d · Leverage 5 / Urgency 4

- Product-principles post; category-definition primer
- **Reconcile with WS04 T15 before drafting** — see [WS09 §Boundary with WS04](docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md#boundary-with-ws04-flagship-content)

**T37. "The Three-Minute Morning That Fixes Your Day"** `[W]` · 1 d · Leverage 4 / Urgency 3

- Practical / tactical; brain-dump-first, inbox-second
- Ranks for "morning routine" adjacencies

**T38. "Why Most Productivity Tools Are Feeds in Disguise"** `[W]` · 1 d · Leverage 5 / Urgency 3

- Competitive positioning; calls out Notion/Linear/etc. without being mean
- **Cross-link rule:** must link to T34 + T36
- Becomes the bridge between WS09 and WS05 (comparisons)

**T39. "The Quiet Half of the Internet"** `[W]` · 1 d · Leverage 4 / Urgency 2

- Cultural essay; positions BuildOS alongside Substack, Discord, podcasts
- Highest backlink potential in the cluster

**T40. "Why AI Will Collapse the Clipping Economy by 2028"** `[W]` · 1 d · Leverage 4 / Urgency 2

- Forecast post; evergreen backlink magnet
- Pulls receipts from T45 library

**T41. "Authenticity Is the Only Moat Left"** `[W]` · 1 d · Leverage 3 / Urgency 2

- Creator / founder audience; bridges anti-AI doctrine

**T42. "The Three Feelings You Don't Have Words For Yet"** `[W]` · 1 d · Leverage 4 / Urgency 2

- Vocabulary post: feed paranoia, curiosity collapse, algorithm-shaped thoughts

**T43. "Writing Is Thinking. Scrolling Is Receiving."** `[W]` · 1 d · Leverage 4 / Urgency 2

- Philosophy post; establishes direction-of-the-arrow metaphor as a standalone shareable idea

**T44. Anti-feed publishing cadence** `[W]` · 🔁 · Leverage 5 / Urgency 5 · **🔵 Started 2026-04-17 (T34 anchor)**

- One post from T35–T43 every 7–10 days
- If you miss the 10-day window by >3 days twice in a row, re-plan — the compounding effect degrades
- See [RECURRING §Anti-feed publishing cadence](docs/marketing/distribution/RECURRING.md#anti-feed-publishing-cadence-t44)

**T45. Anti-feed receipts library** `[R]` · 30 min/week · Leverage 3 / Urgency 2

- Running scratchpad for evidence: paid-clipping proof, algorithm-behavior research, Cal Newport / Tristan Harris / Johann Hari quotes, regulatory developments
- Location: `docs/marketing/research/anti-feed-receipts-library.md` (create on first capture)

---

## WS10 — Short-Form Video (TikTok, Counter-Positioned) (T46–T51)

TikTok as proof, not participation. Every cluster blog gets 2 scripts; every script must pass the counter-positioning rubric. Operational home: [WS10](docs/marketing/distribution/workstreams/WS10-short-form-video.md). Dispatcher: [`anti-feed` skill](.claude/skills/anti-feed/SKILL.md).

**T46. TikTok account setup** `[O]` · 2 hrs · Leverage 3 / Urgency 4 · **⚪**

- Bio, link-in-bio, handle, display name, cover, first pinned video (T47 explainer)
- Display name: "DJ Wayne" (founder-led). Handle: prefer `@djwayne`, fallback `@buildos`
- Bio: "thinking environment for people making complex things · read the anti-feed → build-os.com"
- DJ-only
- **Done when:** profile live, pinned video set, link-in-bio pointing to cluster or build-os.com

**T47. Backfill TikTok scripts for published cluster posts** `[W]` · 1 d · Leverage 4 / Urgency 4 · **⚪**

- 2 scripts each for T34 + `your-morning-without-the-algorithm.md` = 4 scripts
- Generated via `anti-feed` skill (menu option 2)
- First script recorded + pinned as part of T46
- **Done when:** 4 scripts committed to publish kits, rubric passes, T48 dashboard populated

**T48. TikTok pair per cluster blog** `[W]` · 🔁 · ~1 hr per blog · Leverage 5 / Urgency 4 · **🔁 ⚪**

- 2 scripts per cluster blog (T35–T43): one 30–45s hook-on-vocabulary, one 60–90s explainer
- Same term-to-own across both scripts (repetition is the compound play)
- Generated inside the publish kit for each blog
- Cross-posted to Reels + Shorts unless documented reason not to
- **Done (per blog) when:** both scripts drafted, rubric passes, both recorded, both posted within 7 days of blog publish, cross-posts verified

**T49. TikTok posting cadence** `[O]` · 🔁 · Leverage 5 / Urgency 4 · **🔁 ⚪ Started 2026-04-17**

- Post both TikToks within 7 days of corresponding blog going live
- If window missed by >3 days twice in a row, re-plan
- Tracking: `docs/marketing/social-media/tiktok/posted.md`
- See [RECURRING §TikTok cadence](docs/marketing/distribution/RECURRING.md#tiktok-cadence-t49)

**T50. Counter-positioning rubric** `[W]` · 2 hrs · Leverage 5 / Urgency 4 · **⚪**

- 6-point rejection rubric every script must pass: founder-led, receipts-first, vocabulary discipline, no clip-farm tactics, chosen-input CTA, calm pacing
- Expands with examples of pass/fail per rule
- Referenced from `anti-feed` skill's `tiktok-scripts.md`
- **Done when:** `docs/marketing/social-media/tiktok/counter-positioning-rubric.md` committed and linked from the skill

**T51. Monthly TikTok qualitative review** `[R]` · 🔁 · 30 min/month · Leverage 3 / Urgency 2 · **🔁 ⚪**

- First Monday of the month (same sitting as T28 LLM remeasure)
- Qualitative: is vocabulary showing up in comments? Has any TikTok been quoted back by a larger voice?
- NOT a follower-count review
- Output: `docs/marketing/measurement/tiktok-review-YYYY-MM.md`
- Kill criteria: after Q3 2026, if vocabulary-engaged comments <10% AND zero pickup-quotes, reassess

---

## Dependency Map

Tasks that must complete before others can start:

```
T1 (baseline) ──────────────► T28 (monthly remeasure)
T2 (UX audit) ──────────────► T12 (Phase 1 UI)
T12 ──────► T13, T14, T21, T22 (everything downstream of public UI)
T12 + T26 ─► T29 (gallery needs both UI & seed content)
T22 ──────► T31 (social layer gated on clone-as-template)
T3 (sub research) ─► T10 (karma) ─► T27 (first posts, 90-day gate)
T15 (framework doc) ─► all Reddit posts that cite it
T18 ──────► T19 (inventory before submissions)
T34 (done) ─► T35 ─► T36 … ─► T43 (7–10 day cadence, T44 wraps all)
T35 + T36 + T38 should land before T15 goes public (cluster primes the flagship)
T46 (account setup) ─► T47 (backfill) ─► T48 (per-blog recurring) ─► T49 (cadence)
T50 (rubric) gates every T47 + T48 script before it ships
Every T34–T43 blog triggers a T48 row (WS10 is downstream of WS09, not independent)
```

---

## Cross-Cutting Guardrails

Apply to every task in this list:

- **Positioning check.** Before shipping any public copy, verify against `docs/marketing/brand/brand-guide-1-pager.md`. Category = "thinking environment for people making complex things." Don't lead with AI. ADHD is supporting affinity only.
- **Schema check.** Any new public page → JSON-LD on day one. Use the existing `SEOHead` component.
- **Freshness discipline.** When content is edited, `dateModified` gets bumped. No exceptions.
- **Honesty over polish.** Comparison pages include real weaknesses. Changelog is dated raw. READMEs don't hype.
- **Founder disclosure on Reddit.** Always, every time BuildOS is mentioned. Transparency is protective.

---

## What This List Does NOT Include

Explicit non-goals per strategy doc:

- GEO measurement tools (build manual process first)
- Traditional SEO tactics (keyword-stuffed posts, link building, programmatic SEO)
- Public social feed before public pages exist
- Re-pivoting to ADHD-founder positioning

If you're tempted to add any of the above, re-read `buildos-strat.md` §3 "Explicit Non-Goals" before acting.
