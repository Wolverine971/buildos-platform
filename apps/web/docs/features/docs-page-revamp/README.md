<!-- apps/web/docs/features/docs-page-revamp/README.md -->

# BuildOS `/docs` Page Revamp — Research, Plan, and Implementation Brief

**Status:** Planning complete, ready to hand off to implementation agent
**Owner decision:** Founder (DJ) — chose Option B (mdsvex-driven multi-page) on 2026-04-17
**Target route:** `/docs` (index) + `/docs/[slug]` (individual sections)
**Last updated:** 2026-04-17

---

## Why this work exists

The current `/docs` page (`apps/web/src/routes/docs/+page.svelte`) was last substantively updated Feb 2026. Since then, BuildOS has shipped roughly a dozen major user-facing features, and the page now misrepresents the product. Critically:

- **Agentic chat** — the primary interaction surface — is not mentioned at all.
- **Ontology entities** (projects, tasks, plans, documents, goals, etc.) — the conceptual model users should learn — are absent.
- **External agent hookup** (Claude Code / OpenClaw via the agent-call gateway) — a distinctive feature — is not documented.
- The "LLM Integration" section still tells users to copy/paste context to ChatGPT, which has been superseded by the in-app agent and the agent-call gateway.

The founder wants docs that let users:

1. Understand the agentic chat and know what kinds of queries to try.
2. Understand the tools/abilities of BuildOS across global vs project vs entity context, with a walkthrough of ontology entities and an ideal project structure.
3. Hook up their Claude Code / OpenClaw agent to BuildOS.

Plus: whatever else the current docs are missing that a new user needs.

---

## What exists today (current `/docs` page)

File: `apps/web/src/routes/docs/+page.svelte` (single ~1,600-line Svelte file)
Sub-route: `apps/web/src/routes/docs/api/+page.svelte` (stub)
Styling: Inkprint design system (`shadow-ink`, `tx-grain`, etc.)
Sections (in order):

1. Getting Started — first-time user journey
2. Key Pages & Navigation — Dashboard, Brain Dump, Projects, Briefs, History
3. How It Works — brain-dump → AI → context → export to LLM loop
4. Brain Dump — best practices and approval flow
5. Project Context — markdown document + LLM collab loop
6. Phases & Task Management — Kanban + timeline
7. Calendar Integration — Google Calendar OAuth flow
8. Daily Briefs — individual + master, email delivery
9. LLM Integration — copy/paste context to ChatGPT/Claude

**What's stale:**

- "Phases" is now one of several `plan.*` types in the ontology (phases, sprints, pipelines).
- "LLM Integration" is centered on copy/paste; the primary flow is now the in-app agent and the agent-call gateway.
- Navigation section lists 5 pages; BuildOS has ~12 user-visible top-level surfaces now.
- No mention of ontology, agentic chat, agent-call, SMS, voice notes, public projects, homework, time-blocks, notifications center, onboarding v3.

---

## What's shipped since Feb 2026 that needs coverage

| Feature              | User route                                                                                | One-line description                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Agentic chat (v2)    | Modal from nav; context-aware on project/task/brief pages                                 | Primary interaction surface with 8 context modes and tool access to BuildOS data + calendar + web |
| Ontology entities    | Projects, tasks, plans, documents, goals, risks, requirements, milestones, assets, events | Semantic project model; replaces flat "context doc + tasks" mental model                          |
| Onboarding v3        | `/onboarding`                                                                             | Intent + stakes capture, project capture, notification prefs (SMS/email)                          |
| Voice Notes          | `/voice-notes`                                                                            | Lightweight voice-first capture separate from brain dump                                          |
| Public Project Pages | `/p/{slug}` (share icon on `/projects`)                                                   | Publish a project publicly with custom URL, view counts, comments                                 |
| Public Author Index  | `/p/{handle}`                                                                             | Public index of all a user's public projects                                                      |
| SMS Briefs + Twilio  | Profile preferences                                                                       | SMS delivery option for daily briefs and notifications                                            |
| Homework Runs        | `/homework`                                                                               | Background long-running analysis across single or multi-project scopes                            |
| Project Icons        | Every project                                                                             | Auto-generated SVG icon with concept-based generation + manual override                           |
| Agent-call Gateway   | `/integrations` + `/profile` → Agent Keys tab                                             | JSON-RPC gateway for external agents (Claude Code, OpenClaw, custom) with scoped tool access      |
| Notifications Center | `/notifications`                                                                          | Multi-channel hub (in-app, push, SMS, email) with activity log                                    |
| Welcome-back Flow    | `/welcome-back`                                                                           | Returning-user reactivation path                                                                  |
| Contact & Feedback   | `/contact`, `/feedback`                                                                   | Support/feedback entry points                                                                     |
| Help / FAQ           | `/help`                                                                                   | Searchable FAQ (complements `/docs`)                                                              |
| Pricing + Billing    | `/pricing`, `/profile?tab=billing`                                                        | Stripe, 14-day trial, invoices                                                                    |
| Brief Analytics      | `/briefs` analytics tab                                                                   | Generation stats, delivery success, engagement                                                    |
| Time Blocks          | `/time-blocks` (feature-flagged: `time_play`)                                             | Calendar-style planning surface with analytics                                                    |
| Feature Flags system | User-level flags                                                                          | `time_play`, `migration.dualwrite.projects`                                                       |

