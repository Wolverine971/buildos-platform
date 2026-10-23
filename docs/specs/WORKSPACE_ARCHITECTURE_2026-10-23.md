<!-- docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md -->

<!-- doc-status: point-in-time -->

# Workspace: a home for things that aren't projects yet

Status: **ambitious version BUILT (2026-10-23), uncommitted.** Migrations are applied to production;
the web and worker code isn't deployed. DJ's decisions and the build log are under "Build status" at
the bottom. Evidence comes from production data pulled on 2026-10-23 and four code surveys (capture
paths, data scoping, UI, chat agent).

## The ask (DJ, 2026-10-23)

> "I think of BuildOS as a Google Drive, where it just holds stuff. Projects are things where
> there's a focused effort on something, and it's organized, but surrounding that might be a
> peripheral workspace. In that workspace, you could have other documents, other tasks, other
> things that are floating... It's kind of like a holding ground... like Apple Notes, where you just
> save notes, but then later on you put them in a project because they're actionable."

## The insight

**BuildOS has one container, the project, so everything gets one.** Loose thoughts either put on a
project costume or get lost. The workspace is the missing outer layer: the drive that projects live
in. Projects stay the core primitive. They just stop being the only place a thought can live.

### Evidence: things in project costumes

DJ's own account has 47 live projects. At least ten of them are loose stuff that had nowhere else to go:

| Kind of loose stuff                     | Examples from DJ's account (tasks / docs)                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Seeds**: an idea, not yet an effort   | AI Taste Buds (0/0), Fitness Social App (3/0), Military Insights LinkedIn Article (0/2), Kids History Project (1/1) |
| **Life areas**: ongoing, no finish line | Family Weekly Tasks (19/4), Baby support (7/1), Kate's Corner (2/1)                                                 |
| **Reference piles**: things to keep     | Radar (0/7), Iran War Tracking (1/5)                                                                                |
| **Test debris**                         | Specialist Pilot Smoke — Synthetic Sep 20 (0/4)                                                                     |

Across the platform, 27 of 122 live projects hold two items or fewer, and 24 hold documents but no
tasks. 29 of the 39 other owners have exactly one project.

### Evidence: activation

In the last 180 days, 32 people signed up and **12 made a project**. Seven of them started the
"create a project" chat and left without one. The onboarding capture step won't let non-explore
users continue until a project exists (`onboarding-v2/ProjectsCaptureStep.svelte`). The first thing
BuildOS asks of a new user is the commitment BuildOS is supposed to help them reach. A workspace
lets the first step be "dump anything."

### Evidence: where loose stuff gets lost today (code)

- **Global chat has no rule for "nothing fits."** The model guesses a project, asks, creates a new
  project, or does nothing. No prompt says which (`agentic-chat-lite/prompt/situational-rules.ts:50-61`).
- **Research in global chat is dropped**: `research-capture.ts:126-128` returns `skipped: 'no_project'`.
- **Post-chat capture skips global sessions** (`chatSessionActivityProcessor.ts:202-205`;
  `checkpointJob.ts:97-123` covers only allowlisted users).
- **Every outside path creates a new project.** Calendar suggestions always do
  (`calendar-analysis.service.ts:964-979`), and so do external agents with no fitting project
  (connector `create_onto_project`).
- **Brain dumps lost their home.** The create path was deleted on 10-18 (`9735aa719`). The PWA
  "Brain Dump" shortcut (`static/site.webmanifest:77-80`) opens the home page and does nothing.
- **Unlinked dictation audio is purged after 24h** (`voice-note-sink.ts:49-58`).
- **The Projects desktop refuses loose items in so many words**: `desktop-rules.ts:33-35` returns
  "Docs and tasks belong to a project."

## The model in one picture

```
WORKSPACE (one per person, private)
│
├── Projects ............ focused efforts (unchanged; nest one level)
│     ├── 9takes
│     └── Wayne Strategies ─┬─ UXM Training Website
│                           └─ Beyond Exit Planning
│
├── Loose items ......... notes, docs, tasks with no project (yet)
│     ├── "Pricing thought after the Cadre call"   (note)
│     ├── "Renew passport"                         (task, due Nov 3)
│     └── "Theo Von pitch angles"                  (doc)
│
└── Folders ............. loose items kept on purpose
      ├── Family
      └── Radar
```

