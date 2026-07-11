<!-- apps/web/docs/technical/components/hyperplexed/SKILLS_GALLERY_AUDIT_2026-07-08.md -->

# Skills Gallery Audit 2026-07-08

Target: `/skills`, `/skills/[slug]`, `/skills/people/[slug]`, `/skills/preview/[slug]`, `/skills/domain/[domain]`, `/skills/family/[family]`, `/skills/path/[path]`, and the skill/path Try launchers

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
- Skill-expert cards, profiles, reviewed-source relationships, and editorial disclosures

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
- Catalog coverage is generated from the enabled runtime registry: 51 core skills plus optional Libri, 8 public, 20 preview, and 23 core internal. Libri raises the enabled/internal totals to 52/24 when active. Tests assert that the buckets sum to the enabled registry and that an unreviewed runtime ID stays internal.
- Seven Cold Outreach children now have reviewed, user-first preview metadata: Offer Lab, Research Anchors, Outreach Compiler, Taste Review, Deliverability Readiness, Reply OS, and Learning Review.
- Five Interface Quality workflows now have reviewed preview metadata: Build Quality UI/UX, Visual Craft Fundamentals, Accessibility And Inclusive UI Review, Marketing Site Design Review, and Information Architecture Review.
- Eight Content Craft workflows now have reviewed preview metadata: Content Strategy Beyond Blogging, Content Creation Pipeline, Idea Expansion Lens, Storyboard Journey Lens, Lived Conviction Lens, Framework Extraction Lens, Sensory Double-Tap, and Medium Tailoring.
- `/skills/preview/[slug]` exposes only reviewed synopsis fields: promise, use cases, output shapes, workflow, guardrails, starter prompts, eval status, and update date. It deliberately exposes no portable link, internal reference module, repository path, or raw runtime definition -> P4+P6+P8.
- `/skills` surfaces previews as a separate status, includes them in typed search, and links to preview details and editable Try launches. The status is visually distinct without competing with published featured skills -> P4+P6+P7.
- `/skills/family/cold-outreach` now links all seven reviewed previews and selects the parent Engagement-First Outreach workflow as the start skill instead of relying on catalog order -> P3+P6+P8.
- Family routes now support preview roots and standalone reviewed siblings. `/skills/family/interface-quality` selects Build Quality UI/UX as its start preview, then shows one public workflow and five reviewed previews without pretending the unpublished artifacts are portable -> P3+P4+P6+P8.
- Reviewed metadata can explicitly mark the intended family start. This prevents an unrelated parentless public skill from outranking a broader reviewed router, while preserving the published Cold Outreach root. Standalone preview cards now label `Root workflow` or `Child of …` as quiet hierarchy metadata -> P4+P6+P8.
- Preview Try launches validate selected starter prompts, pass the runtime skill ID, preserve the reviewed draft through registration, and explicitly pause before external action -> P6+P8+P13.
- Sitemap generation now includes 20 preview routes for 41 dynamic gallery URLs and 141 total URLs.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 18 tests passed.
- `pnpm run agent-skills:check` -> 8 public skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` -> 0 errors, 0 warnings.
- `pnpm run gen:sitemap` -> 41 dynamic gallery URLs; 141 total sitemap URLs.
- Desktop light and dark checks at 1280x720 plus mobile light and dark checks at 390x844 showed no horizontal overflow on the gallery and preview detail surfaces.
- `/skills` rendered 8 published skills and 20 reviewed previews. Search for `production cost` returned the preview-only Offer Lab result.
- `/skills/family/cold-outreach` rendered seven preview links, no pending Cold Outreach child, and `/skills/cold-email-engagement-first-outreach` as the root start action.
- `/skills/family/interface-quality` rendered one public workflow and five standalone previews, used `/skills/preview/build-quality-ui-ux` as the root start action, and narrowed to Information Architecture Review for the preview-only query `wayfinding`.
- Interface Quality desktop/mobile light/dark checks at 1280x720 and 390x844 showed no horizontal overflow. The reviewed root preview exposed no `/agent-skills/` links.
- Guest Interface Quality Try preserved the selected prompt, `open=agent-chat`, and `skill=build_quality_ui_ux` through `/auth/register`; the generated editable draft was 309 characters and did not auto-send.
- `/skills/family/content-craft` rendered three public workflows, two preview roots, and six preview children. The start action resolved to `/skills/preview/content-strategy-beyond-blogging`, not the unrelated parentless Viral Content public skill.
- Content Craft search for `angle spread` narrowed to Idea Expansion Lens and retained the `Child of Content Creation Pipeline` hierarchy label.
- Content Craft desktop/mobile light/dark checks at 1280x720 and 390x844 showed no horizontal overflow; the browser console reported no warnings or errors.
- Guest Content Craft Try preserved the selected prompt, `open=agent-chat`, and `skill=content_strategy_beyond_blogging` through `/auth/register`; the generated editable draft was 332 characters and did not auto-send.
- Guest preview Try preserved the selected prompt, `open=agent-chat`, and `skill=cold_email_offer_lab` through `/auth/register`; the generated editable draft was 298 characters and did not auto-send.

### Still Deferred

- Authenticated end-to-end skill and pack launcher smoke with a real signed-in session.
- Publication review and metadata authoring for the remaining 23 core internal runtime skills, plus optional Libri when enabled.

## Planning And Ops Coverage — 2026-07-10

### Shipped

- Seven reviewed Project Operations previews now cover Project Creation, Project Audit, Project Forecast, Plan Management, Task Management, Task State Updates, and Document Workspace. Project Creation is the explicit family/domain start; Task State Updates retains its child relationship to Task Management -> P3+P4+P6+P8.
- Domain discovery now merges published skills with reviewed previews. `/skills` shows five domain cards, and a preview-only domain can be filtered and opened without fabricating a published skill -> P3+P6+P7.
- `/skills/domain/planning-and-ops` renders 0 published skills, 7 reviewed previews, one Project Operations family, a Project Creation start action, combined preview search, safe preview cards, and publication-aware agent copy -> P4+P6+P8+P13.
- Preview-first domains resolve through the friendly `/skills/[domain]` alias. Root and domain JSON-LD include reviewed previews, and sitemap generation includes preview-only domains and families.
- The runtime coverage split is now 8 public, 27 reviewed previews, and 16 core internal skills. Optional Libri raises enabled/internal totals to 52/17.
- The designated family start is sorted first on domain pages, while root/child labels remain quiet hierarchy metadata.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 19 tests passed.
- `pnpm run agent-skills:check` -> 8 public skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` -> 0 errors, 0 warnings before an unrelated untracked analytics file appeared during the final pass; final `pnpm exec svelte-check --no-tsconfig` still reports 0 errors and 0 warnings across Svelte surfaces.
- `pnpm run gen:sitemap` -> 50 dynamic gallery URLs; 150 total sitemap URLs.
- `/skills` rendered 8 published skills, 27 reviewed previews, and 5 domains. Planning And Ops exposed seven entries and filtered to seven previews with the explicit `No published skills in this view` state.
- `/skills/domain/planning-and-ops` rendered Project Creation first and as the start preview. Search for `trajectory` narrowed to Project Forecast; the Task State Updates card retained `Child of Task Management`.
- `/skills/family/project-operations` selected `/skills/preview/project-creation` as its start and rendered all seven previews.
- `/skills/preview/project-creation` exposed no portable file, bundle, repository path, raw runtime ID, or console warning/error. Guest Try preserved `open=agent-chat`, `skill=project_creation`, the reviewed prompt, and the pause-before-action instruction through registration.
- Desktop 1280x720 and mobile 390x844 checks in light and dark mode found no horizontal overflow on the gallery, domain, family, or preview surfaces.