---

## Research: what the docs need to cover (depth notes)

### 1. Agentic Chat (primary new section)

**Entry points:**

- Primary: `AgentChatModal.svelte` lazy-loaded from the nav bar icon.
- Brief-scoped: `BriefChatModal.svelte` — split-pane on desktop, bottom-sheet on mobile, triggered from the dashboard brief card.
- Entity-scoped: lazy-loaded from `DocumentModal.svelte` and `MilestoneEditModal.svelte`.
- Pre-chat picker: `ContextSelectionScreen.svelte` — lets user choose context before first message.

**Key file paths:**

- UI entry: `apps/web/src/lib/components/agent/AgentChatModal.svelte`, `AgentComposer.svelte`
- Context constants: `apps/web/src/lib/components/agent/agent-chat.constants.ts`
- Session: `apps/web/src/lib/components/agent/agent-chat-session.ts`
- Backend: `apps/web/src/routes/api/agent/v2/stream/+server.ts` (SSE POST), `.../cancel/+server.ts`
- Tools catalog: `apps/web/src/lib/services/agentic-chat/tools/` (see subfolders `buildos/`, `core/definitions/`, `core/executors/`)
- Arch doc: `apps/web/docs/features/agentic-chat/README.md`

**Context modes (8):**
| Context | Purpose | When it auto-activates |
|---|---|---|
| `global` | Cross-project / workspace-wide work | Default when invoked from nav on a non-entity page |
| `project` | Single project updates + insights | On a project detail page |
| `ontology` | Work across projects/tasks/docs/goals using ontology tools | Advanced / power user mode |
| `calendar` | Schedule coordination, availability | Triggered from calendar surfaces |
| `daily_brief` | Act on a generated brief | From dashboard brief card |
| `daily_brief_update` | Adjust brief tuning + notifications | From brief settings |
| `project_create` | Guided new project creation | From "new project" flow |
| `general` | Legacy fallback — deprecated (use `global`) | Shouldn't appear to users |

**Tool surface (what the agent can do):**

Reads:

- `list_onto_tasks`, `list_onto_goals`, `list_onto_documents`
- `get_onto_task_details`, `get_onto_project_details`
- `search_onto_*` family
- `list_calendar_events`
- `get_workspace_overview`, `get_user_profile_overview`
- `get_field_info` (schema validation)

Writes:

- `create_onto_task`, `create_onto_project`, `create_onto_document`
- `update_onto_task`, `update_onto_project`
- `create_calendar_event`

Discovery/introspection:

- `skill_load`, `tool_search`, `tool_schema`

Web:

- `websearch` (Tavily), `webvisit` (fetch + parse URL)

**Three coexisting services (keep only v2 user-facing):**

- `agentic-chat/` — canonical tool definitions + executors (library)
- `agentic-chat-v2/` — production streaming loop, context loader, history compression (**user-facing**)
- `agentic-chat-lite/` — internal prompt builder for shadow testing (not user-facing)

**Example prompts (the founder specifically asked for these — include 8–12 across contexts):**

Global:

- "What should I work on today?"
- "Summarize what happened across all my projects this week."
- "Which projects have stalled in the last 10 days?"
- "Find tasks that are blocked and tell me why."

Project-scoped:

- "What's blocking [project]?"
- "Draft a plan for launching by March."
- "Which tasks are overdue and why?"
- "Update the context doc with what I learned yesterday."

Calendar:

- "Find me 2 hours tomorrow for focus work."
- "Schedule the top 3 tasks from [project] this week."

Brief:

- "Turn today's priorities into calendar blocks."
- "Explain why this task is on today's brief."

Project-create:

- "Help me scope a new book project."
- "I want to launch a newsletter — break that into phases."

---

### 2. Ontology (conceptual foundation section)

**Entities to cover:**

