<!-- tasker/147-builder-profiles.md -->

# 147 — Builder profiles (build-os.com/@handle)

**Status:** BUILT (ambitious), UNCOMMITTED, not deployed · **Opened:** 2026-10-23 · **Owner:** Claude
**Spec:** `docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md` · **Mockup:** https://claude.ai/artifact/7zHm28L8Lty5pjR1s54Fez

## What users get

A public page at build-os.com/@handle: header, Now line, socials, links, the projects they pick
(Listed or Live), a year of active days ("with agents" as a second tone), their public pages, and
who they build with. Visitors follow a person or a project (updates land in their daily brief) and
ask to join a live project (an ordinary people request the owner approves). Agents read it as
data. Everything is private until published; every project starts hidden.

## DJ calls (2026-10-23)

Ambitious. Calls 2–6 taken as recommended: build log counts only projects on the page (switch adds
private work as numbers); weekly lines drafted by BuildOS and approved by the owner; two audiences
(anyone, people I work with); "with agents" tone on by default; "Your page" in the app.

## Built

- **DB** `supabase/migrations/20261024020000_builder_profiles.sql` — APPLIED to prod + recorded
  (rehearsal passed; dry run with ROLLBACK on DJ's data first). Tables `builder_profiles`,
  `builder_profile_links`, `builder_profile_projects` (owner-only trigger), `builder_profile_updates`,
  `builder_follows`, `builder_profile_activity_daily`, `builder_profile_stats_daily`; functions
  `get_builder_profile` (anon + authenticated, fails closed), `builder_profile_target`,
  `refresh_builder_profile_activity`, `bump_builder_profile_stat` (server only).
- **Server** `apps/web/src/lib/server/builder-profile/` (service + drafts), shared
  `apps/web/src/lib/builder-profile/` (types, links, format, agent-json).
- **Routes** `/(public)/[handle=at_handle]` (page), `/(public)/[file=at_handle_json]` (agent JSON),
  `/api/builders/[handle]/{follow,ask}`, `/api/public/builders/[handle]/event`,
  `/api/profile/builder{,/links,/projects,/publish,/draft,/updates,/preview}`,
  `/api/cron/builder-profiles` (daily 11:00 UTC in `apps/web/vercel.json`: activity refresh; Friday
  weekly drafts). Param matchers in `apps/web/src/params/`.
- **Page** `apps/web/src/lib/components/builder-profile/` (BuilderProfilePage, ProjectCard,
  BuildLog, ActivityBars, SocialIcon). Root layout hides app chrome on `/@handle`.
- **Editor** Profile → People & agents → Your page (`#your-page`), with live preview.
- **Brief** `apps/worker/src/workers/brief/builderFollowsBriefSection.ts`: "From People You Follow"
  and "Your Page" (drafts waiting). Deterministic, no model call.
- **Agents** MCP `get_builder_profile`; `find_buildos_person` adds `profile_url` when published.
- **Other** `/p/{author}` 302 → `/@handle` once published; publishing sets findability to handle and
  findability can't be turned off while live; reserved handles extended; signup prefills
  `?handle=`; onboarding Ready step points at Your page; privacy page + CLAIMS K6 + DATA_INVENTORY.
- **Checks** migration rehearsal + rollback dry run on DJ's data; svelte-check 0/0; eslint clean;
  worker typecheck clean; tests: builder profile 57 + editor-related 23/9 + people tools 18 + p/[slug]
  5 + brief section 15; browser check on DJ's account (page, editor, preview, no console errors);
  anonymous draft → 404, `.json` → not found, draft views not counted, follow needs sign-in.
- **Seeded** DJ's page as a DRAFT (BuildOS + 9takes live, Radar + Wayne Strategies listed, X,
  LinkedIn, BuildOS and 9takes links). Not published. Bio untouched.

## Open

- [ ] DJ: review the draft at Profile → Your page, then Publish (and add Instagram/TikTok if wanted).
- [ ] Paid check (needs DJ OK): one "Draft my page" + one "Draft this week now" on DJ's account to
      see the model's wording. Cost: two small `fast`-profile JSON calls (well under $0.01 each,
      estimate; not measured).
- [ ] Deploy web (Vercel) for the page, editor, cron; deploy worker (Railway) for the brief section.
- [ ] Share image: pages use the default BuildOS image; a per-person card needs a font-safe renderer.
- [ ] View/tap counters accept any POST (owner-only vanity numbers); add rate limiting if abused.
- [ ] `pnpm gen:all` to add the new tables to generated types (needs SUPABASE_ACCESS_TOKEN); code uses
      loose casts until then.
- [ ] Editor: no field to paste a photo link (Google photo or initials only); "Draft this week now"
      reloads the whole editor to get drafts; the preview frame uses viewport breakpoints.
- [ ] Phone-width visual check of /@handle not done in a real phone (layout is single column, 16px gutter).
- [ ] Brief window is the last 24 h, so lines published on a day someone's brief skips are missed.