### Still Deferred

- Authenticated end-to-end skill and pack launcher smoke with a real signed-in session.
- Publication review and metadata authoring for the remaining 16 core internal runtime skills, plus optional Libri when enabled.

## Product Quality Coverage — 2026-07-10

### Shipped

- Four additional reviewed Interface Quality previews now cover Calm Software Design Review, Delightful Product Review, Design System Architecture Review, and Usability Quick Research. Each preserves its runtime child relationship to Build Quality UI/UX -> P3+P4+P6+P8.
- The metadata is publication-safe and user-first: concrete outputs, workflows, use cases, guardrails, and starter prompts are public; raw runtime definitions, internal reference modules, and repository paths remain private.
- The Interface Quality family now presents one public workflow and nine reviewed previews, keeps Build Quality UI/UX as the explicit start preview, and searches the new workflow, boundary, and prompt fields.
- The runtime coverage split is now 8 public, 31 reviewed previews, and 12 core internal skills. Optional Libri raises enabled/internal totals to 52/13.
- Sitemap generation includes the four new preview routes for 54 dynamic gallery URLs and 154 total URLs.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 19 tests passed.
- `pnpm run agent-skills:check` -> 8 public skills, 13 public reference files, 0 errors, 0 warnings.
- Clean baseline `pnpm run check` -> 0 errors, 0 warnings. A later full rerun was interrupted by a concurrent History-page import mismatch outside the gallery scope.
- `pnpm run gen:sitemap` -> 54 dynamic gallery URLs; 154 total sitemap URLs.
- `/skills/family/interface-quality` rendered nine reviewed previews with Build Quality UI/UX first. Search for `habituation` narrowed to Delightful Product Review; all new entries retained `Child of Build Quality UI/UX`.
- `/skills/preview/design-system-architecture-review` exposed no portable file, bundle, repository path, raw internal path, or reference-module metadata.
- Guest Design System Architecture Review Try preserved `open=agent-chat`, `skill=design_system_architecture_review`, the reviewed starting prompt, and the pause-before-action instruction through registration.
- Desktop 1280x720 and mobile 390x844 checks in light and dark mode found no horizontal overflow on the Interface Quality family and preview surfaces. The only console error was the local secondary Vite server's websocket-port collision, not an application exception.

