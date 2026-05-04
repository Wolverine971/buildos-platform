<!-- docs/research/youtube-library/SOURCE_ANALYSIS_PUBLISHING_PLAN.md -->

# Source Analysis Publishing Plan

Tracking doc for splitting agent-skill content into three layered artifacts and publishing source analyses as their own public posts.

- **Initiated:** 2026-05-04
- **Owner:** DJ Wayne (with Claude as executor)
- **Reason:** Public agent-skill blogs were exposing internal monorepo filesystem paths in body content. Source analyses written for these skills sit unpublished in `docs/research/youtube-library/analyses/` and `docs/marketing/growth/research/youtube-transcripts/` — valuable proof-of-work content invisible to the world.

---

## Architecture decision

Each skill ships in **three layered artifacts**:

| Artifact                         | Location                                                          | Audience                                                                               | Filesystem paths allowed?                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Internal `SKILL.md` (draft)**  | `docs/research/youtube-library/skill-drafts/<slug>/SKILL.md`      | Agents running inside BuildOS repo (Claude Code, etc.); contributors editing the skill | Yes — references to local analyses, lineage YAML, primitive IDs                                                           |
| **Public skill blog**            | `apps/web/src/content/blogs/agent-skills/<slug>.md`               | Public website readers; external agents copying the skill                              | No filesystem paths in body. Links only to YouTube source URLs, WebAIM, and (as published) sibling source-analysis posts. |
| **Public source-analysis posts** | `apps/web/src/content/blogs/source-analyses/<creator>-<topic>.md` | Public readers wanting deep reads of individual videos. Standalone SEO-able pages.     | No filesystem paths.                                                                                                      |

**Routing.** A new top-level blog category `source-analyses/` will be created. Each analysis renders at `/blogs/source-analyses/<slug>`.

---

## Decisions resolved (2026-05-04)

1. ✅ **Category name:** `source-analyses` (top-level).
2. ✅ **Strip strategy on republish:** Move "BuildOS Application" and "Skill Draft Inputs" to a footer section called "How BuildOS uses this." Strengthens proof-of-work signal.
3. ✅ **Naming convention:** `<creator-slug>-<topic-slug>.md`. Drop dates from slug; keep them in frontmatter (`indexed_date`). Examples:
    - `designspo-visual-hierarchy.md`
    - `designspo-typography.md`
    - `kole-jain-7-ui-ux-mistakes-beginner.md`
    - `nesrine-changuel-delightful-products-framework.md`
4. ✅ **Phase 1 scope:** Patch all 5 already-published skills.
5. ✅ **Internal SKILL.md untouched.** Filesystem paths there are valid because that surface is for agents running in the repo.

---

## Phases

### Phase 1 — Patch (2026-05-04) ✅ COMPLETE

Goal: ensure no public skill exposes monorepo filesystem paths in body content + add forward-reference to source-analyses category on the YouTube-derived skills.

Tasks:

- [x] **Audit all 5 published skills** for body filesystem paths.
    - ✅ `google-calendar-for-ai-agents-search-before-you-create.md` — clean body (API integration skill, References section already points to public Google docs)
    - ✅ `hook-craft-short-form.md` — clean body (YouTube URLs only)
    - ✅ `landing-page-scorecard-funnel.md` — clean body (YouTube URLs only)
    - ✅ `story-driven-content-craft.md` — clean body (YouTube URLs only)
    - ⚠️ `ui-ux-quality-review.md` — body lines 506–512 exposed filesystem paths → patched
- [x] **Patch `ui-ux-quality-review.md`** — replaced "Agent-facing deep-dive references" section with a clean "Further reading" section pointing to public external resources (WebAIM, iOS HIG, Material Design) + forward-reference to source-analyses category.
- [x] **Add forward-reference to source-analyses category on the 3 YouTube-derived skills** (hook-craft-short-form, landing-page-scorecard-funnel, story-driven-content-craft). Replaces the dangling "lineage file maps these claims..." sentence with a consistent forward-reference.
- [x] **Skip google-calendar** — it's an API integration skill with no YouTube source analyses; its existing References section is already clean and audience-appropriate.
- [x] **Verify frontmatter fields aren't user-visible.** Confirmed: `skillSource`, `lineagePath`, `localPath` are invisible to website readers (page template ignores them; only `lineageSources.{title, url, creator, channelUrl}` are consumed by JSON-LD).

Frontmatter fields preserved across all 5 skills as authoring metadata. To revisit in Phase 3 if rendering rules change.

**Net result of Phase 1.** Zero body-content filesystem paths in any published skill. All 4 YouTube-derived skills carry the same forward-reference to `/blogs/source-analyses`, ready to be replaced with actual links as Phase 2 publishes posts.

