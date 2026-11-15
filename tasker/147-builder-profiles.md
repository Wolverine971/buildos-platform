<!-- tasker/147-builder-profiles.md -->

# 147 — Builder profiles (build-os.com/@handle)

> **2026-11-15 (Claude), after DJ deployed `fa3db38bc`:**
>
> - **Share card was 500 on production:** `sharp` can't load on Vercel (`libvips-cpp.so.8.18.3:
cannot open shared object file`). Replaced with `@resvg/resvg-wasm` (SVG→PNG) and
>   `@jsquash/webp` (WebP photos → PNG via a small zlib PNG encoder), both inlined as base64
>   (`assetsInclude: ['**/*.wasm']` in `vite.config.ts` + `vitest.config.ts`). Verified: local
>   production build inlines both, web check 0 errors, builder-profile tests 34/34, a real render
>   with DJ's WebP photo (~0.5 s). UNCOMMITTED; needs a web deploy, then check
>   `/api/public/builders/djwayne/card` returns `image/png`.
> - Same root cause, older: `/api/admin/emails/attachments` also imports `sharp` and 500s on
>   production (since before this tracker). Not fixed here.
> - **Draft wording:** "Draft my page" now passes the owner's existing pitches as `owner_pitch` and
>   drafts pitches only for projects without one (Use all can't overwrite them), and tells the
>   model not to present a client project's subject (military service, a sport) as the person's
>   own background. New `builder-profile-drafts.test.ts`. Production rerun before the fix
>   (DeepSeek V4 Flash, ~$0.0014): headline "Founder, BuildOS"; bio claimed "precision — in
>   shooting"; BuildOS pitch "AI-first project organization…". Recheck after deploy (~$0.0014).
> - Writing is off on the live page (no Julian), verified signed out.

**Status:** Rounds 1–3 committed, pushed, deployed (web + worker). Round 4 "finish" (11-15) BUILT, UNCOMMITTED, not deployed; migration `20261115160000` APPLIED + recorded (see Round 4) · **Opened:** 2026-10-23 · **Owner:** Claude
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

## Round 4 (2026-11-15): finish up

DJ: "finish up 147." Built (UNCOMMITTED, web + worker not deployed):

- **Writing is opt-in per page.** New `builder_profile_writing` (owner's picked public pages, in
  order). `get_builder_profile` / `get_builder_project` show only picked pages that are still
  live, public and the owner's; nothing shows until a page is picked. `show_writing` is no
  longer read (default now false). Editor: Settings → Writing lists the owner's published
  pages with a switch each (picked first, up/down to reorder, open link); the card on the
  canvas follows the picks. `PUT /api/profile/builder/writing`. The old Settings "Writing"
  switch is gone.
- **Per-person share image.** `/api/public/builders/[handle]/card` draws a 1200×630 PNG from
  code (satori → SVG with text as paths using bundled Inter WOFF, sharp → PNG; no system
  fonts, no image model): photo (fetched only from our storage or Google sign-in hosts),
  name, @handle · location, headline, Now line, 6 months of the build log with numbers,
  "Building: …" (anyone-audience projects) and the page address. Cached a day; the page's
  `og:image` carries `?v=` (changes with what the card shows). Profile and project pages use
  it with `summary_large_image`; drafts keep the default. Description now reads as
  sentences about the person ("Founder, BuildOS. Building BuildOS, 9takes. 208 active days…").
  New dep `satori@0.63.2` (lockfile changed).
- **Counters.** Project page views are their own counter (`project_views`, owner stats line
  shows "N project page views"). The event route rate-limits per address (30/min, in memory)
  and passes a daily-rotating HMAC of the visitor's network address (IPv6 by /64) to
  `bump_builder_profile_stat`, which counts one view per visitor per page per day and at most
  20 taps (`builder_profile_stat_visitors`, pruned after 2 days). Optional env
  `BUILDER_STATS_SECRET` (falls back to the service key).
- **Editor.** "Draft this week now" gets the new drafts back from the POST (no full editor
  reload); when the model drafts nothing it now says so instead of "Nothing moved". Two tabs:
  links and projects saves carry a save counter (`links_rev`, `projects_rev`; stale → 409),
  text fields carry the value they loaded (`expected`; changed → 409). A 409 shows a "changed
  in another tab or window" banner with Reload and stops autosaving.
- **Brief window.** "From People You Follow" reads since the last completed brief (12 h–7 d
  clamp, same as "While you were away"), 24 h when there's none. Worker change.
- **Stranger-review polish.** Build log: "updates", "done by AI agents", "DJ / DJ's AI
  agents", "Across the N projects…" / "all DJ's work", a "What counts as an update?"
  explainer; phone shows the last 6 months (numbers for the same 6 months, no sideways
  scroll, no clipped month); tap (or hover) a day for its numbers. Blank cover band 4–5rem.
  Meta dots hidden on narrow cards (no stray "·"). Avatar alt "Photo of …". Cards: "Last 12
  weeks · N updates". Footer: "Follow DJ to get their updates in your daily brief" and one
  line on what the page is above the claim box. `/p/` author name links to `/@handle` when
  published. Cookie bar: "Accept all" and "Necessary only" same weight (sitewide), and the
  bar's height is published as `--consent-bar-space` so builder pages keep the claim form
  clear of it.
- **Small visitor wins (done):** a social can be an email address (mailto:, envelope icon;
  GitHub already supported); signed-out Follow / Ask to join go to sign-up (it links to
  sign-in) with "Create a free account to follow @djwayne…" at the top.
- **Migration `20261115160000_builder_profile_finish.sql`**: rehearsed with `--role-probe`
  together with 120700 (passed, all standing checks green). It refuses to apply before
  `20261105120700` (which also replaces `get_builder_profile`; applying it afterwards would
  undo the opt-in). APPLIED + recorded 11-15 after 158 applied 120700: rollback dry run in
  prod first, function md5s match the rehearsal, anon read of /@djwayne OK (4 projects,
  Writing empty). The deployed (old) web code keeps working: its 2-argument counter call
  still resolves (checked in a rolled-back transaction).
- **Paid check (approved 11-15):** "Draft my page" on `deepseek/deepseek-v4-flash`, $0.00142
  (994 in / 3,126 out). "Draft this week now" called the model too (9takes had 5 done tasks)
  but got no usable line (every project on the page is Listed, so no project lines; no Now
  line came back); its usage row wasn't written (script exited before the async log), est.
  ≈$0.001. Wording: headline and 9takes / Wayne Strategies pitches fine; BuildOS pitch leads
  with "AI-first project organization" (off-brand), bio mentions Marine Corps / long-range
  shooting from The Cadre project. DJ should edit before using.
- **Checks:** svelte-check 0/0; worker typecheck clean; eslint clean on touched files;
  autofixer clean on touched components; builder tests 159 (web) + brief section 14
  (worker); browser (headless, counters blocked) logged out at 390px light/dark and 1280px:
  no sideways scroll, no console errors, tap-a-day works, card endpoint 200 PNG / 404 for
  unknown.

## Open

- [x] DJ published his page himself (10-25). Instagram/TikTok: DJ's call.
- [x] Paid check (approved 11-15): done, see Round 4.
- [x] Deploy rounds 1–3 (done before 11-15).
- [x] Apply `20261115160000` (11-15).
- [ ] Deploy round 4: web (Vercel) and worker (Railway). Optional Vercel env
      `BUILDER_STATS_SECRET`.
- [x] Share image: per-person card drawn from code (round 4).
- [x] View/tap counters: per-address limit + one view per visitor per day (round 4).
- [ ] `pnpm gen:all` for the builder tables (parent session); code uses loose casts until then.
- [x] "Draft this week now" no longer re-reads the editor (round 4).
- [x] Two editor tabs: conflict check (round 4).
- [ ] Real-phone check of /@handle and /profile/page (headless 390px only so far).
- [x] Writing off on the live page: done as data by 158; lasting fix = opt-in (round 4).
- [ ] DJ: set 9takes/BuildOS project links and an "I'm interested" link; pick Writing pages if
      wanted; rewrite the drafted BuildOS pitch before using it.
- [x] Review list: Writing opt-in, email/GitHub socials, share card, Follow → sign-up with
      context, label rewrites, banner shrink, cookie-bar parity, "Apr" clip, tap for day,
      stray "·", avatar alt, /p/ author link (round 4).
- [ ] Not done (DJ's call): main contact button ("Work with me"), "Open to" chip, role line
      per project card, one tagline everywhere, a make-your-page landing, email-only follow.
- [x] Project page views counted apart (round 4).
- [x] Brief reads since the last brief (round 4).
- [ ] Privacy page text changed (visitor code, Writing picks); `CURRENT_PRIVACY_VERSION` not
      bumped (bumping may ask every user to re-accept). DJ's call.