### Still Deferred

- Authenticated end-to-end skill and pack launcher smoke with a real signed-in session.
- Publication review and metadata authoring for the remaining 12 core internal runtime skills, plus optional Libri when enabled.

## Root Density Follow-Up — 2026-07-10

### Shipped

- Root search result counts are one readable summary instead of six competing pills, while typed
  result cards remain complete -> P4+P7.
- Published skill cards cap output chips at three and demote domain, source, and reference totals to
  one compact metadata row -> P4.
- Selected-domain and selected-pack path links now meet the 44px interaction floor -> P13.
- The root gallery summarizes 31 reviewed previews with six cards and an explicit 44px
  `aria-expanded` show-all/show-fewer control. Search results still return every match, and all
  preview routes remain linked through search, filters, families, domains, and the sitemap -> P7+P8+P13.

### Verification

- Default 390×844 document height fell from 20,253px to 12,588px (about 38%) with zero horizontal
  overflow; the expanded state renders all 31 previews and collapses back to six.
- Live 390×844 and 1440×900 light/dark checks covered search, selected-domain state, preview
  expansion/collapse, 44px selected-filter links, one main landmark, and one H1.
- `pnpm exec vitest run src/lib/skills/skill-gallery.test.ts` -> 6 tests passed.
- `pnpm check` -> 0 errors, 0 warnings.

## Expert Credibility Follow-Up — 2026-07-10

### Shipped

- `Trust And Lineage` resolves registered people into evidence-dense expert cards with a real
  portrait, role context, a short `Why BuildOS listens` explanation, specialty chips, and an
  explicit profile link. Unregistered people retain a safe plain-name fallback -> P1+P4+P5+P8+P13.
- `/skills/people/[slug]` adds a reusable expert profile surface covering background, specialties,
  BuildOS's editorial rationale, primary/profile sources, linked skills, and every reviewed source
  material dynamically traced from published skill metadata -> P3+P4+P6+P8+P13.
- Eight people now have registered profiles: Kane Kallaway, Lenny Rachitsky, Kole Jain, April
  Dunford, Daniel Priestley, Nesrine Changuel, Tuan Le, and Michael Seibel. The expansion rule is
  evidence-based: prioritize direct reviewed creators, the share of a published skill that depends
  on their work, and visibly incomplete lineage panels before incidental framework references ->
  P4+P6.
