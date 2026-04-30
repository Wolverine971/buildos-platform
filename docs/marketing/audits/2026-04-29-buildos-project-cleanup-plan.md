<!-- docs/marketing/audits/2026-04-29-buildos-project-cleanup-plan.md -->

# BuildOS Project Cleanup + LinkedIn Plan — 2026-04-29

> **Status:** Awaiting DJ approval. **No BuildOS writes have happened yet.**
> Once approved, an agent will execute every change in the Task Changes section using the BuildOS API, in the order listed.
> **BuildOS project ID:** `f7824d94-0de0-460c-80dd-67bf11f6445a`

---

## 1. Summary of what this plan does

1. Curates a 6-post **LinkedIn queue** drawn from existing repo material, aligned to the current "thinking environment / authors-first" strategy.
2. Creates **one new document inside the BuildOS project** to hold that queue + voice rules + repo source pointers.
3. Updates the existing **"Make LinkedIn post about BuildOS" task** to point at that document, then spawns 6 dated child tasks (one per post) under the Creator Outreach plan.
4. Cleans up the BuildOS task list per DJ's instructions:
   - **War Room cluster** → remove due dates, treat as backlog
   - **Cadre tasks (3)** → move out of BuildOS into the Cadre Content Operations project
   - **Pre-pivot HS outreach (8 tasks)** → archive (strategy pivoted away from HS wedge)
   - **Vague null-priority null-date wishes (~12 tasks)** → archive
   - **Merge/dedupe (~5 tasks)** → rename or fold

---

## 2. LinkedIn post queue (the content)

### 2.1 What's already in the repo

The repo has *more* LinkedIn drafts than gaps. Three layers exist:

| Source | Date | Posts | Strategy alignment |
|---|---|---|---|
| `social-media/LINKEDIN_DRAFT_POSTS.md` | 2026-01-07 | 13 + 1 bonus | **Partially stale.** Many lead with "context engineering" — now positioned as second-layer / investor language, not first-contact. |
| `social-media/linkedin-thinking-environment-reassessment.md` | 2026-03-10 | 3 (mini-sequence) | **Strong.** Frames "fragmented context" pain, then "thinking environment" as solution. Matches Brand Guide / Marketing Strategy 2026. |
| `growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md` | 2026-04-10 | 3 (A/B/C) | **Best fit.** Author-first, demo-first, "the project should remember with you." Pairs with hero asset. |

There is also `LINKEDIN_STRATEGY.md` (Jan 2026, marked historical) and `linkedin-voice-quick-ref.md` (the operating voice ref — still current).

### 2.2 Voice rules to enforce on the queue

From `linkedin-voice-quick-ref.md` and Brand Guide:

- **Not a thought leader.** Interesting person + cheerleader. Learning voice ("what I'm finding..."), not authority voice.
- **Lead with relief, not hype.** Anti-AI-leading — no "AI-powered," no feature lists.
- **Show, don't claim.** Concrete examples, real names (Marcus, the warehouse scene), real numbers.
- **No CTA spam.** "Reply or DM me, I'll tear down your workflow for free" is the strongest CTA pattern.
- **Hold "context engineering" / "context infrastructure" / "ontology" for layer 2.** Lead with thinking environment + the project remembers.

### 2.3 Recommended queue (6 posts over 3 weeks)

Two posts per week, Tue/Thu, 8-9 AM EST. Mix of pain-naming, transformation, and founder-truth.

