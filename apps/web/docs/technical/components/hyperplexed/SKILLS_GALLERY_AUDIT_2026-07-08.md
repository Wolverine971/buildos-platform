<!-- apps/web/docs/technical/components/hyperplexed/SKILLS_GALLERY_AUDIT_2026-07-08.md -->

# Skills Gallery Audit 2026-07-08

Target: `/skills`, `/skills/[slug]`, `/skills/preview/[slug]`, `/skills/domain/[domain]`, `/skills/family/[family]`, `/skills/path/[path]`, and the skill/path Try launchers

Scope: Phase 1 user-first gallery shell, Phase 2 user-first skill detail template, Phase 3 domain rabbit-hole routes plus the first BuildOS try launcher, Phase 4 pack/stack path pages, Phase 5 curated metadata registry, Phase 6 generated gallery metadata sync, Phase 7 production-preview visual verification, and the 2026-07-10 controlled catalog-coverage phase.

## Regions

- Hero and search tool
- Featured skill cards
- Domain map cards
- Packs and stacks cards
- Skill result cards
- Right rail: rabbit hole, families, agent artifacts
- Skill detail hero, procedure, prompts, boundaries, related skills, lineage, and agent rail
- Domain detail hero, domain search, path steps, skill families, packs, and agent rail
- Pack/stack path hero, ordered stages, related domains, related paths, and agent rail
- Try route redirect and chat draft handoff
- Reviewed runtime preview detail, family-tree, search, and Try surfaces
- Publication coverage counts and default-internal enforcement
- Curated gallery metadata registry
- Generated public catalog and `buildos.yaml` gallery metadata
- Guest footer resource link

## Shipped Fixes

### Tier 1 - cheap, high-impact

- Page shell uses the shared `max-w-7xl mx-auto px-2 sm:px-4 lg:px-6` width and padding scale -> P3.
- Search, filter buttons, cards, and result rows use 44px-plus targets and visible focus rings -> P13.
- Skill titles, family rows, result badges, and card descriptions are clamped or truncated so long names cannot break alignment -> P1.
- Metadata such as domain, source count, reference count, skill type, and output shapes is rendered as subtext or chips instead of competing headings -> P4.
- Section labels use `.micro-label` consistently -> P5.
- Public footer now links users to `Skill Gallery` instead of the agent repository first -> P6.

### Tier 2 - structural within the surface

- `/skills` is separated from `/agent-skills`: the new route leads with user jobs, while agent artifacts remain one click away -> P6+P8.
- Domain cards expose a broad-to-specific map, then the right rail turns the selected domain into a path and family list -> P4.
- Domain cards now expose separate `Filter` and `Map` actions, avoiding a hidden route behind a filter-only card -> P8+P13.
- Packs and stacks expose separate `Filter` and `Path` actions, so users can either refine the gallery or open the ordered workflow -> P7+P8+P13.
- Icons are lucide exports from `$lib/icons/lucide.ts`, with fixed icon containers on repeated cards -> P9.
- Gallery URL helpers live in `src/lib/skills/skill-gallery.ts`, so the gallery and detail route share one path model -> P3+P6.
- Curated domain, pack, family, output-shape, workflow, guardrail, and starter-prompt metadata moved into `src/lib/skills/skill-gallery-metadata.ts`, while `skill-gallery.ts` keeps heuristic fallbacks for unregistered skills -> P3+P6.
- Public skill index items and bundle `buildos.yaml` files now include a generated `gallery` block with display title, family, domain, output shapes, workflow, use cases, guardrails, starter prompts, and metadata source flags -> P4+P6.
- The shared gallery helper prefers generated public metadata when present, then curated registry overrides, then runtime/slug fallbacks for incomplete future skills -> P3+P6.
- `/skills/[slug]` now gives each skill a user-first detail page with visible use cases, prompts, workflow, boundaries, related skills, lineage, and agent artifacts -> P4+P8.
- `/skills/domain/[domain]` gives each domain its own rabbit-hole page with local search, path steps, family sections, related packs/stacks, and 44px mobile controls -> P3+P7+P13.
- `/skills/path/[path]` gives each pack or stack an ordered workflow page with stages, start-skill CTA, domain links, related paths, and agent file access -> P3+P4+P8+P13.
- `/skills/try/[slug]` preserves skill intent through registration and hands signed-in users an editable chat draft without auto-sending -> P6+P8+P13.
- Runtime workflow text is cleaned before rendering so internal markdown helper syntax does not leak into the user-facing page -> P6.