- Kane's profile traces seven reviewed videos across Hook Craft and Story-Driven Content Craft.
  Lenny's traces two hosted interviews across two skills, and Kole's traces two direct source videos
  into UI/UX Quality Review. Each profile labels self-reported metrics, links background claims to
  verification sources, and states that inclusion does not imply review, approval, or endorsement.
- Lineage matching distinguishes creator from channel host. Lenny's two episodes credit April
  Dunford and Nesrine Changuel as the framework sources while labeling Lenny as the publishing host;
  the UI never silently converts a host into the author of a guest's process.
- Capped Source Highlights reserve one relevant source per profiled person before filling remaining
  slots in source order. This keeps the person card and its evidence visible together even when a
  skill has more than five source materials -> P4+P8.
- Skill source highlights now link directly to the original material and back to the relevant
  expert profile. Skill JSON-LD mentions the registered person; the expert route emits
  `ProfilePage` + `Person` structured data.
- All eight public portraits are locally hosted to avoid fragile hotlinking, while the original
  public profile remains credited. Expert pages are generated into the sitemap.
- `/skills/people` now provides the directory promised by the first follow-up: CollectionPage and
  ItemList structured data, a clear inclusion/no-endorsement standard, eight reusable expert cards,
  and dynamic reviewed-source/skill counts. Individual profiles navigate back to this directory as
  well as the full gallery -> P3+P4+P6+P8+P13.
- April, Daniel, Nesrine, Tuan, and Michael form the second evidence-prioritized batch. April and
  Nesrine retain direct framework authorship on Lenny-hosted interviews; Daniel and Tuan expose the
  primary or sole source layer behind their respective published skills; Michael is scoped to the
  investor-email mode rather than generalized across the outreach skill.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-experts.test.ts src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts` -> 24 tests passed.
- `pnpm run agent-skills:check` -> 8 public skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` -> 0 errors, 0 warnings.
- `pnpm run gen:sitemap` -> 57 dynamic gallery URLs; 157 total sitemap URLs.
- Live `/skills/hook-craft-short-form` verified the expert card, portrait, four source links, profile
  navigation, 44px controls, and zero horizontal overflow at 1280px.
- Live `/skills/people/kane-kallaway` verified the portrait, two linked skills, seven reviewed
  sources, four background/profile sources, and disclosure copy at 1280×720 and 390×844.
- Live `/skills/ui-ux-quality-review` verified two expert cards, the unprofiled-name fallback, Kole's
  creator links, Lenny's host link, representative source selection, 44px controls, and zero
  horizontal overflow.
- Live `/skills/people/lenny-rachitsky` verified two hosted sources across two skills with guest
  attribution; `/skills/people/kole-jain` verified two direct sources and its 900×900 portrait.
  Both profile templates passed 1280×720 and 390×844 checks with zero horizontal overflow.
- Light and dark checks showed legible textures, cards, links, and portrait treatment with zero
  horizontal overflow. The only console error was the known secondary Vite websocket-port
  collision, not an application exception.

### Second Profile Batch Verification