A loose item's life:

```
             ┌──────────── keep ─────────────┐ (stays; agent stops suggesting)
capture ──► loose ─── file ───────────────► project      (moved as-is, undoable)
             │    ─── graduate (with others) ► new project
             │    ─── process ──────────────► project changes (note archived with a pointer)
             └──── done / archive
project item ── send back ──► loose          (reverse of file)
tiny project ── fold ───────► a workspace folder
```

What lives in the workspace: **notes, documents, and tasks** (later: files, images, voice memos).
Goals, plans, milestones and risks imply a focused effort, so they stay project-only.

## Use cases

1. **Capture without choosing.** "Call the plumber about the water heater." "Thought on pricing:
   tiers by number of stewards?" Saved in one keystroke, no project picker, no model round trip.
2. **Life admin tasks.** Passport, dentist, gift for Mom. They show up in Today and the daily brief
   without a "Personal Errands" project.
3. **Seeds.** "AI Taste Buds" starts as one note. When three related notes pile up, BuildOS offers
   to start a project from them. Projects are born from the workspace instead of declared up front.
4. **Reference piles.** Radar-style collections live in a folder. No fake tasks, no Project Review
   nagging about a missing next step.
5. **Inbound from agents.** Codex, Claude or ChatGPT says "save this to BuildOS," and it lands in the
   workspace when no project clearly fits, instead of spawning a new project.
6. **Cleanup.** DJ's costume projects fold back into the workspace as folders, and the project list
   shows only real efforts.

## User flows

### F1. Capture (instant)

A capture bar on the workspace home and on Today: type and press Enter to save a note, ⌘Enter to save
a task, or use the mic. It saves immediately with no LLM call, so capture is as fast as Apple Notes.
Today's existing "apply to my projects" quick capture stays as an explicit second button.

### F2. Browse

The home shows project tiles plus a **Loose** shelf: newest first, filterable (All · Notes · Tasks ·
Docs), with folders. Fresh notes use Inkprint's Bloom texture (new/idea capture). Clicking an item
opens the existing `ReaderPanes` with chat beside it, scoped to that item.

### F3. File one item

- Drag a loose card onto a project tile. The desktop drag, the M-key "Move to…" list and right-click
  already exist (`useDesktopDrag.svelte.ts`, `DesktopMovePopover.svelte`).
- Or use "Move to…" in the document or task editor (`OrganizeEntryButton`).
- The move runs through the Organize preview → apply → undo flow that already exists. The toast reads
  "Moved to 9takes · Undo".
- Reverse: drag a project's doc onto the desktop background to send it back to the workspace. The
  rule that refuses this today becomes the action.

### F4. Agent suggests a home (Phase 2)

- A cheap model reads each new loose item plus the user's project cards and returns a structured
  verdict: file into X / start a new project / keep here.
- The verdict shows as a ghost chip on the card ("→ 9takes?", Inkprint Bloom × Ghost = AI
  suggestion). One tap files it, and dismissing means "keep here."
- Batches also appear as a group in the AI Inbox, so the existing A / N / S / Z keyboard triage
  works on them.
- The agent suggests and never moves anything on its own (vetoable, see Q4).

### F5. Graduate (Phase 2)

- Select several loose items and choose **Start a project from these**: name it (the agent proposes
  one), create it, move the items in one batch, and undo as one unit.
- The agent can also spot clusters ("4 notes about the Christian school look like a project").

### F6. Process into a project (Phase 2)

"Work this note into 9takes" opens that project's chat with the note attached. The agent updates
docs and creates tasks as usual. The note is archived with `props.processed_into` pointing at the
project, and new entities carry `props.source_note`. This is the old brain-dump flow, now with a
place to wait.

### F7. Fold a tiny project (Phase 2)

Organize two-pane, with the workspace on one side: move everything into a new workspace folder named
after the project, then archive the project. DJ's costume projects are the first users.

### F8. Loose tasks in Today and the brief

These come almost free (see data model). Today groups them under "Workspace" and the brief adds a
"Loose ends" section. A user with only a workspace becomes brief-eligible, which is good for
activation.

### F9. Onboarding (Phase 2)