### Phase 2 — Publish source analyses (2026-05-04, ui-ux wave) ✅ FIRST WAVE COMPLETE

Goal: convert internal analyses into public posts that the skill blogs link to.

Source analyses published for `ui-ux-quality-review` (6 unique posts, all live):

- [x] [`source-analyses/designspo-visual-hierarchy.md`](/blogs/source-analyses/designspo-visual-hierarchy) — 180 lines, 13 min read
- [x] [`source-analyses/designspo-typography.md`](/blogs/source-analyses/designspo-typography) — 229 lines, 18 min read
- [x] [`source-analyses/designspo-color-theory.md`](/blogs/source-analyses/designspo-color-theory) — 184 lines, 16 min read
- [x] [`source-analyses/designspo-golden-rule-web-design.md`](/blogs/source-analyses/designspo-golden-rule-web-design) — 179 lines, 9 min read
- [x] [`source-analyses/kole-jain-7-ui-ux-mistakes-beginner.md`](/blogs/source-analyses/kole-jain-7-ui-ux-mistakes-beginner) — 230 lines, 11 min read
- [x] [`source-analyses/nesrine-changuel-delightful-products-framework.md`](/blogs/source-analyses/nesrine-changuel-delightful-products-framework) — 309 lines, 22 min read

Infrastructure / wiring:

- [x] **Created `source-analyses` blog category** — added to `BLOG_CATEGORIES` in `apps/web/src/lib/utils/blog.ts` with name "Source Analyses" and color `amber`. Picked up automatically by `loadBlogPosts`, `loadBlogPostsByCategory`, and the dynamic `/blogs/[category]/[slug]` route.
- [x] **Updated `ui-ux-quality-review` public skill blog** — replaced the "Each source video above is being published as a standalone deep-read..." forward-reference with actual links to all 6 source analyses, organized as a "Deep-read source analyses" subsection.
- [x] **Verified end-to-end**: `pnpm check` passes (0 errors, 198 pre-existing warnings); dev server returns 200 for all 6 source-analysis URLs, the category index `/blogs/source-analyses`, and the original skill page.