- `pnpm exec vitest run src/lib/skills/skill-experts.test.ts src/lib/skills/skill-gallery.test.ts src/lib/server/public-page-sitemap.test.ts` -> 13 tests passed.
- `pnpm run guardrails:agent-skills` -> 8 skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` completed without Svelte diagnostics.
- `pnpm run gen:sitemap` -> 63 dynamic gallery URLs; 163 total sitemap URLs, including the people
  index and all eight profiles.
- Live `/skills/people` at 1440×900 and 390×844 verified eight cards, dynamic counts, local
  portraits, the editorial inclusion standard, one main landmark, one H1, and zero horizontal
  overflow. Desktop light and dark modes remained legible with no broken named images.
- Live lineage checks confirmed Daniel + April + Lenny on Landing Page Scorecard Funnel; Kole +
  Nesrine + Lenny on UI/UX Quality Review; Tuan on Viral Content For Boring Brands; and Michael on
  Engagement-First Outreach. No tested route had horizontal overflow or a broken named portrait.
- Live `/skills/people/april-dunford` verified direct creator attribution, reviewed-material copy,
  directory/gallery back-navigation, and the mobile dark portrait/header composition.
- A final landmark pass removed the nested page-level `<main>` from both people templates; the
  shell now contributes the single main landmark on the directory and individual profile routes.

### Next

- Audit the ten-name ICP framework lineage separately. Several names are currently indirect
  framework references rather than reviewed-source creators, so do not promote them solely because
  they appear in `lineagePeople`.
- Continue with direct outreach-source creators only after each page can support a non-thin public
  background and an explicit source-to-skill relationship.

## Cross-Repository People Alignment — 2026-07-10

### Shipped

- `/skills` and `/agent-skills` now use the same compact `SkillExpertLink` primitive, `People`
  micro-label, three-person display cap, `+N more` treatment, 44px interaction floor, portrait
  treatment, and canonical `/skills/people/[slug]` destination -> P3+P4+P5+P8+P13.
- Registered experts render as linked portrait chips; unregistered lineage names retain an
  intentionally non-clickable initials fallback instead of producing dead or invented profile
  URLs. The first eleven registered person links on both collection routes resolve in the same
  order with identical hrefs.
- Agent-skill detail pages now reuse the same person links in Source Lineage. Direct creators link
  to their BuildOS profile, external creator/channel links remain available, and a registered host
  is labeled separately as `Host profile` so channel ownership does not overwrite framework
  authorship.
- Collection and detail JSON-LD now reference canonical expert `Person` entities. The public agent
  index and generated portable `buildos.yaml` expose `lineage_profiles` with name, slug, and
  canonical URL while retaining the full plain-name `lineage_people` list.
- The `/agent-skills` public shell now matches the gallery's `max-w-7xl` spacing rhythm, uses the
  shared icon wrapper, standardizes inner radii to `rounded-md`, and raises card actions to the
  44px interaction floor -> P2+P3+P9+P13.
- Four direct outreach-source creators form the third sourced profile batch: Connor Murray, Aaron
  Shepherd, Sam McKenna, and Steli Efti. Each page includes a locally hosted portrait, current role
  context, evidence-linked background, specialties, an explicit editorial rationale, and a scoped
  source-to-skill relationship. Self-reported performance claims remain labeled as such.

### Verification

- `pnpm exec vitest run src/lib/skills/skill-experts.test.ts src/lib/skills/skill-gallery.test.ts src/lib/server/agent-skills.test.ts src/lib/server/public-page-sitemap.test.ts` -> 26 tests passed.
- `pnpm run guardrails:agent-skills` -> 8 skills, 13 public reference files, 0 errors, 0 warnings.
- `pnpm run check` completed with no Svelte diagnostics.
- `pnpm run gen:sitemap` -> 67 dynamic gallery URLs and 167 total sitemap URLs, including all 12
  expert profiles.
- Live 1440x900 checks found one main landmark, one H1, no broken named portraits, no horizontal
  overflow, and identical 44px canonical person links on `/skills` and `/agent-skills`.
- Live `/agent-skills/cold-email-engagement-first-outreach` verified canonical links for Connor,
  Aaron, Sam, Steli, and Michael plus safe unlinked fallbacks for Austin Schneider and Florin
  Tatulea. The public JSON index returned the same five canonical `lineage_profiles`.
- Live `/agent-skills/landing-page-scorecard-funnel` preserved April Dunford as the direct creator
  and labeled Lenny Rachitsky separately as the host. `/skills/people/connor-murray` rendered its
  900x900 portrait, one linked reviewed source, and four profile/background citations.
- `/skills` and `/agent-skills` passed 390x844 mobile checks with wrapping 44px person chips and no
  horizontal overflow. `/agent-skills` also passed a 1440x900 dark-mode legibility check.

### Next

- Austin Schneider and Florin Tatulea are the next direct-source profile candidates because both
  remain visible in the Engagement-First Outreach lineage. Promote them only when the public
  background and portrait evidence can support a non-thin profile.
- Keep the ten-name ICP framework lineage as a separate authorship audit; do not turn indirect
  framework mentions into expert profiles without a reviewed-source relationship.
