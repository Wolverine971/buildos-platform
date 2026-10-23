<!-- docs/specs/BUILDER_PROFILE_SPEC_2026-10-23.md -->

# Builder Profiles (2026-10-23)

**Status:** BUILT (ambitious), uncommitted, not deployed (2026-10-23). Tracker: `tasker/147-builder-profiles.md`.
**Ask (DJ, 10-23):** a builder profile. BuildOS's version of Linktree but more detailed: where you
are on social media, links you care about, the projects you want people to see, a short bio, with
some parts hidden. Also like a GitHub profile: an honest picture of what you've been working on.
It sits on top of project sharing, where people and their agents work on each other's projects.
**Mockup:** https://claude.ai/artifact/7zHm28L8Lty5pjR1s54Fez, an interactive page built on DJ's
real projects and last year of activity (pick what goes public, view as anyone / signed in /
collaborator / agent, lean vs ambitious).

## The insight

Linktree is a list you keep up by hand. A GitHub profile keeps itself up because it is the exhaust
of real work, but only for code. BuildOS already holds the work for everything else: projects,
goals, milestones, what got done, and which agent did it. So a builder profile can be a link-in-bio
page that stays current on its own, where the owner only decides what shows.

Profile products that needed manual upkeep (Polywork, Read.cv) faded. The ones that last are fed by
work people already do. BuildOS has that feed.

Second insight: the profile is the public front door to the people layer. Today you can only find
someone by exact handle, and there is no reason to hand your handle out. The profile gives people a
URL worth putting in a bio, and a place where Follow and Ask to join live.

## Real data that shaped this (prod, read-only, 10-23)

- DJ has 48 active projects. Most should never be public: family, kids, job search, client work,
  prospect proposals. Default must be hidden, and picking must be per project.
- Last year: 190 active days, 2,922 changes, 27% made by agents, 219 tasks done.
- Raw task titles leak. 9takes' latest done tasks include "Outreach: Steven Bartlett — initial
  pitch sent July 14". Wayne Strategies' name a client and his contact. Public text must be written
  or approved by the owner, never raw titles.
- Project names leak too ("LA Industrial Services", "Hannibal Is Hungry — Receipts Desk Proposal",
  "The Cadre- DJ Internal"). Each listed project gets an optional public name.
- DJ's 2 live public pages (`/p/dj-wayne/...`) have 0 views. They have no front door.
- DJ's handle is `djwayne`; bio is empty; discoverability is `none`.

## What the page looks like (phone first; link-in-bio traffic is mostly phones)

`build-os.com/@djwayne`, top to bottom:

1. **Header:** avatar, name, @handle, headline, location, "on BuildOS since May 2025", short bio.
2. **Now** (ambitious): one line, e.g. "Building project sharing and builder profiles in BuildOS."
   Drafted weekly from activity; owner approves.
3. **Socials:** icon row. Platform is detected from the URL (X, LinkedIn, Instagram, TikTok,
   YouTube, GitHub, Substack, website).
4. **Actions** (ambitious): Follow. Logged-out visitors sign up first with the follow held.
5. **Links:** Linktree-style rows with label, optional note, and audience.
6. **Building:** cards for the projects the owner picked (see ladder).
7. **Build log:** year grid of active days, numbers only, optional two-tone for "with agents".
8. **Writing:** the owner's live public pages. Replaces the `/p/{name}` stub author index.
9. **Builds with** (ambitious): collaborators who also published a profile and opted in.
10. **Footer:** "Make your own page · claim @yourname" into signup with the handle held (signup
    already supports a held handle).

## What a project can show (visibility ladder)

| Level                         | Shows                                                                                                                                                            | Notes                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Hidden**                    | nothing                                                                                                                                                          | default for every project                      |
| **Listed**                    | icon, public name, one-line pitch, stage, "active 5 days ago" / "quiet since July", optional link                                                                | lean                                           |
| **Live**                      | Listed + goals the owner picks, next milestone, 12-week activity bars, a weekly "what moved" line the owner approved, "Looking for", Follow project, Ask to join | ambitious; this is the people-layer Pulse card |
| **Open** (later, maybe never) | anyone can read the project, like today's `is_public` example projects                                                                                           | not in either version                          |