| # | Day | Pillar | Working title | Source draft | What needs editing |
|---|---|---|---|---|---|
| 1 | Tue 2026-05-05 | Pain-naming (authors) | "Your manuscript is not the only thing you're holding" | `2026-04-10_author-workflow-teardown` Draft C | None — ship as-is. Strongest hook of the three. |
| 2 | Thu 2026-05-07 | Pain-naming (general) | "I do not think the real problem is needing better productivity tools" | `linkedin-thinking-environment-reassessment` Post 1 | None — already current voice. |
| 3 | Tue 2026-05-12 | Founder truth | "Real founder life — wife finds bugs every time" | `LINKEDIN_DRAFT_POSTS` Post 11 | Light edit: drop "demoralizing in the moment" if it reads too soft, otherwise ship. |
| 4 | Thu 2026-05-14 | Transformation (authors) | "I fixed that yesterday — chapter revision notes lived in four places" | `2026-04-10_author-workflow-teardown` Draft A | None — ship as-is. Pairs with hero video. |
| 5 | Tue 2026-05-19 | Pain-naming (AI sprawl) | "A lot of AI workflow pain is actually memory pain" | `linkedin-thinking-environment-reassessment` Post 2 | None — current voice. |
| 6 | Thu 2026-05-21 | Founder truth | "Project War Room — the feature trap" | `LINKEDIN_DRAFT_POSTS` Post 13 | **Updated angle:** ship the "feature trap" framing **after** I unblock War Room (or kill it). Lands honestly because the call is real. |

**Why this order:**
- Posts 1+2 anchor the public category ("thinking environment") via pain-naming — install the frame first.
- Post 3 is founder-truth-of-the-week to humanize.
- Post 4 is the demo-driven transformation post — needs the hero video shipped first.
- Post 5 escalates the AI-specific pain to recruit AI-fatigued users.
- Post 6 closes the cycle with vulnerable founder-judgment, reinforces "ruthless prioritization."

**Posts intentionally NOT in the queue and why:**
- All "context engineering" lead-with posts (`LINKEDIN_DRAFT_POSTS` 1, 3, 5, 7, 8, 9) — strategy now says hold this for layer 2. They're great archive material for later.
- Marine Corps post — voice ref says "use sparingly," and 6 posts is too few to spend one on background color.
- Post 6 ("The Grind" / "~70 signups, no DAU") — honest but hits at the wrong moment when you're trying to install a category. Save for later when you have a DAU win to pair it with.

### 2.4 What's blocking publication

- **Hero asset for post 4** (chapter-revision brain-dump → revision plan, screen recording). The campaign brief in `growth/lead-campaigns/2026-04-10_author-workflow-teardown_*` describes the exact brain-dump script. ~30 min to record.
- **Decision on War Room status** for post 6. Either ship the feature, kill the feature, or write the "feature trap" post.

Neither of these blocks the first 4 posts.

---

## 3. New BuildOS document to create

**Action:** `create_onto_document` in BuildOS project.

| Field | Value |
|---|---|
| `project_id` | `f7824d94-0de0-460c-80dd-67bf11f6445a` |
| `title` | `BuildOS LinkedIn Post Queue (2026-Q2)` |
| `type_key` | `document.knowledge.strategy` |
| `state_key` | `ready` |
| `description` | `Active LinkedIn post queue for BuildOS Q2 2026. Six posts over three weeks (May 5-21), draws from author-workflow teardown drafts and the thinking-environment reassessment. Source files live in /docs/marketing/social-media/ and /docs/marketing/growth/lead-campaigns/.` |

### 3.1 Document body (markdown, what gets written)