"Dump anything" lands in the workspace, and creating a project becomes optional. If the dump looks
like a project, the agent proposes one ("Make this a project?") with the items pre-selected, using
F5. New activation event: `first_capture_saved`.

## Where it lives in the UI (open question Q2)

| Option                                           | What it looks like                                                                                                                        | Cost   | Fit with "Drive"                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------- |
| **A. Workspace is home** (recommended end state) | `/projects` becomes **Workspace**: project tiles + Loose shelf + folders on one desktop. Nav "Projects" → "Workspace". Drag between them. | Medium | Exact: Drive root holds folders and files   |
| **B. Its own tab**                               | New `/workspace` list page beside Projects / Today / History.                                                                             | Medium | Apple Notes model; loose stuff out of sight |
| **C. Pinned tile** (recommended first step)      | A special "Workspace" tile pinned first on the desktop. It opens with the existing card tabs (docs / tasks).                              | Low    | Workspace looks like one more project       |

Recommendation: ship **C** in Phase 1 (nearly free, proves the data model) and grow it into **A**
in Phase 2, where the loose items spill out of the tile onto the desktop.

## Data model

### Decision: the workspace is a special project row, not nullable `project_id`

Each person gets one `onto_projects` row with `kind = 'workspace'`. Loose items are ordinary
`onto_documents` / `onto_tasks` whose `project_id` is that row.

**Why this, and not making `project_id` nullable (A) or a separate notes table (C):**

| Machinery                        | Workspace project (chosen)                            | Nullable `project_id`                                                                                                  | Separate notes table   |
| -------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Access rules (RLS)               | Unchanged: owner is a member                          | Rewrite on 76 NOT NULL tables. Helpers return false for NULL, so rows go **silently invisible** (`20260825181727:120`) | New policies           |
| Search + embeddings              | Works                                                 | Embedding trigger skips NULL **silently** (`20261018215551`); search joins drop them                                   | Rebuild                |
| Doc tree, folders, tree undo     | `doc_structure` as is                                 | New storage, atomic fn, history                                                                                        | Rebuild                |
| Move into a project, with undo   | Organize mover as is (`private.onto_move_entity_set`) | NULL-source branch on every dependent table                                                                            | Lossy "convert" step   |
| Today, brief, chat context (Jev) | Mostly automatic                                      | Every loader rewritten                                                                                                 | Every loader rewritten |
| Asset storage paths              | `projects/<id>/…` as is                               | New namespace                                                                                                          | New namespace          |

Todoist's Inbox is the same pattern: a special project that can't be shared or deleted
(`inbox_project: true` in its API).

### Schema (one migration)

```sql
-- 1. Mark it with a real column (not type_key/props, which models and update tools can write).
ALTER TABLE onto_projects
  ADD COLUMN kind text NOT NULL DEFAULT 'project'
  CHECK (kind IN ('project', 'workspace'));

-- 2. One live workspace per person (created_by is the actor id).
CREATE UNIQUE INDEX onto_projects_one_workspace_per_actor
  ON onto_projects (created_by)
  WHERE kind = 'workspace' AND deleted_at IS NULL;

-- 3. Guard trigger (pattern: trg_onto_projects_guard_hierarchy):
--    kind is immutable after insert; a workspace can't have a parent, be a parent,
--    be merged/folded into anything, be public, be renamed by tools, or be archived/deleted
--    except by account deletion.

-- 4. Lazy creator, called on first capture or first workspace view. SECURITY DEFINER, checks
--    auth.uid(), INSERT ... ON CONFLICT DO NOTHING, returns the id.
--    GRANT EXECUTE ... TO authenticated (functions are server-only by default since 09-25).
CREATE FUNCTION public.ensure_workspace_project() RETURNS uuid ...;
```

The workspace is created **lazily**, not backfilled at signup. That avoids firing project-insert jobs
for every dormant user. Notes are `onto_documents` with new `type_key = 'document.note'`. The title
is derived from the first line and can be edited, like Apple Notes.

### Filters: keep it out of project-only places, keep it in item places

The key subtlety: `get_onto_project_summaries_v1` feeds both the project list _and_ Today, chat and
search. **Return `kind` from it and filter in callers**, not inside the function, or loose tasks
vanish from Today and chat.