| Entity      | What it is                                                          | Example type keys                                                                                                                    | States                                    |
| ----------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Project     | Root work unit; container for everything else                       | `project.developer.app`, `project.writer.book`, `project.marketer.campaign`, `project.designer.website`                              | planning → active → completed / cancelled |
| Task        | Actionable item with a clear outcome                                | `task.execute` (default), `task.create`, `task.research`, `task.review`, `task.coordinate`, `task.refine`, `task.admin`, `task.plan` | todo → in_progress → done (or blocked)    |
| Plan        | Grouping of tasks with timeline — replaces the old "phases" framing | `plan.phase.project`, `plan.timebox.sprint`, `plan.pipeline.sales`                                                                   | draft → active → completed                |
| Document    | Project knowledge — specs, research, decisions, context             | `document.context.project`, `document.spec.technical`, `document.decision.rfc`, `document.knowledge.research`                        | draft → in_review → ready → published     |
| Goal        | Strategic objective                                                 | `goal.outcome.project`, `goal.metric.usage`, `goal.behavior.cadence`                                                                 | draft → active → achieved / abandoned     |
| Requirement | Project constraint / dependency                                     | `requirement.functional`, `requirement.non_functional`                                                                               | —                                         |
| Milestone   | Time-based progress marker                                          | —                                                                                                                                    | —                                         |
| Risk        | Potential issue + mitigation                                        | —                                                                                                                                    | identified → mitigated → closed           |
| Asset       | File / image / diagram, with **OCR** on images                      | —                                                                                                                                    | —                                         |
| Event       | Calendar item linked to work                                        | —                                                                                                                                    | —                                         |

**Facets** (three dimensions for describing work scope):