```markdown
# BuildOS LinkedIn Post Queue — 2026 Q2

**Active.** 6 posts, May 5-21, 2026. Two per week, Tuesday + Thursday, 8-9 AM EST.

## Voice rules

- Not a thought leader. Interesting person + cheerleader. Learning voice.
- Lead with relief, not hype. Anti-AI-leading.
- Show, don't claim. Concrete examples, real names.
- Hold "context engineering" and "ontology" for layer 2. Lead with "thinking environment" and "the project remembers."
- CTA pattern: "Reply or DM me, I'll tear down your workflow for free."

Source: linkedin-voice-quick-ref.md, Brand Guide.

## The queue

### Post 1 — Tue May 5 — "Your manuscript is not the only thing you're holding"

Pillar: pain-naming (authors). Source: 2026-04-10 author teardown Draft C.

Body — see local repo: docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md (Draft C).

Hero asset needed: before/after screenshot pair OR hero video (chapter-revision brain dump → revision plan).

### Post 2 — Thu May 7 — "I do not think the real problem is needing better productivity tools"

Pillar: pain-naming (general). Source: linkedin-thinking-environment-reassessment.md, Post 1 of mini-sequence.

Body — see local repo: docs/marketing/social-media/linkedin-thinking-environment-reassessment.md.

Hero asset needed: text-only is fine. Optional fragmented-workflow visual.

### Post 3 — Tue May 12 — "Real founder life — wife finds bugs every time"

Pillar: founder truth. Source: LINKEDIN_DRAFT_POSTS.md, Post 11.

Body — see local repo: docs/marketing/social-media/LINKEDIN_DRAFT_POSTS.md (Post 11).

Hero asset needed: none. Text-only. Maybe a screenshot of a bug she found, if comfortable.

### Post 4 — Thu May 14 — "I fixed that yesterday — chapter revision notes lived in four places"

Pillar: transformation (authors). Source: 2026-04-10 author teardown Draft A.

Body — see local repo: docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md (Draft A).

Hero asset needed: **REQUIRED.** Hero video or before/after screenshots. The campaign brief specifies the exact brain-dump script (Marcus, warehouse scene, beta reader feedback). Repetition between video, screenshots, and post text is the point.

### Post 5 — Tue May 19 — "A lot of AI workflow pain is actually memory pain"

Pillar: pain-naming (AI sprawl). Source: linkedin-thinking-environment-reassessment.md, Post 2 of mini-sequence.

Body — see local repo: docs/marketing/social-media/linkedin-thinking-environment-reassessment.md.

Hero asset needed: text-only. Optional: screenshot of multiple ChatGPT/Claude tabs.

### Post 6 — Thu May 21 — "Project War Room — the feature trap"

Pillar: founder truth / building in public. Source: LINKEDIN_DRAFT_POSTS.md, Post 13.

Body — see local repo: docs/marketing/social-media/LINKEDIN_DRAFT_POSTS.md (Post 13).

Hero asset needed: none. Text-only.

**Note:** Only ship after the War Room call is made (ship, kill, or formally backlog). The post is honest because the call is real.

## Engagement plan

- Post in target window (Tue/Thu 8-9 AM EST).
- First-hour engagement is critical. Be at desk, ready to reply.
- Reply guide for post 1 + 4 (author teardown) lives in: docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md.
- Goal in every reply: move to DM or short call, not a signup.

## Posts intentionally not in queue

These are good but parked for later:

- All "context engineering" lead-with posts from LINKEDIN_DRAFT_POSTS.md (posts 1, 3, 5, 7, 8, 9). Hold for layer 2 / investor audiences.
- Post 3 of the thinking-environment mini-sequence ("Why I like the phrase thinking environment"). Save for July to reinforce after Q2 queue lands.
- Marine Corps post. Use sparingly; not in a 6-post category-installation queue.
- "The Grind / ~70 signups" post. Save for when you have a paired DAU win.
- "What I was wrong about — agentic chat pivot." Could replace post 3 if wife-bug post feels too vulnerable.

## Related BuildOS docs

- BuildOS Marketing Strategy 2026 — public category, audience order, what to lead with
- BuildOS Brand Guide — voice rules, terms to use / avoid
- BuildOS Guerrilla Content Doctrine — operating logic for solo-founder content
- BuildOS 6-Week Guerrilla Seed Campaign — weekly thesis structure (these posts plug into Weeks 1-3 of that campaign)

## Repo source files

- docs/marketing/social-media/LINKEDIN_DRAFT_POSTS.md — Jan 2026 draft pool (13 posts)
- docs/marketing/social-media/linkedin-thinking-environment-reassessment.md — Mar 2026 mini-sequence
- docs/marketing/social-media/linkedin-voice-quick-ref.md — voice ref
- docs/marketing/growth/lead-campaigns/2026-04-10_author-workflow-teardown_linkedin-post-drafts.md — Apr 2026 author teardown
```

---

## 4. Task changes (every change, with IDs)

### Bucket 1 — LinkedIn task: rewire to point at new doc + spawn dated children