Rules:

- Only the project owner can put a project on a profile. Members of a listed project see "You're
  in this" on the owner's page.
- Never raw task titles, document text, or member names. Public text is owner-written or
  BuildOS-drafted and owner-approved.
- Stale projects show "quiet since July" unless the owner hides them. Honest, and it nudges.

## Hidden parts (audiences)

Every link, section, and listed project has an audience:

- **Anyone**
- **People I work with** (members of any project I own or am in)

Examples: "Book a call" and email only for people you work with. Lean has one audience (anyone)
plus per-item on/off.

## Build log

- Source: `onto_project_logs`, which already records the actor and `external_agent_caller_id`.
- Counts only projects on the page by default. A switch adds private work as numbers only
  (GitHub's "private contributions" idea).
- Day granularity, no times of day. No streak counter: relief, not pressure.
- Two-tone cells: ink for you, accent for your agents. Owner can turn the split off.
- Read from a nightly rollup table (`builder_profile_activity_daily`), refreshed on publish. Never
  computed on page view.

## Keeping it current (the part only BuildOS can do)

- **Draft my page:** from the picked projects, BuildOS drafts a headline, bio, and one-line pitch
  per project. Owner edits. Nothing publishes without the owner.
- **Weekly update** (ambitious): BuildOS drafts the Now line and one "what moved" line per Live
  card from what got done. It shows up in the daily brief as "Update your page?" with Publish, Edit,
  Skip. Untouched drafts are skipped and the page stays as it was.
- Cost: one small model call per published profile per week, only when a Live card or Now line
  exists. Measure on the brief's model before turning on.

## Flows

**A. Claim and publish.** Claim @handle (signup and onboarding already ask). Profile → Your page.
"Draft my page" fills headline, bio, pitches. Pick projects, add links, Publish. Copy
`build-os.com/@you` into an Instagram or X bio.

**B. A visitor follows or asks.** Follow puts that person's weekly updates in the follower's daily
brief (pairs with tasker 142 "what others did"). Ask to join creates a `people_requests` row; the
owner approves with a role and agent setting, same as the existing share flow. Logged-out visitors
sign up first with the follow or ask held.

**C. An agent reads it.** Anyone's agent can read `build-os.com/@you.json`. Connected agents call
`get_builder_profile({ handle })`, see what the person is looking for, and use the existing
`request_buildos_access` for their person. Agents can ask; only people grant. An agent never sees
more than an anonymous visitor plus what its person already has access to.

**D. It stays current.** Weekly drafts in the brief (above). Stale cards say so.

## Where it lives in the app

- Profile → "People & agents" hub from tasker 141: the **You** section gets "Your page" with the
  editor beside a live phone preview. In-app label is "Your page", because `/profile` already means
  settings.
- Onboarding Ready step: "Here's your page" showing the project they just made (publish optional).
  A social payoff for creating the first project, which is where signups leak (12 of 22 never make
  one).
- `/people`, the share window, and MCP person results link to the profile next to each handle.

## Data model (sketch)

- `users`: add `profile_status` (draft | published), `headline`, `location`, `avatar_url`,
  `now_text`, `now_updated_at`, `profile_settings jsonb` (sections, build log mode, agent split).
  Reuse `username`, `name`, `bio`.
- `builder_profile_links`: id, user_id, url, label, note, kind (social | link), platform, audience,
  position.
- `builder_profile_projects`: user_id, project_id, level (listed | live), public_name, pitch,
  looking_for, goal_ids[], audience, position. Write allowed only when the user owns the project.
- `builder_profile_activity_daily`: user_id, day, project_id (null = private bucket), changes,
  by_agents, tasks_done.
- Ambitious: `builder_profile_updates` (drafted Now and weekly lines: drafted | published | skipped),
  `builder_profile_stats_daily` (views, link taps, follows, asks), and `project_followers` from the
  people-layer Pulse plan for Follow.
- One read function `get_builder_profile(p_handle)`: SECURITY DEFINER, granted to anon and
  authenticated, returns only published fields for the viewer's audience, fails closed. Rehearse
  with `--role-probe`.
- Route `/@handle` through a param matcher; `/p/{slug_prefix}` 301s to the profile when the author
  has one. Handle changes keep a redirect (slug-history pattern already exists for public pages).
- Public cache 5 minutes with stale-while-revalidate; owner edits purge.

## Agents

- MCP `get_builder_profile({ handle })`: public profile, Live cards, "looking for", and how to ask.
- `find_buildos_person` adds `profile_url` and the showcase projects the people-layer spec already
  reserved.
- `/@handle.json` so any agent can read the page without a connector.
- Owner's own agent can update the Now line and links (owner-scoped write tool).

## Landmines

1. Raw titles and client names (above). Public text is owner-approved; public name per project.
2. Collaborator consent: a person never appears on someone else's profile unless they published
   their own and turned on "Show me on collaborators' pages".
3. Link spam and phishing: `rel="nofollow ugc noopener"`, http(s) only, noindex until published
   with some activity, report link, admin takedown.
4. Impersonation and squatting: extend the reserved handle list with brand names; report flow.
5. Privacy docs: CLAIMS and DATA_INVENTORY rows for a public profile; bump
   `CURRENT_PRIVACY_VERSION`. Opt-in only, so no notice email is needed.
6. Account deletion removes the profile, links, rollups; handle change redirects.
7. Share image per profile is rendered from a code template, never generated by an image model.
8. Brand: copy leads with what you're building, not AI. The agent split is a quiet second tone.

## Lean vs ambitious

**Lean, "Link in bio that knows your work" (about 4–5 days, 2 migrations):** `/@handle` page,
header, bio, socials, links, Listed cards, build log (counts, optional private numbers), Writing,
editor with live preview and Draft my page, share image, `/p/{name}` redirect, "Make your own"
footer.

**Ambitious, "Front door to your work" (about 3 weeks; lean is week 1):** lean + Live cards +
Follow (updates in the follower's brief) + Ask to join (existing people requests) + Now line and
weekly drafts in the brief + two audiences + Builds with + connected projects ("part of The Cadre,
with 3 others") + agent-readable profile (MCP + JSON) + owner stats.

The growth loop lives in the ambitious half: Follow fills other people's briefs, Ask feeds the
people layer, and every page ends in "Make your own". Lean alone is a nicer link page.

## Measure

PostHog: `builder_profile_published`, `builder_profile_viewed` (with referrer host),
`builder_profile_link_tapped`, `builder_profile_cta_clicked`, `builder_profile_followed`,
`builder_profile_ask_sent`. Signups attributed to a profile visit.

## Calls for DJ

1. **Lean or ambitious.** Recommended: ambitious, shipped in order so lean is live after week 1.
2. **Build log counts.** Recommended: only projects on the page; a switch adds private work as
   numbers.
3. **Weekly lines on Live cards.** Recommended: BuildOS drafts, owner approves in the brief.
   Alternatives: counts only, or auto-publish.
4. **Hidden parts.** Recommended: two audiences (anyone, people I work with). Alternative: add
   "signed-in BuildOS users".
5. **"With agents" in the grid.** Recommended: quiet second tone, on by default, owner can turn off.
   Alternative: off by default.
6. **Name.** Recommended: "builder profile" in marketing, "Your page" in the app.

## DJ direction and build, 10-23

DJ: "love it, build it, build the ambitious version." Calls 2–6 taken as recommended. Built in one
pass: migration `20261024020000_builder_profiles.sql` (applied + recorded), `/@handle` page and
`/@handle.json`, follow + ask to join, owner editor in Profile → People & agents → Your page, weekly
drafts (web cron, Fridays) approved by the owner, brief section for followers and drafts waiting,
MCP `get_builder_profile`, `/p/{author}` redirect, privacy copy. Differences from the plan:

- Follow uses its own `builder_follows` table (person or one live project), not the people-layer
  `project_followers` Pulse table, which doesn't exist yet. The live card is the public Pulse card.
- The weekly drafter runs in the web app (Vercel cron), not the worker, so one code path serves the
  cron and the editor's "Draft this week now".
- The build log counts the person's own changes and their agents' (`changed_by`), across every
  project, per day in their time zone. Live-card bars use the same rollup.
- No per-person share image yet (default BuildOS image).