| Must **exclude** the workspace   | Where                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Project counts and billing limit | `projects/+page.server.ts:41-49`; `evaluate_user_consumption_gate` (`20260425000005:116-123`)                                      |
| Paid insert triggers             | emoji job `trg_onto_projects_pick_emoji`, project-card embedding, START HERE (`instantiation.service.ts:440`)                      |
| Paid scans                       | scheduled audits/loops (`auditEnqueue.ts:652-660`), stewards, Project Review, cleanup card                                         |
| Onboarding and lifecycle         | `welcome-sequence.service.ts:1546`, `welcome-sequence.logic.ts:106,227`, `onboarding-progress.ts`, PostHog `first_project_created` |
| Sharing                          | invites, members, ownership transfer, set-parent, fold, public pages, people-layer grants (`20261023140000`)                       |
| Admin analytics                  | project counts in `dashboard-analytics.service.ts`, `api/admin/users`                                                              |

| Must **include** the workspace       | Notes                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Today feed                           | Automatic. Label the group "Workspace"                                                |
| Daily brief + eligibility            | Automatic. Render as "Loose ends," not a project section                              |
| Search, embeddings                   | Automatic                                                                             |
| Chat project index + Jev hop-1 cards | Automatic. Give the card a fixed description ("Loose notes and tasks, not a project") |
| "Move to…" lists, Organize           | Workspace pinned first in both directions                                             |
| External agents                      | Included under all-projects scope (vetoable default)                                  |

### Suggestions table (Phase 2)

```
workspace_filing_suggestions
  id, user_id, entity_kind ('document'|'task'), entity_id,
  verdict ('file'|'new_project'|'keep'), project_id NULL, proposed_project_name NULL,
  group_key NULL (clusters for "graduate"), reason (one line), confidence, model,
  created_at, decided_at, decision ('accepted'|'dismissed'), organize_batch_id NULL
  RLS: user_id = auth.uid()
```

- "Keep here" is recorded as a decision, so the agent stops re-suggesting. There's no new state
  column on documents or tasks.
- The new `project_id` column must be classified in the fold column rules
  (`20261017170000_project_fold_v1_readiness.sql`), or rehearsal fails.
- Provenance uses `props` (`processed_into`, `source_note`), because `onto_edges` can't cross
  projects.

## Agent layer

The chat agent and the MCP connector already accept any writable project id, so the workspace is a
valid target from day one. What changes:

1. **Prompt rule** (static, in `OVERVIEW_GUIDANCE_LITE` and the task/document skills): when the user
   wants something saved and no project clearly fits, save it to the Workspace and say so. Never
   create a project for a single item. The decision is the model's `project_id` argument, informed by
   the finder's structured `status: 'empty'`. **No keyword matching** (AGENTS.md rule; don't copy the
   regex in `calendar-suggestion-to-ontology-adapter.ts:63-66`).
2. **Global surface** mounts `create_onto_document` (`catalog/surfaces.ts`). Today global chat can't
   create docs at all.
3. **Write routing**: a workspace target is direct, not `target_resolution_requires_review`
   (`write-routing.ts:177-210`). Teach the reviewer that the workspace is a valid target
   (`turn-contract.ts:194`).
4. **Project chats can send to the workspace**: widen the write fence to the focused project plus
   the caller's workspace only.
5. **Fallbacks instead of drops**: research capture (`research-capture.ts:126`) and global-session
   checkpoint capture (`globalAttribution.ts`) save to the workspace instead of skipping.
6. **One move tool** for chat and MCP (`move_item`: document or task, any two writable projects,
   including the workspace). It uses the confirmation-token preview from `move_onto_task` and the
   Organize mover. The connector has no move op today (`agent-call.types.ts:67-95`). Don't widen
   `move_document_in_tree` (loops and cleanup rely on it staying in-project).
7. **Connector instructions**: "No project fits? Save to the workspace." Put the workspace id in
   `get_buildos_permissions`. This also delivers the one-call save that the ChatGPT plugin research
   asked for (`docs/research/chatgpt-plugin-positioning-2026-10-03.md`).
8. **Filing suggestions** (Phase 2): a worker job, debounced per user. The input is new loose items
   plus project cards (the Jev hop-1 shape). The output is a structured verdict per item. Model lane
   and cost go to DJ before any paid run.

## Phasing: lean vs ambitious