Verification commands run:

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/blogs/source-analyses/<each-slug>
# all returned 200
curl -s http://localhost:5173/blogs/source-analyses
# rendered all 6 posts in the category index
```

### Phase 2 — remaining skills wave (2026-05-04) ✅ COMPLETE

Source analyses for the other 3 YouTube-derived skills, all live:

**hook-craft-short-form** (4 Kallaway videos):

- [x] [`source-analyses/kallaway-irresistible-hooks.md`](/blogs/source-analyses/kallaway-irresistible-hooks) — three-beat formula
- [x] [`source-analyses/kallaway-hooks-impossible-to-skip.md`](/blogs/source-analyses/kallaway-hooks-impossible-to-skip) — four-mistake diagnostic
- [x] [`source-analyses/kallaway-100-viral-hooks.md`](/blogs/source-analyses/kallaway-100-viral-hooks) — six archetypes catalog
- [x] [`source-analyses/kallaway-6-words-hook.md`](/blogs/source-analyses/kallaway-6-words-hook) — six-slot grammar

**landing-page-scorecard-funnel** (Priestley + Dunford):

- [x] [`source-analyses/daniel-priestley-1m-landing-page.md`](/blogs/source-analyses/daniel-priestley-1m-landing-page) — 3-part scorecard funnel
- [x] [`source-analyses/april-dunford-sales-pitch-framework.md`](/blogs/source-analyses/april-dunford-sales-pitch-framework) — Setup → Follow-Through positioning

**story-driven-content-craft** (3 Kallaway videos):

- [x] [`source-analyses/kallaway-master-storyteller.md`](/blogs/source-analyses/kallaway-master-storyteller) — six craft moves
- [x] [`source-analyses/kallaway-storytelling-genius-dopamine-ladders.md`](/blogs/source-analyses/kallaway-storytelling-genius-dopamine-ladders) — six-rung dopamine ladder
- [x] [`source-analyses/kallaway-7-storytelling-mistakes.md`](/blogs/source-analyses/kallaway-7-storytelling-mistakes) — failure-mode catalog

**google-calendar-for-ai-agents-search-before-you-create** — no source analyses (API integration skill).

Skill blogs updated to cross-link explicitly:

- [x] `hook-craft-short-form.md` — replaced forward-reference with 4 explicit links
- [x] `landing-page-scorecard-funnel.md` — replaced forward-reference with 2 explicit links
- [x] `story-driven-content-craft.md` — replaced forward-reference with 3 explicit links

Verification (all routes return 200):

```
curl /blogs/source-analyses                                              → 200 (lists all 15 posts)
curl /blogs/source-analyses/kallaway-irresistible-hooks                  → 200
curl /blogs/source-analyses/kallaway-hooks-impossible-to-skip            → 200
curl /blogs/source-analyses/kallaway-100-viral-hooks                     → 200
curl /blogs/source-analyses/kallaway-6-words-hook                        → 200
curl /blogs/source-analyses/daniel-priestley-1m-landing-page             → 200
curl /blogs/source-analyses/april-dunford-sales-pitch-framework          → 200
curl /blogs/source-analyses/kallaway-master-storyteller                  → 200
curl /blogs/source-analyses/kallaway-storytelling-genius-dopamine-ladders → 200
curl /blogs/source-analyses/kallaway-7-storytelling-mistakes             → 200
curl /blogs/agent-skills/hook-craft-short-form                           → 200
curl /blogs/agent-skills/landing-page-scorecard-funnel                   → 200
curl /blogs/agent-skills/story-driven-content-craft                      → 200
```

Per-post tasks:

1. Copy source analysis from `docs/.../analyses/` to `apps/web/src/content/blogs/source-analyses/`.
2. Apply public-blog frontmatter (title, description, author, date, tags, lineageSources, etc.).
3. Move "BuildOS Application" + "Skill Draft Inputs" sections to a "How BuildOS uses this" footer.
4. Verify the post renders at `/blogs/source-analyses/<slug>`.

Additional Phase 2 work:

- [ ] **Create routing/index** for the new `source-analyses` category. Verify it shows on `/blogs` index.
- [ ] **Add navigation** — sidebar/category landing page if applicable.
- [ ] **Update each skill blog** to add a "Related deep reads" section linking to the published analyses with proper URLs.

### Phase 3 — Maintenance & next skills

- [ ] Decide whether `skillSource`, `lineagePath`, `localPath` frontmatter fields should be:
    - (a) Removed from public blog frontmatter and kept only in internal `SKILL.md` files, OR
    - (b) Kept as authoring documentation (current state)
- [ ] Establish convention for new skills: every skill draft → analysis posts → public skill blog, in that order, before the public skill blog ships.
- [ ] Audit remaining skills in `docs/research/youtube-library/skill-drafts/` (the 16+ unpublished drafts) using the gap analysis pattern from `ui-ux-quality-review/GAP_ANALYSIS.md`.

---

## Status

- **Phase 1:** ✅ complete (2026-05-04). All 5 published skills audited; ui-ux-quality-review patched to remove filesystem-path body content; forward-references added to the 3 other YouTube-derived skills.
- **Phase 2 — ui-ux wave:** ✅ complete (2026-05-04). 6 source-analysis posts live; ui-ux-quality-review skill cross-linked; `source-analyses` category live.
- **Phase 2 — remaining skills wave:** ✅ complete (2026-05-04). 9 more source-analysis posts live (4 hook-craft, 2 landing-page, 3 storytelling). All 4 YouTube-derived skill blogs now cross-link to their analyses with explicit URLs. **15 total source-analysis posts published in the new category.**
- **Phase 3:** not started.

## What Phase 3 covers

Phase 3 is operational housekeeping, not new content:

1. **Decide whether `skillSource`, `lineagePath`, `localPath` frontmatter fields should stay** in the public blog frontmatter (they're invisible to readers — the page template ignores them) or move to internal `SKILL.md` files only.
2. **Establish convention for new skills:** every skill draft → publish source analyses → publish public skill blog. In that order.
3. **Audit the unpublished skill drafts** in `docs/research/youtube-library/skill-drafts/` (16+ drafts) using the gap analysis pattern from `ui-ux-quality-review/GAP_ANALYSIS.md` before they ship publicly. The dual-layer (principle + agent checks) structure should be the new default.

---

## Open questions

1. **JSON-LD structured data for source-analysis posts.** Each analysis post will have its own `lineageSources` (the original video). Should the analysis post also reference the parent skill in its JSON-LD as `isPartOf` or similar? Useful for SEO but adds complexity.
2. **Cross-skill source dedupe.** Some sources will be cited by multiple skills (e.g., DesignSpo's golden rule is relevant to UI review AND visual-craft-fundamentals when published). One post → multiple skill backlinks. The publishing system needs to support that.
3. **Unpublished-skill source analyses.** `docs/research/youtube-library/analyses/` contains analyses for skills that aren't yet drafted (e.g., `erik-kennedy_7-rules-gorgeous-ui_analysis.md`, `karri-saarinen-linear_craft-and-calm-software_analysis.md`). Should these be published independently as standalone reads, or held until their parent skill ships?