| Op | Task ID | Title (new) | Notes |
|---|---|---|---|
| `update_onto_task` | `6f3c0a7c-4c33-4f54-9e0b-6d8b959b2c8b` | `LinkedIn post queue — Q2 2026 (parent)` | New description: "See doc 'BuildOS LinkedIn Post Queue (2026-Q2)' for full queue, voice rules, and 6 dated child tasks. Source drafts in repo /docs/marketing/social-media/ and /docs/marketing/growth/lead-campaigns/." Set `priority: 4`. Leave state `todo`. |
| `create_onto_task` | (new) | `LinkedIn Post 1: "Your manuscript is not the only thing you're holding"` | `due_at: 2026-05-05T13:00:00Z`, `priority: 4`. Description points to source draft + new BuildOS queue doc. |
| `create_onto_task` | (new) | `LinkedIn Post 2: "Real problem is fragmented context, not productivity tools"` | `due_at: 2026-05-07T13:00:00Z`, `priority: 4`. |
| `create_onto_task` | (new) | `LinkedIn Post 3: "Real founder life — wife finds bugs"` | `due_at: 2026-05-12T13:00:00Z`, `priority: 3`. |
| `create_onto_task` | (new) | `LinkedIn Post 4: "I fixed that yesterday — chapter revision notes" + record hero video` | `due_at: 2026-05-14T13:00:00Z`, `priority: 5`. Description flags hero asset requirement. |
| `create_onto_task` | (new) | `LinkedIn Post 5: "AI workflow pain is actually memory pain"` | `due_at: 2026-05-19T13:00:00Z`, `priority: 4`. |
| `create_onto_task` | (new) | `LinkedIn Post 6: "Project War Room — the feature trap"` | `due_at: 2026-05-21T13:00:00Z`, `priority: 3`. Description flags dependency: only ship after War Room status decided. |

**Why parent + children, not just one task:** the existing single task ("Make LinkedIn post about BuildOS") is the wrong granularity. You can't track 6 publishing days as one row. Parent gives a clean roll-up, children are the units of work.

### Bucket 2 — War Room cluster: remove due dates, treat as backlog

DJ instruction: *"the war room: let's remove the due dates. that's a backlog task."*