**Lean: "a place to put it" (about 1 week).** The workspace exists, capture lands there, and filing
uses the existing Move/Organize flow. Nothing gets lost, and no new AI cost.

- Migration (kind, unique index, guards, `ensure_workspace_project`) + all filters above + rehearsal
  with `--role-probe`.
- Pinned Workspace tile (option C) + instant capture on `/projects` and Today.
- Move to and from the workspace via drag, "Move to…" and Organize (relax `desktop-rules.ts:33`).
- Chat + connector "nothing fits → workspace" rule, global `create_onto_document`, research fallback.
- Today group label; brief "Loose ends" section.
- Fix the dead PWA Brain Dump shortcut so it opens capture.

**Ambitious: "it sorts itself" (about 2–3 more weeks).** The workspace becomes where projects are
born, and BuildOS does the filing.

- Filing suggestions with ghost chips and an AI Inbox group.
- Graduate: selection or agent-spotted cluster → new project.
- Process a note into a project.
- Fold tiny projects into folders (DJ's costume projects first).
- Workspace-is-home layout (option A) with folders.
- Onboarding starts with a dump, and the first project is proposed, not required.

**Later**: voice memos and the old `onto_braindumps` rows (7, all DJ's) surface in the workspace.
Also share sheet / email-in capture. The planned iPhone app's capture
(`docs/specs/MOBILE_APP_PLAN_2026-10-23.md`) lands here by default.

## How we'll know it works

- **Activation**: share of new signups who save anything in their first session (today the bar is
  "made a project": 12 / 32), and share who later graduate a project.
- **Nothing lost**: global-chat save requests that end "saved to workspace" instead of "which
  project?" or a new project.
- **Hygiene**: loose-item age, share filed or kept within 7 days, suggestion acceptance rate.
- **Dogfood**: DJ folds his costume projects, and the project list shows only real efforts.

## Landmines

- **Counts and paid jobs.** The owner-membership trigger (`20260320000000:254-271`) makes the
  workspace count as a project everywhere: the billing limit, `/projects` count, welcome emails and
  onboarding. The insert triggers would also fire the paid emoji job. Filter on `kind`, never on
  `state_key` (Today only shows active projects, so the workspace must stay `active`).
- **Don't filter inside `get_onto_project_summaries_v1`** (it feeds Today and chat).
- **Sharing leaks.** Invites, transfer, nesting, fold, public pages, people-layer grants and
  external-agent scope must all reject or handle `kind = 'workspace'`. Write a check script for each
  in rehearsal.
- **"Inbox" is taken.** It means the AI Inbox (agent proposals). Don't call this an inbox.
- **"Workspace" is overloaded in code.** `ProjectWorkspace.svelte` is the project page, and
  `context-finder/workspace.ts` means the whole account. Use `kind = 'workspace'` and
  `isWorkspaceProject()` consistently, and rename internals only if they cause confusion.
- **Creating a project switches the chat** into it (`surfaces.ts:111-116`). If an agent makes a
  project for a one-off item, the chat jumps. The prompt rule above is what stops this.
- **Recurring tasks can't move yet** (mover blocker `recurring_task_not_supported`). Dated tasks and
  assets can: both rollout flags are on in production (`private.organize_rollout`, checked
  2026-10-23).
- **Local dev writes to production Supabase.** Clean up test workspaces with
  `soft_delete_onto_project`.

## Open questions for DJ

1. **(Open)** When you open BuildOS and your loose stuff is there, what do you see, and what are you
   doing with it?
2. **Placement:** Workspace is home (A, recommended end state; C first) vs. its own tab (B)?
3. **Capture:** instant save with suggestions later (recommended) vs. the AI routes everything on
   save (today's Today quick capture)?
4. **Agent filing:** suggest only (recommended) vs. auto-file confident items with undo?

**Vetoable defaults:**

- One workspace per person, private, never shareable.
- Connectors with all-projects access can read and write it.
- Notes, docs and tasks only.
- The UI name is "Workspace."

## Build status (2026-10-23)

**DJ's answers:** build the ambitious version. The Workspace is home (option A: "BuildOS, the
workspace tab"). Graduating loose items into a new project is **suggestion only**: the agent may
show natural groupings, but only the person turns one into a project. The defaults stand: instant
capture with suggestions later, the agent suggests and never auto-files, one private Workspace per
person, notes, docs and tasks only, and the UI name "Workspace."

**Applied to production (rehearsed, recorded):**

- `20261023230000_workspace_foundation.sql`: `onto_projects.kind`, one Workspace per person, shape
  and sharing guards, `ensure_workspace_project()`, `kind` in project summaries, billing gate and
  brief eligibility.
- `20261023230100_workspace_suggestions.sql`: `workspace_suggestions`, the `workspace_suggest` job
  (one debounced run per person, 3 minutes after a loose doc or task is added), and loops skip the
  Workspace.
- `20261024000100_workspace_admin_analytics.sql`: admin "new/updated projects" skip Workspaces.
- `20261024000200_project_skeleton_kind.sql`: the project page's skeleton RPC returns `kind`, so a
  Workspace link redirects to /projects with no extra query.

**Built (uncommitted):**

- Home: `/projects` is titled Workspace. Capture bar (Enter = note, ⌘Enter = task), Loose shelf with
  filters, Workspace card (reader + dock), drag a doc or task onto the desktop to send it back.
- Suggestions: "Looks like a project" cards (Start a project / Not now), "→ Project?" filing chips,
  "Suggest homes" on demand. Graduate = new project + move, one Undo. All via the Organize mover.
- Worker: `workspace_suggest` (Luna lane, $0.01 cap per call, 8 runs/day, skips unchanged input).
  Daily brief: "Loose ends" section; the Workspace isn't counted as a project and gets no write-up.
- Today: "Save to Workspace" button in quick capture; "Just save it for now" on the first-run hero.
- Onboarding: "Not a project yet? Save it to my Workspace" lets a new person finish without a
  project (server gates accept loose Workspace items).
- Exclusions: project counts, billing, analytics, reviews, audits, stewards, freshness radar, START
  HERE, chat checkpoint capture, post-chat next-step generation, sharing pickers and "Move under…"
  skip the Workspace.
- Chat + MCP: global chat saves an unfiled note/doc/task to the Workspace and says so; it never
  creates a project for one item. Project chats may save there only what the user says isn't for
  the project. Writes aimed at the Workspace route directly (no review). `get_buildos_permissions`
  returns a `workspace` block. Exact prompt text is in the build log of the session (2026-10-23).

**Chat follow-up:** [tasker/146 — Workspace chat](../../tasker/146-workspace-chat.md) turns global chat into Workspace chat (you + loose items + projects).

**Smart capture (DJ, 2026-10-23, round 2):** no more Note/Task switch. The capture box is one
freeform field with a bottom bar (Send + mic), on both the Workspace and Today (it replaced
Today's "What changed today?" bar). DJ's picks: save now, sort a second later; sorting may also
apply clear project updates; same bar on Today. Flow: the jot saves as a Workspace note, then
`POST /api/workspace/capture/sort` makes one fast-lane model call (`profile: 'fast'`, $0.005 cap,
150/day per person) and the note becomes tasks/notes (in the Workspace or a project it clearly
belongs to), or marks a listed open task done / moves its date. Writes go through the normal
task/doc routes; the toast's Undo calls `/api/workspace/capture/sort/undo`. It never creates a
project. Code: `capture-sort-core.ts` (prompt, answer check, plan) and `capture-sort.service.ts`.
Not yet run against a live model (paid check needs DJ's OK).

**Not done:**

- Fold suggestions (the column supports them, no UI).
- Worker deploy (suggestion jobs queue until then) and web deploy.
- Paid checks, both need DJ's OK: one live suggestion run, and an agentic-chat battery for the new
  Workspace prompt rules (nothing has been checked against live model behaviour).
- Research capture into the Workspace from global chat (TS fallback + a new
  `apply_agentic_chat_research_capture` migration; today global research saves are skipped).
- MCP "selected projects" connections can't write to the Workspace without also reading it; a
  write-only lane needs gateway work.
- `get_user_dashboard_analytics_v1` and `get_workspace_overview` still count the Workspace.

**Known prod bug found on the way (not fixed, DJ's call):** `evaluate_user_consumption_gate` raises
42702 "column reference user_id is ambiguous" on every call. Callers fail open, so free limits never
freeze anyone.