### Tier 3 - polish/signature

- Deferred. The Phase 1 route intentionally avoids a signature hover/glow effect until live visual verification confirms density, contrast, and mobile behavior.

## Verification

- Targeted Prettier on the touched gallery, detail, domain, launcher, navigation, and chat modal files.
- `pnpm run check` -> 0 errors, 0 warnings
- Live `/skills` check at 1280px and 390px: 8 cards rendered, no horizontal overflow.
- Search for `calendar` narrows to the Google Calendar skill.
- Growth domain filter shows the two cold-email skills after clearing search.
- Founder Content Pack filter shows the three content skills.
- Live `/skills/cold-email-engagement-first-outreach` check: detail page renders What It Does, Try It, Procedure, Boundaries, For Agents, SKILL.md, bundle, and repository links.
- Live 390px detail check: no horizontal overflow, no tiny article links, primary actions remain 44px high.
- Live `/skills/domain/sales-and-growth` check at 1280px: domain page renders the path, domain search, two growth skills, packs/stacks, Try links, and no horizontal overflow.
- Domain search for `icp` narrows to `Cold Email ICP And Signal Design`.
- Guest `/skills/try/cold-email-engagement-first-outreach` check redirects to `/auth/register` with `open=agent-chat`, the skill slug, and the generated prompt preserved.
- Live 390px domain check: no horizontal overflow; main controls and pack skill links remain 44px high.
- Baseline and post-Phase-4 `pnpm run check` -> 0 errors, 0 warnings.
- Live `/skills` check at 1280px: 4 pack/stack path links rendered, no horizontal overflow.
- Live `/skills/path/founder-content-pack` check at 1280px: path page renders the hero, three ordered stages, Try/Open/SKILL actions, domain link, related path, and no horizontal overflow.
- Live `/skills/domain/marketing-and-content` check: domain sidebar links to three relevant paths.
- Live 390px path check: no horizontal overflow; all main controls remain at least 44px high.
- Post-Phase-5 `pnpm run check` -> 0 errors, 0 warnings.
- Post-Phase-6 `pnpm exec vitest run src/lib/server/agent-skills.test.ts` -> 12 tests passed.
- Post-Phase-6 `pnpm run agent-skills:check` -> 8 skills, 13 public reference files, 0 errors, 0 warnings.
- Post-Phase-6 `pnpm run check` -> 0 errors, 0 warnings.
- Post-Phase-7 production preview visual matrix checked `/skills`, `/skills/cold-email-engagement-first-outreach`, `/skills/domain/marketing-and-content`, and `/skills/path/founder-content-pack` at 1280x720 and 390x844 in light and dark mode.
- Post-Phase-7 matrix result: 16 route/theme/viewport checks, no horizontal overflow, no missing required copy, no undersized visible main controls, nonblank viewport screenshots, and theme toggle hydration confirmed.
- Preview console review found no new gallery errors; stale dev-server `@fs` import errors were isolated to the earlier Vite dev-server tab.

## Deferred

- Authenticated end-to-end launcher smoke with a real signed-in session.
- Full public coverage for runtime skills that do not yet have gallery-quality metadata.

## Follow-Up Implementation — 2026-07-10

### Shipped