| Op | Task ID | Title | Change |
|---|---|---|---|
| `update_onto_task` | `04e3998b-e1a1-411f-8699-d177fdf1b14c` | Finish Project War Room feature (including spec) | `due_at: null`, `state_key: todo` (was `blocked`), `priority: 3` (was 4 — it's no longer urgent if backlog) |
| `update_onto_task` | `d128bf16-5e4a-4968-ab7b-f43303b1b0da` | Prototype and Integrate Threat Modeling (STRIDE + PASTA) into Project War Room | `due_at: null`, `state_key: todo` (was `blocked`), `priority: 3` (was 5) |
| `update_onto_task` | `e235c01e-ff41-40ed-8717-1a5af2ca5a02` | Demo BuildOS to step brother Nick and onboard as test user | `due_at: null`, `state_key: todo` (was `blocked`), `priority: 4` (was 5). Description note: "no longer blocked on War Room — demo using current product." |

**Open question for DJ:** the Nick demo doesn't actually need War Room. If you want to demo soon, this should keep a near-term due date and *not* be backlogged with War Room. Default proposal: keep it un-dated like War Room, but if you say "demo Nick this week," I'll instead just clear the blocked flag and keep the date.

### Bucket 3 — Cadre tasks: move out of BuildOS

DJ instruction: *"let's move the things that shouldn't be in this project."*

The 3 Cadre tasks belong in the **Cadre Content Operations** project (`31021625-1377-4715-9fb4-f93102974628`).

API constraint: `update_onto_task` does not accept a `project_id` change. Workaround: create a new task in Cadre, mark the BuildOS one done with `[MOVED to Cadre Content Ops]` prefix in title.

| Op | BuildOS task ID | Title | What happens |
|---|---|---|---|
| `create_onto_task` | (new in Cadre Content Ops project) | `Make Instagram post about Cadre project` | Mirror in Cadre Content Operations. |
| `update_onto_task` | `8f0fbd6a-c7f1-47a4-983d-d2e629eaa2c9` | `[MOVED to Cadre Content Ops] Make Instagram post about cadre project` | `state_key: done`. Title prefix marks the move. |
| `create_onto_task` | (new in Cadre Content Ops project) | `Create assets for email and social media for Cadre project` | Mirror. |
| `update_onto_task` | `593a7680-2f9e-43f5-85e9-bee947a86919` | `[MOVED to Cadre Content Ops] Create assets for email and social media for cadre project` | `state_key: done`. |
| `create_onto_task` | (new in Cadre Content Ops project) | `Invite Phil to BuildOS Cadre project` | Mirror. (Note: this task is about inviting Phil into a Cadre-related BuildOS workspace project, so it's still a Cadre operations task.) |
| `update_onto_task` | `4ff9c37e-1e04-4e92-b773-13d4775b431c` | `[MOVED to Cadre Content Ops] Invite Phil to BuildOS cadre project` | `state_key: done`. |

**Open question for DJ:** confirm Cadre Content Operations is the right destination project. The other Cadre project is "The Cadre- DJ Internal" (`153dea7b-1fc7-4f68-b014-cd2b00c572ec`). I'm picking Content Ops because the tasks are content/social-asset work.

### Bucket 4 — Pre-pivot HS outreach: archive

DJ's published Marketing Strategy 2026 says: *"Lead with: 1. authors 2. YouTubers."* HS wedge is pre-pivot. Archive all 8.

API constraint: no delete or archive state. Workaround: rename with `[ARCHIVED]` prefix and set `state_key: done`.

| Op | Task ID | New title | Change |
|---|---|---|---|
| `update_onto_task` | `cee178c0-92f1-42df-9806-3191d221d2ff` | `[ARCHIVED — pre-pivot HS wedge] Send outreach email to Annapolis Area Christian School` | `state_key: done` |
| `update_onto_task` | `f3b2e4ba-4fba-412d-9a4a-e507f39bd1af` | `[ARCHIVED — pre-pivot HS wedge] Send outreach email to Archbishop Spalding HS` | `state_key: done` |
| `update_onto_task` | `7eb9f304-330f-4ace-83e5-11f3d3aad4e2` | `[ARCHIVED — pre-pivot HS wedge] Send outreach email to Severna Park HS` | `state_key: done` |
| `update_onto_task` | `2b2f3a02-c312-4300-b25c-9bce37988dcf` | `[ARCHIVED — pre-pivot HS wedge] Send outreach email to Old Mill HS` | `state_key: done` |
| `update_onto_task` | `bd5b45fb-da62-41ae-ba49-6c7a4989f90f` | `[ARCHIVED — pre-pivot HS wedge] Schedule local high school visits` | `state_key: done` |
| `update_onto_task` | `e61ffba9-889c-48b3-9372-4e5236deb58f` | `[ARCHIVED — pre-pivot HS wedge] Follow-up calls and log responses for high school outreach` | `state_key: done` |
| `update_onto_task` | `84e081e7-6e0d-43f5-9a0e-3457c4a6ce9b` | `[ARCHIVED — pre-pivot HS wedge] Create detailed BuildOS guides for High Schoolers` | `state_key: done` |
| `update_onto_task` | `072b96bc-5c23-4ffc-8037-c3c99c3de93a` | `[ARCHIVED — pre-pivot HS wedge] Manually onboard users by capturing their projects (target: first 100 users)` | `state_key: done`. The "first 100 users" framing predates the creator-led strategy. |

**Open question for DJ:** if you want HS as a *future* secondary wedge instead of dead, say so and I'll create a single "Local HS wedge — revisit Q4" task with no priority/date instead of archiving 8.

### Bucket 5 — Vague no-priority no-date wishes: archive

These tasks have null priority + null due_at and titles too vague to action. Archive same way as Bucket 4.

| Op | Task ID | New title | Reason |
|---|---|---|---|
| `update_onto_task` | `3e74eb57-823a-470e-be94-0af13c04bb65` | `[ARCHIVED — vague] Test BuildLS context updates` | Typo, vague |
| `update_onto_task` | `b67bef4a-0c47-4aab-b202-a17d01f5b89b` | `[ARCHIVED — vague] Retest everything in BuildOS for stabilization` | Too broad |
| `update_onto_task` | `e87854a6-5b65-45de-b195-276f7c252e49` | `[ARCHIVED — vague] Track expenditure` | Habit, not task |
| `update_onto_task` | `1ecec588-6690-4d7f-9ca9-d322e5f30c26` | `[ARCHIVED — vague] Update Personal Library at Chat Close` | No clear scope |
| `update_onto_task` | `1d5e27ea-0ddf-4e0a-a8ed-c093a725b160` | `[ARCHIVED — vague] Reach out to Carl and EZ` | No context, no date |
| `update_onto_task` | `facb5dec-08ad-415b-a253-4ed3be14f0af` | `[ARCHIVED — superseded] Reach out to friends for BuildOS testing` | Replaced by specific creator outreach + Nick demo |
| `update_onto_task` | `99c63566-028b-4a70-a7bc-67fda7c31e33` | `[ARCHIVED — superseded] Implement ruthless prioritization mode to identify and execute high-impact tasks` | Replaced by today's cleanup + plan rationalization |
| `update_onto_task` | `b02c3443-fcd5-4e2c-bc49-7108139221fe` | `[ARCHIVED — superseded] Clarify top priorities for ruthless prioritization mode` | Same as above |

**Open question for DJ:** any of the 8 above you want to keep alive? Speak up and I'll spare them.

### Bucket 6 — Merges and dedupes (rename, don't archive)

| Op | Task ID | Action |
|---|---|---|
| `update_onto_task` | `cc41877b-bbb5-47c4-9467-72eef5b8be3b` | DEDUPE — archive in favor of `e790b5b1-914e-4194-8dbc-173bd733102f`. Same task ("Update public page lingo for ADHD users and AI-first focus" vs "Clean up lingo on public pages"). |
| `update_onto_task` | `e790b5b1-914e-4194-8dbc-173bd733102f` | Keep. Update title to `Clean up lingo on public pages (audience: thinking-environment-first, authors-first)`, set `priority: 3`, `due_at: 2026-05-15`. |
| `update_onto_task` | `922cc1d3-645a-47a3-9d3c-4ee9b287efcb` | DEDUPE — archive |
| `update_onto_task` | `c55536ba-200b-4d7c-9118-34d642d24386` | DEDUPE — archive |
| `update_onto_task` | `dd497aec-e13e-4888-9bac-77760b28c882` | DEDUPE — archive |
| `create_onto_task` | (new) | `Twitter brand kit: icon + 3 templates + rollout note`, `priority: 2`, no due date (backlog). Replaces the 3 sub-tasks above. |
| `update_onto_task` | `d992cbaf-f488-4477-b3c3-dcc63e24428d` | `[ARCHIVED — rolled into hero asset] Get updated screen pictures of BuildOS`. Subsumed by the May 14 hero video task. |
| `update_onto_task` | `ae80831b-ef45-49ba-af58-286db3613ce9` | Make this a child of `82dfb1b6-e39d-48cb-8c32-d13c3e620daa` ("Create User Guide Suite (ADHD/TPM/Writers/Devs)"). Update description to clarify scope: "ADHD guide variant — child of Guide Suite parent task." |

**Open question for DJ:** the User Guide Suite parent (`82dfb1b6-...`) is currently P2 due 2026-04-28 (yesterday). Want me to push the date out, or keep it overdue as a forcing function?

### Bucket 7 — Survivors: leave for next pass

I'll leave these tasks alone in this round. They're keepers but need DJ time to prioritize/date. Listing for transparency:

- `b6bc743f-...` Expand and optimize BuildOS onboarding flow (P4)
- `ae82efc3-...` Implement batch task triage by project (P3)
- `5d9bb52c-...` Implement Dynamic Contact Saving (P3)
- `cd82a930-...` Check calendar sync functionality (P3)
- `ebf47b8b-...` Add PWA download screenshot to onboarding (P3)
- `dd0d91a6-...` Collaborate with Rebecca Murphy for AI Workshop (P3)
- `32854535-...` Send BuildOS demo to Sudip (P3)
- `1016819e-...` Outreach to Sabio contacts with BuildOS demo (P3)
- `769536c0-...` Reach out to Alex (Asia's boyfriend) (P3)
- `9e827b1a-...` Connect task to event in UI (P3)
- `59c3a49a-...` SEO key word targeting (P3)
- `738ecf34-...` Prototype Mobile-First Project Command Center Dashboard (P4)
- `19e838fd-...` Create template ontologies for different project types (no P)
- `2707c717-...` Create basic chat interface for LLM (no P) — likely already done in product? worth checking
- `891a8419-...` Implement Ring Visuals Instead of Bars (no P)
- `82a825e1-...` Implement Task Snooze Feature (no P)
- `82dfb1b6-...` Create User Guide Suite parent (P2, due 4/28)
- `48734f6f-...` Review Feature Friction Against Golden Rule (P3, due 4/25 — overdue, see open q below)
- `14b33e82-...`, `1665139d-...`, `b1a1b18a-...`, `76aa11dd-...`, `25dc495e-...` — five Creator Outreach plan tasks (P3-4, no dates). These should get dates from the 6-week guerrilla campaign next pass.

Plus the in_progress ones:
- `1ed7eb6b-...` Work on reactivation emails (P3, due 4/26 — overdue. **Open q below.**)
- `56d3f0ff-...` Develop Education Hub for BuildOS (no P, no date — was this actually started? Open q.)

---

## 5. Open questions for DJ before execution

Please answer these inline (or just say "approve all defaults"). Defaults shown in **bold**.

1. **Cadre destination project**: Cadre Content Operations (`31021625...`) vs The Cadre- DJ Internal (`153dea7b...`)? **Default: Cadre Content Operations** since the tasks are content/social-asset work.
2. **Nick demo**: keep no-due-date (backlog) like War Room, or keep a near-term date? **Default: backlog like War Room**, since you flagged the cluster.
3. **HS wedge**: full archive (8 tasks marked done) or single "revisit Q4" task? **Default: full archive.**
4. **Bucket 5 wishes**: any of the 8 vague tasks you want to spare? **Default: archive all 8.**
5. **User Guide Suite due date** (currently overdue 2026-04-28): push to a new date, or leave overdue as forcing function? **Default: push to 2026-05-22** (after LinkedIn queue, when guides will be referenced more).
6. **Reactivation emails task** (in_progress, overdue 4/26): keep going, or also backlog? **Default: keep, push due to 2026-05-09**.
7. **Education Hub task** (in_progress, no date): is this actually being worked on? **Default: move back to `todo`, no date, P3, leave as backlog**. Tell me otherwise.
8. **Review Feature Friction Against Golden Rule** (P3, overdue 4/25): push date or backlog? **Default: backlog, no date, P3.**
9. **Should I create a new `risks` register** as discussed in the audit, or skip that for now? **Default: skip this round, do separately.**

---

## 6. Net effect of this plan

Before:
- 103 tasks (50 todo visible, ~37 unseen but same shape)
- 3 P5 blocked overdue, 0 risks, 1 vague LinkedIn task
- LinkedIn material scattered across 6+ repo files, not visible in BuildOS

After:
- ~25 tasks closed/archived (Buckets 3+4+5+6 dedupes)
- ~8 new tasks added (LinkedIn queue + Twitter brand kit + Cadre mirrors)
- War Room cluster un-blocked and de-dated → no longer visually urgent
- 1 new BuildOS doc tying LinkedIn execution to repo source files
- Net: ~85 active tasks → cleaner picture, dated where it matters

---

## 7. Approval checklist

When you're ready, say one of:

- **"approve all defaults"** → agent executes everything in section 4 with the **bold** defaults from section 5.
- **"approve with changes:"** then list any answers to open questions or specific tasks to spare.
- **"hold on bucket X"** if you want to defer a section.

After approval, the executing agent will:

1. Create the LinkedIn document first.
2. Update + create LinkedIn parent/children tasks (so the new doc is referenced from day 1).
3. Apply Bucket 2 (War Room un-block).
4. Apply Bucket 3 (Cadre move).
5. Apply Bucket 4 (HS archive).
6. Apply Bucket 5 (vague archive).
7. Apply Bucket 6 (dedupe + Twitter merge + ADHD guide reparent).
8. Report back: count of writes by bucket, any failed writes, current task count.

All writes will use idempotency keys derived from this plan's path so re-running won't duplicate.
