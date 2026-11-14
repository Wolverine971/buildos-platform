<!-- tasker/147-builder-profiles.md -->

# 147 — Builder profiles (build-os.com/@handle)

**Status:** BUILT (ambitious) + round 2 redesign (10-25); round 1 committed in 81ca4bfa1; round 2 UNCOMMITTED, not deployed · **Opened:** 2026-10-23 · **Owner:** Claude
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

## Round 2 (DJ, 2026-10-25)

DJ: the page looked bare and "floating in space"; make it one cohesive card, links at the top
and the build log below; make the editor its own page with photo upload; the old editor at
Profile → People & agents was cluttered.

- **Page:** one card on the bench (sheet edge shadow), container queries so it lays out by its
  own width. Order: cover + photo, name/handle/location, headline, bio, socials, Now → Links
  (2 columns when wide) → Build log (headline numbers; grid fills the card, no scroll when
  wide) → Building (Live cards span both columns with a 2-column inside; Listed side by side)
  → Writing → Builds with → "Made in BuildOS" footer with the claim form.
- **Editor at `/profile/page`** (server-rendered with its data; `?section=` deep links). Left:
  Profile / Links / Projects / Updates / Settings panels. Right: the real card, updated as you
  type (`overlayView`), each part clickable to open its panel; opening a panel scrolls the card
  to it. Phone: Edit / Preview toggle. Everything autosaves (fields on blur, links and projects
  800 ms after the last change, switches at once); one Saving / Saved / Not saved in the top
  bar. Links: expandable rows, drag (or arrow keys) to reorder, globe/people audience toggle.
  Projects: page list + "Add a project" search picker + detail view (Listed/Live, name, pitch,
  link, audience, goals, milestone, looking for, this week). Settings: handle + switches.
  Name is editable (users.name).
- **Photo + cover upload:** crop dialog (drag, pinch, zoom, keys; 512×512 / 1500×500 WebP,
  JPEG fallback) → `POST /api/profile/builder/image` (bytes sniffed, ≤4 MB) → public bucket
  `builder-profile-images/{user_id}/`, old file removed. Migration `20261025090000` (bucket,
  `cover_url`, `get_builder_profile` returns it) APPLIED + recorded after rehearsal and a
  rollback dry run. Account deletion already clears `{user_id}/` objects.
- Profile → People & agents now shows a small "Your page" card linking to the editor;
  onboarding and the brief's drafts link point at `/profile/page`.
- **Checks:** svelte-check 0/0; eslint clean; builder tests 94 + brief section 11; browser on
  DJ's account (editor dark + light, canvas click → panel, panel → card scroll, phone width
  of page and editor via server HTML frames, no console errors).
- DJ uploaded a photo and published from the new editor himself on 10-25 at 16:45 UTC.

## Round 3 (DJ, 2026-10-25): stranger review + project pages

A fresh-eyes reviewer opened /@djwayne logged out (desktop, phone, dark, link preview, every
button). Biggest finding: the Writing section links to "Julian Episode 390" (Epstein/Maxwell show
notes), live on build-os.com because show_writing is on by default. Full findings and screenshots:
scratchpad `visitor/review/`; ranked list was sent to DJ. DJ picked the ambitious "clickable
project cards" item: a public page per Live project.

Built (UNCOMMITTED, not deployed):

- **Project pages** at `/@handle/<slug>` (`(public)/[handle=at_handle]/[project]`), bare layout like
  /@handle. Header (glyph, name, stage, by owner, pitch, Follow project, website with site icon),
  Looking for + "I'm interested", goals + next milestone, Updates (published lines + current
  line), Build log for that project only (who = "DJ / DJ's agents"), Writing from that project,
  Built by (owner + opted-in members, "+N others", Ask to join), More from DJ, claim footer.
  Owner sees Live/Draft bar with "Edit project" → `/profile/page?section=projects&project=<id>`.
- **Migration `20261025140000_builder_project_pages.sql` APPLIED + recorded**:
  `builder_profile_projects.reply_url` (https or mailto), `get_builder_profile` returns it on Live
  cards, new `get_builder_project(handle, slug, viewer)` reads the page through
  `get_builder_profile` (same visibility) and adds one Live project's year of days, published
  updates, project docs, opted-in members. anon + authenticated execute (logged-out page).
  Slug = lowercase name with runs of non [a-z0-9] → "-", or the project id (`project-pages.ts`
  `projectPaths`: first claim wins, duplicates/non-ASCII use the id).
- **Cards are clickable**: whole card (stretched link) opens the Live project's page, or a Listed
  project's website; Follow/Ask/website/reply links still work on their own.
- **"I'm interested"** under Looking for opens a link the owner sets (sign-up form, Calendly or
  email → mailto). No in-app inbox. Editor field in ProjectDetail; email shows a "will show on
  your page" hint.
- **Real site icons** on link tiles and project websites: `/api/public/site-icon?host=` fetches
  Google's favicon service server-side (raster only, 100 KB cap, edge-cached a week, 404 → letter
  tile). Privacy docs updated (not a processor: host names only).
- **Bug fixed**: signed-out project Follow came back as `?ask=` (ask-to-join flow). Now
  `?intent=follow&project=<id>`; Follow/Ask/track moved to `builder-visitor.svelte.ts`, shared by
  both pages. Shell + claim footer extracted (`BuilderPageShell`, `ClaimFooter`).
- Editor: "Use 9takes.com" one-tap link suggestion from your links; "Open page" link per Live
  project; editor opens a given project from `?project=`.
- `/@handle.json` projects carry `page_url`, `website`, `reply_url`.
- Checks: svelte-check 0/0, eslint clean, 116 builder tests (new: project-pages, site-icon,
  BuilderProjectPage, reply/suggestion, loadBuilderProject); browser logged out (desktop, phone,
  dark), card click-through, owner bar + editor in DJ's Chrome (view only), no console errors.
- 10-26 (DJ: "people can't tell that's the X logo"): social icons now use each platform's
  official mark (Simple Icons, CC0, inlined, no new dependency) instead of hand-drawn glyphs; X
  was a plain cross. Same component on the page and in the editor. `SocialIcon.test.ts` guards it.

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
- [ ] "Draft this week now" still re-reads the whole editor to get drafts.
- [ ] Two editor tabs open at once: last save wins (no conflict check).
- [ ] Real-phone check of /@handle and /profile/page (checked at 390px with server HTML only).
- [ ] DJ: turn Writing off on the live page (Julian Episode 390 is public there), or OK Claude to.
- [ ] DJ: set 9takes/BuildOS project links (tap "Use 9takes.com") and an "I'm interested" link.
- [ ] Review list items not yet picked: Writing opt-in per doc, contact/email/GitHub, per-person
      share card, Follow → sign-up with context, label rewrites, banner shrink, cookie-bar parity,
      phone grid "Apr" clip, tap for day details, stray "·", avatar alt, /p/ author link.
- [ ] Project page views count as profile views (same counter).
- [ ] Brief window is the last 24 h, so lines published on a day someone's brief skips are missed.