- Global search now returns skills, domains, packs/stacks, public references, and editorial guides; skill cards explain the matched field and value, and results can be sorted by featured order, name, domain, or last-updated date -> P4+P6+P7.
- `/skills/family/[family]` adds family-scoped search and parent-to-child skill trees. Public children link directly; runtime-only children stay visible with an explicit `Gallery entry pending` state -> P4+P6+P8.
- Family routes are linked from the gallery, domain pages, and skill detail headers with explicit 44px controls -> P6+P8+P13.
- Skill detail prompt cards preserve the selected starter prompt, add `Copy prompt`, and expose `buildos.yaml`, compatibility, eval coverage, last-updated metadata, and linked public reference files -> P4+P6+P8+P13.
- Curated pack/stack metadata now includes a pack-level example prompt and explicit handoff rules. `/skills/try/path/[path]` launches the complete ordered workflow as one editable BuildOS draft instead of opening only stage one -> P4+P6+P8.
- Pack/stack pages now explain when to use each stage and show the handoff contract beside the ordered path -> P4+P6.
- Friendly `/skills/[domain]`, `/skills/[domain]/[skill]`, `/skills/packs/[pack]`, and `/skills/stacks/[stack]` aliases resolve to the canonical gallery routes -> P6.
- Generated gallery metadata now includes eval coverage, last-updated dates, and safety notes; catalog validation treats missing trust metadata as blocking.
- Sitemap generation now includes 21 dynamic public gallery URLs across skills, domains, families, and paths.
- Mobile follow-up raised family navigation and detail-family links to the 44px interaction floor -> P13.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 16 tests passed.
- `pnpm run agent-skills:check` -> 8 skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` -> 0 errors, 0 warnings.
- `pnpm gen:sitemap` -> 21 dynamic gallery URLs; 121 total sitemap URLs.
- Live 1280px and 390px checks covered global search, match explanations, reference and pack results, `/skills/family/cold-outreach`, child-only family search, `/skills/path/founder-content-pack`, prompt copy, detail agent/trust links, guest pack redirect, and friendly route aliases.
- Light and dark desktop plus light and dark 390px family checks showed no horizontal overflow; visible main controls met the interaction-size bar after the P13 follow-up.

### Still Deferred

- Authenticated end-to-end skill and pack launcher smoke with a real signed-in session.
- Promotion of the remaining reviewed previews and internal runtime skills to full public entries.

## Catalog Coverage Phase — 2026-07-10

### Shipped

- The runtime catalog now applies an explicit `public | preview | internal` publication model. Published blog-backed skills win, explicitly reviewed runtime metadata creates previews, and every other enabled runtime skill stays internal by default -> P4+P6.
- Catalog coverage is generated from the enabled runtime registry: 52 total, 8 public, 7 preview, and 37 internal. Tests assert that the buckets sum to the enabled registry and that an unreviewed runtime ID stays internal.
- Seven Cold Outreach children now have reviewed, user-first preview metadata: Offer Lab, Research Anchors, Outreach Compiler, Taste Review, Deliverability Readiness, Reply OS, and Learning Review.
- `/skills/preview/[slug]` exposes only reviewed synopsis fields: promise, use cases, output shapes, workflow, guardrails, starter prompts, eval status, and update date. It deliberately exposes no portable link, internal reference module, repository path, or raw runtime definition -> P4+P6+P8.
- `/skills` surfaces previews as a separate status, includes them in typed search, and links to preview details and editable Try launches. The status is visually distinct without competing with published featured skills -> P4+P6+P7.
- `/skills/family/cold-outreach` now links all seven reviewed previews and selects the parent Engagement-First Outreach workflow as the start skill instead of relying on catalog order -> P3+P6+P8.
- Preview Try launches validate selected starter prompts, pass the runtime skill ID, preserve the reviewed draft through registration, and explicitly pause before external action -> P6+P8+P13.
- Sitemap generation now includes seven preview routes for 28 dynamic gallery URLs and 128 total URLs.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 18 tests passed.
- `pnpm run agent-skills:check` -> 8 public skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` -> 0 errors, 0 warnings.
- `pnpm run gen:sitemap` -> 28 dynamic gallery URLs; 128 total sitemap URLs.
- Desktop light and dark checks at 1280x720 plus mobile light and dark checks at 390x844 showed no horizontal overflow on the gallery and preview detail surfaces.
- `/skills` rendered 8 published skills and 7 reviewed previews. Search for `production cost` returned the preview-only Offer Lab result.
- `/skills/family/cold-outreach` rendered seven preview links, no pending Cold Outreach child, and `/skills/cold-email-engagement-first-outreach` as the root start action.
- Guest preview Try preserved the selected prompt, `open=agent-chat`, and `skill=cold_email_offer_lab` through `/auth/register`; the generated editable draft was 298 characters and did not auto-send.

### Still Deferred

- Authenticated end-to-end skill and pack launcher smoke with a real signed-in session.
- Publication review and metadata authoring for the remaining 37 internal runtime skills.