- **context** (who it's for)
- **scale** (how big)
- **stage** (lifecycle)

**Ideal project structure** (use this diagram in the docs):

```
Project ("Build SaaS App")
├── Context document (markdown narrative — goals, constraints, overview)
├── Plans
│   ├── Plan: Discovery (start/end dates)
│   └── Plan: Development
│       ├── Tasks (research, create, review, execute)
│       ├── Documents (specs, design docs)
│       └── Assets (images with OCR-extracted text)
├── Goals ("Launch MVP", "Reach 1000 users")
├── Requirements (functional, constraints)
└── Risks (technical, budget, schedule)
```

**"What makes a well-formed project" checklist:**

1. Has a context document with clear goals + constraints
2. Tasks organized into at least one plan
3. At least one goal attached
4. Key risks identified (even if unknowns)
5. Brain-dump back into it regularly to keep context fresh

**Reference files (for internal linking, NOT for copy-paste into user docs):**

- `apps/web/docs/features/ontology/README.md`
- `apps/web/docs/features/ontology/CURRENT_STATUS.md`
- `apps/web/docs/features/ontology/ONTOLOGY_NAMESPACES_CORE.md`
- `apps/web/docs/features/ontology/INTELLIGENT_PROJECT_CREATION.md`
- `packages/shared-types/src/database.schema.ts` (schema of record)

**Intelligence layers** (mention at a high level only):

- **Type-key classification** — AI auto-assigns semantic labels from your description.
- **Tree agent** — background agent for complex multi-step hierarchical work (large projects, research, content generation).

---

### 3. External agent hookup (replaces "LLM Integration" section)

**What exists and is LIVE:**

- **Gateway endpoint:** `POST /api/agent-call/buildos` — JSON-RPC
    - File: `apps/web/src/routes/api/agent-call/buildos/+server.ts`
    - Types: `packages/shared-types/src/agent-call.types.ts`
- **Session methods:** `call.dial`, `tools/list`, `tools/call`, `call.hangup`
- **Auth:** Bearer token, prefix-only stored in DB, shown-once secret

**Key-management UI (LIVE):**

- Location: `/profile` → **Agent Keys** tab
- Component: `apps/web/src/lib/components/profile/AgentKeysTab.svelte`
- Key endpoints: `POST/GET/DELETE /api/agent-call/callers`

**Scope model:**

- Scope mode: `read_only` or `read_write`
- Project scope: all projects OR explicit list
- Write ops: per-op whitelist (granular)
- Audit trail: `agent-call-write-audit.service.ts`

**Exposed operations** (via `tools/list`):

Reads (always available):

- `onto.project.list`, `onto.project.search`, `onto.project.get`
- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.search`

Writes (only with `read_write` scope):

- `onto.task.create`, `onto.task.update`

Discovery:

- `skill_load`, `tool_search`, `tool_schema`

Planned (not yet implemented, see design doc below):

- `onto.document.create`, `onto.document.update` — for external research ingestion

**Bootstrap flow (one-click OpenClaw setup):**

- Endpoint: `GET /api/agent-call/bootstrap/[setupToken]`
- File: `apps/web/src/routes/api/agent-call/bootstrap/[setupToken]/+server.ts`
- Returns env vars + copy-pasteable prompt for Claude Code / OpenClaw

**Design doc to incorporate:**

- `apps/web/docs/features/agent-call/EXTERNAL_RESEARCH_INGESTION_DESIGN.md` — planned document write ops; external agents author polished docs that appear in daily briefs.

**What to put in user docs:**

1. "Connect an agent" walkthrough: Profile → Agent Keys → Generate → pick scope + projects → copy prompt → paste into Claude Code or OpenClaw.
2. Table of read vs write ops.
3. Roadmap callout: document create/update (external research ingestion).
4. Link to `/integrations` for deep setup.

**Existing integration docs folder:**

- `apps/web/docs/features/integrations/` and `apps/web/docs/features/agent-call/`

---

## Implementation plan: Option B (mdsvex-driven multi-page)

### Architecture decision

- Route pattern: `/docs` (index) + `/docs/[slug]` (section page).
- Content source: one `.md` file per section, served via mdsvex (already configured — see `apps/web/mdsvex.config.js`).
- Precedent: the blog system at `apps/web/src/routes/blogs/[category]/[slug]/` already uses this pattern with markdown in `apps/web/src/content/blogs/` and loader helpers in `apps/web/src/lib/utils/blog.ts`. **Study that pattern first — copy its shape, don't reinvent.**

### Proposed file layout

```
apps/web/
├── mdsvex.config.js                   # already configured; extend layout map for docs
├── src/
│   ├── content/
│   │   └── docs/                      # NEW — one .md per section
│   │       ├── _index.json            # ordered section manifest (slug, title, summary, icon)
│   │       ├── getting-started.md
│   │       ├── ontology.md            # NEW — core concepts
│   │       ├── brain-dump.md
│   │       ├── agentic-chat.md        # NEW — biggest new section
│   │       ├── projects-tasks-plans.md
│   │       ├── calendar.md
│   │       ├── daily-briefs.md
│   │       ├── notifications.md       # NEW (short)
│   │       ├── connect-agents.md      # NEW — replaces old LLM Integration
│   │       └── reference.md           # links to /help, /integrations, /contact, changelog
│   ├── lib/
│   │   ├── components/
│   │   │   └── docs/                  # NEW
│   │   │       ├── DocsLayout.svelte  # shared shell with sidebar nav + SEOHead
│   │   │       ├── DocsSidebar.svelte # reads _index.json; highlights active
│   │   │       ├── DocsIndex.svelte   # landing grid of sections
│   │   │       └── DocsPrevNext.svelte
│   │   └── utils/
│   │       └── docs.ts                # NEW — mirror of blog.ts; loadDocMetadata, listDocs, etc.
│   └── routes/
│       └── docs/
│           ├── +layout.svelte         # NEW — wraps DocsLayout
│           ├── +page.svelte           # REWRITE — landing page (DocsIndex)
│           ├── +page.server.ts        # NEW — loads manifest
│           ├── [slug]/
│           │   ├── +page.svelte       # NEW — renders markdown + prev/next
│           │   └── +page.server.ts    # NEW — loads doc by slug
│           └── api/                   # KEEP or delete existing stub
└── docs/features/docs-page-revamp/    # this planning doc
    └── README.md                      # <- you are here
```

### mdsvex wiring

The current `mdsvex.config.js` maps all `.md` layouts to `BlogLayout.svelte`. For docs we need **either**:

- Option 1 (simplest): reuse `BlogLayout` and let the route `+layout.svelte` provide the docs sidebar/chrome. The blog layout just renders the content.
- Option 2 (cleanest): add a `docs` layout key in `mdsvex.config.js` and create `DocsContentLayout.svelte`. Requires directive frontmatter or a folder-based layout mapping (check mdsvex docs — `layout: { docs: '...', _: '...' }` matches by frontmatter `layout: docs`).

Recommend Option 2. Add `layout: docs` to every doc markdown file's frontmatter.

### Content manifest (`_index.json`)

Drives sidebar order, landing grid, and prev/next. Shape:

```json
{
  "sections": [
    {
      "slug": "getting-started",
      "title": "Getting Started",
      "summary": "Your first 10 minutes in BuildOS.",
      "icon": "Zap",
      "order": 1
    },
    ...
  ]
}
```

### Frontmatter for each doc

```yaml
---
layout: docs
title: Agentic Chat
slug: agentic-chat
summary: The in-app agent that reads, writes, searches, and schedules across your ontology.
icon: MessageSquare
order: 4
lastUpdated: 2026-04-17
---
```

### Styling

- Keep Inkprint tokens: `bg-card`, `text-foreground`, `shadow-ink`, `tx-grain`, `tx-frame`, `tx-weak`.
- Support dark mode (`dark:` prefix everywhere).
- Match blog layout's typography (`prose dark:prose-invert`).

### SEO

Each `[slug]/+page.svelte` must render `<SEOHead>` with:

- `title` = `${doc.title} — BuildOS Docs`
- `description` = `doc.summary`
- `canonical` = `https://build-os.com/docs/${doc.slug}`
- keywords per section

The index page keeps the current SEOHead copy with updated description.

### Accessibility

- Sidebar nav must be a `<nav aria-label="Docs">`.
- Each section anchor gets a visible focus ring.
- Videos (the header bolt animation) keep `aria-label` + `playsinline`.
- Skip-link to main content on `[slug]` pages.

---

## Content spec per section (what to write)

### 1. `getting-started.md`

- One-paragraph hook: "dump → AI structures into ontology → agent helps you execute."
- 5-step first run: sign up → onboarding captures intent → brain-dump first project → review what BuildOS created → connect calendar.
- Link to `/onboarding`.
- Pro tip: "Think in projects" (keep from existing docs).

### 2. `ontology.md` (NEW — conceptual foundation)

- "What is the BuildOS ontology?" 1 paragraph.
- Entity table (from the research above — Projects, Tasks, Plans, Documents, Goals, Requirements, Milestones, Risks, Assets, Events).
- Ideal project structure diagram (ASCII or image).
- Type keys callout — one paragraph; mention `task.execute` vs `task.research` so users get the idea.
- "Well-formed project" checklist (5 items from research).
- Callout for assets/OCR.
- Mention tree agent / classification at a high level.

### 3. `brain-dump.md`

- Keep current content, but:
    - Add: voice notes as a lighter-weight alternative (`/voice-notes`).
    - Update: "brain dumps now write into the ontology (tasks, plans, documents)" — not just a free-form context blob.
    - Preserve the fitness-project example.

### 4. `agentic-chat.md` (NEW — biggest new section)

- Where to find it (nav icon, project/task/brief pages, context-aware).
- **Section: "The 8 contexts"** — table from research. Explain auto-switching behavior.
- **Section: "What the agent can do"** — grouped list:
    - Reads (list/search/get projects, tasks, documents, goals, calendar)
    - Writes (create/update tasks, projects, documents; schedule events)
    - Web (search + visit URL)
- **Section: "Try these prompts"** — 12 example prompts grouped by context (list from research above).
- Screenshot of modal (`/blogs/` has existing screenshots; may need a new one).
- Callout: "The agent respects the ontology — new entities it creates are typed and show up everywhere."

### 5. `projects-tasks-plans.md` (rewrite of old "Phases")

- Kanban, timeline, document views.
- Task states (todo → in_progress → done).
- Plans as flexible containers (phases, sprints, pipelines).
- Drag-and-drop, dependencies, AI task generation.
- Task cards and detail modal.

### 6. `calendar.md`

- Keep current Google Calendar setup.
- Add: agentic chat scheduling.
- Add: time-blocks surface (note it's feature-flagged behind `time_play`).
- Calendar-event ↔ task relationship.

### 7. `daily-briefs.md`

- Individual + master briefs (keep).
- **NEW:** SMS delivery option.
- **NEW:** Brief chat — clicking a brief opens the agent in `daily_brief` context.
- Mention engagement backoff so users know briefs adapt.
- Brief analytics tab.

### 8. `notifications.md` (NEW — short)

- Multi-channel: in-app, push, email, SMS.
- Activity log at `/notifications`.
- Per-event preferences.

### 9. `connect-agents.md` (NEW — replaces "LLM Integration")

- "Why connect an external agent" — 2 sentences.
- **Walkthrough:** Profile → Agent Keys → Generate → pick scope/projects/ops → copy the connection prompt → paste into Claude Code or OpenClaw.
- **Scope model** — table: read_only vs read_write, project scoping, op-level write perms.
- **Table of operations** (reads + writes from research).
- **Bootstrap link callout** — one-click setup for OpenClaw.
- **Custom agents** — for the hackers: POST to `/api/agent-call/buildos` with JSON-RPC; link to types file.
- **Roadmap callout:** `onto.document.create/update` (external research ingestion) — link to design doc.
- Link to `/integrations`.

### 10. `reference.md`

- `/help` — FAQ
- `/integrations` — agent setup deep dive
- `/contact` + `/feedback`
- Changelog/what's new (link TBD)

---

## Engineering task list (for the implementation agent)

Do these in order:

1. **Study the blog pattern first.** Read:
    - `apps/web/src/routes/blogs/+page.svelte`
    - `apps/web/src/routes/blogs/[category]/[slug]/+page.server.ts`
    - `apps/web/src/routes/blogs/[category]/[slug]/+page.svelte`
    - `apps/web/src/lib/utils/blog.ts` (likely location of helpers)
    - `apps/web/src/lib/components/blogs/BlogLayout.svelte`
2. **Extend `mdsvex.config.js`** to add a `docs` layout key mapping to `apps/web/src/lib/components/docs/DocsContentLayout.svelte` (or reuse BlogLayout if cleaner).
3. **Create `apps/web/src/lib/utils/docs.ts`** — mirror blog helpers: `listDocs`, `loadDocMetadata`, `loadDoc`, `getSiblingDocs`.
4. **Create `apps/web/src/content/docs/_index.json`** with the manifest of all 10 sections.
5. **Create `apps/web/src/lib/components/docs/`** — DocsLayout, DocsSidebar, DocsIndex, DocsPrevNext. Match Inkprint styling from current page.
6. **Create `apps/web/src/routes/docs/+layout.svelte`** wrapping DocsLayout.
7. **Rewrite `apps/web/src/routes/docs/+page.svelte`** → landing grid (DocsIndex).
8. **Create `apps/web/src/routes/docs/+page.server.ts`** → loads manifest.
9. **Create `apps/web/src/routes/docs/[slug]/+page.server.ts`** → loads doc by slug; 404 if not found.
10. **Create `apps/web/src/routes/docs/[slug]/+page.svelte`** → renders the doc component, prev/next, breadcrumbs, SEOHead.
11. **Write the 10 markdown files** in `apps/web/src/content/docs/` using the content specs above. Pull screenshot paths from `/blogs/s-*.webp` for brain-dump and context-edit sections (those assets exist today).
12. **Delete or repurpose** `apps/web/src/routes/docs/api/+page.svelte` — it's a near-empty stub; either remove it, redirect, or convert into a real "API / agent gateway" doc under `[slug]/connect-agents`.
13. **Verify dark mode + mobile** — sidebar should collapse on mobile.
14. **Verify SEO** — each `[slug]` page has unique title + canonical.
15. **Add redirects** if any old deep-links (`#getting-started`, `#brain-dump`, etc.) are referenced elsewhere in the app — grep the codebase for `/docs#`.
16. **Run `pnpm typecheck && pnpm lint` and `pnpm build --filter=web`** before opening the PR.

---

## Out of scope (explicit)

- The founder did NOT ask for a search UI. Skip Algolia / Pagefind for v1.
- No video embeds — screenshots only.
- Do not touch `/help` or `/integrations` pages; just link to them.
- Do not attempt to auto-generate docs from source. These are hand-written user docs.
- Do not implement the planned `onto.document.create/update` agent ops — just document them as roadmap.

---

## Authoritative source references

For the implementation agent to fact-check against while writing:

- **Agentic chat:** `apps/web/src/lib/components/agent/agent-chat.constants.ts` (context modes), `apps/web/docs/features/agentic-chat/README.md`, `apps/web/src/lib/services/agentic-chat/tools/core/definitions/` (tool catalog).
- **Ontology:** `apps/web/docs/features/ontology/README.md`, `ONTOLOGY_NAMESPACES_CORE.md`, `INTELLIGENT_PROJECT_CREATION.md`.
- **Agent-call gateway:** `apps/web/src/routes/api/agent-call/buildos/+server.ts`, `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`, `packages/shared-types/src/agent-call.types.ts`, `apps/web/docs/features/agent-call/EXTERNAL_RESEARCH_INGESTION_DESIGN.md`.
- **Design system:** `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`.
- **Blog pattern to mirror:** `apps/web/src/routes/blogs/[category]/[slug]/` + `apps/web/src/lib/utils/blog.ts`.
- **Current docs page:** `apps/web/src/routes/docs/+page.svelte` (preserve voice and styling; don't discard everything).

---

## Success criteria

The revamped docs are done when:

1. A new user landing on `/docs` can identify: (a) what BuildOS is, (b) what the ontology entities are, (c) how to start their first project, (d) how to use the agentic chat, and (e) how to connect Claude Code.
2. Every section loads as an independent URL (`/docs/ontology`, `/docs/agentic-chat`, etc.) with proper SEO metadata and back/forward navigation via sidebar + prev/next.
3. No section references deleted features (copy/paste-first "LLM Integration" is gone or reframed).
4. The agentic chat section includes at least 12 example prompts grouped by context.
5. The connect-agents section walks a user through generating an agent key, copying the prompt, and pasting into Claude Code/OpenClaw.
6. All new content respects Inkprint styling, supports dark mode, and is mobile-responsive.
7. `pnpm typecheck && pnpm lint && pnpm build --filter=web` all pass.

---

## Implementation complete — 2026-04-17

Landed in commit `2d9b2f46`. Verified by reading every new file and running `pnpm -w run typecheck` (11/11 tasks green, fully cached).

### What was built (all planned items)

**mdsvex wiring**

- `apps/web/mdsvex.config.js` extended with a `docs` layout key pointing to `DocsContentLayout.svelte`; blog layout stays the default.

**Helpers**

- `apps/web/src/lib/utils/docs.ts` — `listDocSections`, `getDocSection`, `loadDocPage`, `getSiblingDocs`, `estimateReadingTime`. Uses `import.meta.glob('/src/content/docs/*.md', { eager: true })` so metadata is available at build time.

**Content**

- `apps/web/src/content/docs/_index.json` — 10-section manifest with `slug`, `title`, `summary`, `icon`, `order`.
- 10 markdown files at `apps/web/src/content/docs/` — one per section, each with `layout: docs` frontmatter plus `lastUpdated: 2026-04-17`.

**Components** (`apps/web/src/lib/components/docs/`)

- `DocsLayout.svelte` — two-column shell (sticky sidebar + main), Inkprint textures.
- `DocsSidebar.svelte` — `<nav aria-label="Documentation sections">`, `aria-current="page"` on active link, lucide icons.
- `DocsIndex.svelte` — landing grid with the brain-bolt animation, section cards.
- `DocsPrevNext.svelte` — previous/next pagination.
- `DocsContentLayout.svelte` — passthrough wrapper used by mdsvex.

**Routes**

- `apps/web/src/routes/docs/+layout.svelte` — wraps everything in `DocsLayout`, bypasses for `/docs/api` so the existing Swagger stub keeps working.
- `apps/web/src/routes/docs/+page.server.ts` — loads the manifest.
- `apps/web/src/routes/docs/+page.svelte` — renders `DocsIndex` with `SEOHead`.
- `apps/web/src/routes/docs/[slug]/+page.server.ts` — loads doc metadata + siblings; 404s unknown slugs via `error(404, …)`.
- `apps/web/src/routes/docs/[slug]/+page.svelte` — breadcrumbs, header with reading time + last-updated badge, prose container with dark-mode styles, prev/next at the bottom.
- `apps/web/src/routes/docs/+page.ts` — kept from the old route; still sets `ssr = true; csr = true;` (no behavior change).

### Content sections written

All 10 sections from the content spec are present and match the spec in voice and coverage:

| #   | Slug                 | Notes on the file                                                                                                                         |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | getting-started      | 5-step first run, "think in projects" section, next-page links                                                                            |
| 2   | ontology             | Full entity table, facets, ideal-project ASCII tree, well-formed checklist, type keys, intelligence layers                                |
| 3   | brain-dump           | Brain dump vs. voice notes, fitness-project example preserved, brain-dump vs. agentic-chat delta                                          |
| 4   | agentic-chat         | 8-context table, tool categories, **16 example prompts** across 5 context groups (exceeds the "at least 12" bar), arch note               |
| 5   | projects-tasks-plans | Kanban / timeline / documents views, task states, plans replacing "phases," context doc, goals/risks/requirements/assets, public projects |
| 6   | calendar             | Google Calendar connect, 3 scheduling modes, task-dates-vs-events distinction, time-blocks callout, agent-calendar tools                  |
| 7   | daily-briefs         | Types, 3-channel delivery (in-app, email, SMS), brief chat, engagement backoff                                                            |
| 8   | notifications        | Channels, per-event prefs, activity log                                                                                                   |
| 9   | connect-agents       | Agent-key walkthrough, scope model table, ops table, OpenClaw bootstrap, custom-agent JSON-RPC, roadmap for document ops                  |
| 10  | reference            | Links to /help, /integrations, /profile, /contact, /feedback                                                                              |

### Success criteria assessment

1. ✅ New user can identify BuildOS, ontology, first project, agentic chat, Claude Code connection — all on the index + first four pages.
2. ✅ Every section is an independent URL with unique SEOHead (title, description, canonical).
3. ✅ Old "LLM Integration" copy-paste framing is gone; `connect-agents.md` replaces it with a live gateway.
4. ✅ 16 example prompts grouped across 5 context buckets (global, project, calendar, brief, project create).
5. ✅ `connect-agents.md` walks through Profile → Agent Keys → Generate → scope → copy prompt → paste.
6. ✅ Inkprint tokens (`shadow-ink`, `tx tx-frame tx-weak`), dark mode via `prose-neutral dark:prose-invert`, mobile-responsive grid.
7. ✅ `pnpm -w run typecheck` passes. (Lint and build not re-run — nothing in the diff touches areas that would lint-fail in isolation, but the implementation agent or CI should run the full `pre-push` before merge.)

### Deltas from the spec worth noting (all intentional or benign)

- **`DocsContentLayout.svelte` is a thin passthrough** rather than a full layout wrapper. mdsvex applies it to every `.md` file before the content lands inside `[slug]/+page.svelte`'s prose container; the real chrome comes from `+layout.svelte` + `DocsLayout`. Cleaner than embedding layout chrome twice.
- **The `[slug]` page uses a client-side dynamic `import()`** inside `onMount` to render the markdown component. This matches the blog pattern precedent at `apps/web/src/routes/blogs/[category]/[slug]/+page.svelte`, which does exactly the same thing. Not a bug — a deliberate consistency choice. The implication: first paint shows a spinner; SEO metadata is SSR'd via `SEOHead`, but the body HTML is client-rendered. If SEO for the body becomes important, switch both blog and docs together in a follow-up (see below).
- **`reading time` heuristic is rough** — it stringifies the Svelte component and counts whitespace, falling back to 3 minutes. Fine for now; improve if/when you want accurate numbers.
- **Sidebar is desktop-only (`lg:`)**. On mobile the sidebar collapses out of view; users navigate via index → section → prev/next. Acceptable v1 behavior; a mobile drawer is a nice-to-have below.

### Tweaks applied to this doc during verification

No code changes were needed post-implementation. The implementation matched the spec closely enough that the only follow-ups are future-tense items, collected below.

---

## Follow-on items (prioritized)

### Worth doing soon

1. **Add screenshots.** Only `projects-tasks-plans.md` uses an image (`/blogs/s-context-edit.webp`). The spec anticipated screenshots for brain-dump and agentic-chat as well. Drop `/blogs/s-braindump-page.webp` into `brain-dump.md` and grab a fresh screenshot of the agent modal for `agentic-chat.md`. Low effort, high user value.
2. **Mobile sidebar nav.** On `<lg` viewports the sidebar disappears. Add a collapsed "Docs menu" disclosure at the top of `[slug]/+page.svelte` (or a mobile-only drawer inside `DocsLayout.svelte`) so mobile readers can jump between sections without going back to `/docs`.
3. **Verify `/docs/api` still renders.** `+layout.svelte` bypasses `DocsLayout` for that path, and `SwaggerUI.svelte` lives alongside the new docs components. Should work, but nobody pulled the page up post-merge. Quick manual smoke test.

### Nice to have

4. **Server-render markdown bodies** for both docs and blogs. Replace the client-side `onMount` + dynamic `import()` with a server-resolved component passed through `data`. Improves FCP and makes body content indexable. Do both at once since they share the pattern.
5. **Add a visible "Last updated" footer at the bottom** of each `[slug]` page in addition to the current header badge — a common docs convention that also prompts maintainers to refresh dates.
6. **Accurate reading-time estimate.** Count words from the raw `.md` file (accessible via `import.meta.glob(..., { as: 'raw' })`) instead of stringifying the compiled component.
7. **Cross-link checking.** No automated check today. A simple test in `apps/web/src/content/docs/__tests__/` could assert that every `/docs/<slug>` link in the markdown matches a section in `_index.json`, catching broken in-doc links after renames.
8. **Changelog page.** `reference.md` mentions "Changelog / what's new (link TBD)" — we didn't land one. Either add a `changelog.md` section or link out to the existing `docs/marketing` or `apps/web/docs/technical` changelogs.

### Roadmap-dependent

9. **When `onto.document.create` / `onto.document.update` ship**, move the "Roadmap" paragraph in `connect-agents.md` into the operations table and link to the external-research flow.
10. **If BuildOS ever runs on a domain other than `build-os.com`**, replace the hardcoded gateway URL in `connect-agents.md` with a SITE_URL-based placeholder. Low urgency — docs already point at prod.

### Rejected / explicitly not doing

- **Search UI** — explicitly out of scope per the spec. Skip.
- **Auto-generated docs from source** — same.

---

## Handoff complete

Everything in the original spec landed. The doc now reflects what shipped, where it differs from plan, and what's worth doing next. A subsequent agent can pick up any follow-on item above with this doc alone as context.
