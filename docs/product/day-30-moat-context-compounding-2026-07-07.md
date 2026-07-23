<!-- docs/product/day-30-moat-context-compounding-2026-07-07.md -->

# Day-30 Moat And Context Compounding

Date: 2026-07-07 (verified against shipped code 2026-07-10)
Status: Moat definition + product audit
Scope: The BuildOS moat around "what gets better on day 30 that ChatGPT cannot recreate in one prompt?"
Companion docs: `docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md` (the loop model this doc scores the moat against), `docs/product/thinking-loop-plan-of-attack-2026-07-07.md` (the execution roadmap; this is its Phase 0 / Phase 7 research), and the forthcoming `docs/product/activation-as-strategy-assessment-2026-07-07.md` (tasker/22 — activation funnel; not duplicated here).

Terminology: `docs/product/PROJECT_REVIEW_TAXONOMY.md` governs the Project Review capability;
legacy flags and code paths still use `PROJECT_LOOPS_*` / `project-loop` names.

---

## Executive Finding

The moat is real, but it is **narrower and more concrete than the seven-component slogan**, and roughly **half of the "cognitive" surface the pitch leans on is either dormant in the schema or built-but-dark in production.**

What is actually defensible today:

> BuildOS is a **user-owned, structured, permissioned, fully-audited store of one project's state** — tasks, documents, goals, milestones, plans, risks, and the relationships and change-history between them — that **you and every agent you connect read and write through one gateway.** The intelligence accumulates on the **project graph and its change log**, not in a chat. Any model — ChatGPT, Claude, Cursor, a custom agent — inherits that state in one connection. A fresh prompt can be smart, but it never owns your project's accumulated, structured, auditable state.

The compounding unit is the **project graph plus its `onto_project_logs` change ledger**, not conversation history. That is the thing ChatGPT cannot reconstruct from one prompt: it can be handed a paste, but it cannot be handed 30 days of structured, actor-attributed, before/after mutation history over a typed entity graph that both humans and external agents have been writing to under scope and audit.

Where the moat is strong on evidence:

- **Persistent project state** — a real typed ontology (`onto_projects/tasks/documents/goals/milestones/plans/risks/events` + `onto_edges` relationships), with a full mutation ledger (`onto_project_logs`, before/after + actor + source + session).
- **Agent gateway** — external agents read and write scoped project state through one gateway with a three-place audit trail, read-only-by-default scopes, and a lethal-trifecta threat model already written.
- **Restart clarity** — the `/today` view (shipped 2026-07-10) is the first genuinely strong "what changed since you were here" surface, built directly on the change ledger with actor attribution.

Where the moat is currently a promise, not a product:

- **Decisions do not exist as a queryable primitive.** `onto_decisions` is a schema table with **zero create/read/surface path anywhere in the product** — decisions are captured only as prose inside START HERE documents. Every "which decisions are stale?" claim in the pitch is unanswerable structurally today.
- **Cognitive forcing (drift, contradictions, stale assumptions) is built but flag-gated OFF in production** (Project Reviews). The one cognitive surface that ships — the daily brief — is a 39KB wall reaching effectively one user.
- **Public artifacts are a distribution loop, not a compounding loop.** A public page is one document snapshot; feedback never returns to project memory.
- **Structured messy input is thinner than the marketing.** The raw brain-dump path is metadata-only; real structuring happens through agentic chat / agent-runs, and even there decisions/signals/insights are never created.

Bottom line for DJ: **BuildOS is building toward the moat, and the two hardest, most-defensible pieces (structured owned state + audited agent gateway) are the ones already shipped.** The gap is not architecture — it is that the "day-30 notices drift and stale decisions" story is not wired to production, and the single primitive the pitch names most (decisions) is not implemented at all. Close those two and the day-30 answer becomes demonstrable rather than aspirational.

---

## 1. Plain-English Moat Statement

**The day-30 test:** _What gets better on day 30 that ChatGPT cannot recreate in one prompt?_

**The honest day-30 answer, today:**

On day 30, a BuildOS project is a **structured graph of typed entities** (tasks, docs, goals, milestones, plans, risks, events) connected by explicit relationships, wrapped in a **timestamped, actor-attributed change ledger** that records every mutation — who changed what, when, from what to what, and whether it was you, a teammate, an in-app agent chat, an agent run, or an external agent connected over MCP. On restart, `/today` can answer "what changed since you were here" from that ledger without you re-reading anything.

ChatGPT on day 30 is identical to ChatGPT on day 1. Even with its memory feature, it holds unstructured recollections, not a project graph; it has no per-entity change history, no cross-agent audit trail, no permissioned read/write surface, and no notion of relationships between your risks, tasks, and goals. You can paste it context, but you cannot paste it **30 days of structured multi-actor state**. That is the gap.

**The moat is not "memory."** Frontier labs will ship better memory; that race is lost by default. The moat is the combination that a stateless-chat provider is structurally unable to own:

1. **Structure** a model can reason over, not a transcript it must search (`TP14`).
2. **Ownership** — the user owns the surface; it is neutral across competing providers, which is why OpenAI/Anthropic cannot be the shared layer (`TP17`, the "where does context live" first-principles question).
3. **Read + write, not read-only** — agents update the state, so "tell your agent to go update BuildOS" is a real sentence (`TP6`).
4. **Audit + permission** — every agent read/write is scoped, revocable, and logged (`TP5`, `TP16`).

The compounding statement, beyond slogan: **each capture adds typed entities and relationships to the graph and appends to the change ledger; each surface (brief, `/today`, project page) reads back from that accumulated graph; so the marginal value of the next interaction rises with graph size and history depth, and every connected agent inherits the whole accumulation for free.** The model does not get smarter. The project does. (`TP12`.)

The narrow line to defend:

> **The project remembers — in a structure a model can reason over and an audit trail a team can trust — so context compounds on the project, not in a chat.**

---

## 2. What Compounds? Inventory

Each row: what it is, why it matters to the user, how it reduces future effort / improves the next AI interaction / eases restart, where it is stored, and whether it is **surfaced** or **merely stored** (the distinguishing test from the thinking-loop rubric).

| Durable object                             | Why it matters                                                                   | Reduces effort / better next AI / easier restart                             | Stored where                                                                                                                                        | Surfaced?                                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Project facts / orientation**            | The "what is this project" answer stops being re-explained                       | Agents read state on connect (`TP3`); restart shows current state            | `onto_projects` (`next_step_*`, facets) + START HERE prose in `onto_documents`                                                                      | **Surfaced** — project page header, `/today`, brief; but orientation is prose, not queryable fields |
| **Tasks**                                  | The actual work; the unit of "what's next"                                       | Next-move ranking, blocked/overdue detection, done-toggles                   | `onto_tasks` (states: todo/in_progress/blocked; due/start dates)                                                                                    | **Surfaced** — project board, `/today` agenda, brief                                                |
| **Milestones / goals / plans**             | The arc and target of the project                                                | Goals-at-risk, milestone state, plan structure feed the brief                | `onto_goals`, `onto_milestones`, `onto_plans`                                                                                                       | **Surfaced** — project entity tab strip (`v2/EntityTabStrip.svelte`), brief                         |
| **Decisions**                              | _The_ primitive the pitch names most ("day 100 knows your decisions")            | Would enable "which decisions are stale?", "what does this contradict?"      | `onto_decisions` table exists **but has no create/read/surface path**; decisions live as prose in START HERE docs (`startHereCaptureProcessor.ts`)  | **Barely** — only as unstructured document text; **not queryable**                                  |
| **Risks**                                  | Live threats to the project                                                      | Active-risks section in brief; risk tab; agents can create risks             | `onto_risks` (impact, probability, mitigated_at)                                                                                                    | **Surfaced** — Risks tab + brief `### Active Risks`; created via chat/agent-run, not raw brain dump |
| **Open questions**                         | The "what's unresolved" backbone of cognitive forcing                            | Would drive "which open loops block the project?"                            | **No dedicated entity.** `onto_signals` exists but is dormant                                                                                       | **Not built**                                                                                       |
| **Documents**                              | Long-form artifacts, research write-ups, START HERE                              | Versioned, embedding-backed context for agents                               | `onto_documents` (+ `onto_document_versions`, embeddings)                                                                                           | **Surfaced** — docs tab, public pages                                                               |
| **Research / sources**                     | External evidence tied to the project                                            | Provenance for claims; agent-ingestable                                      | `onto_sources` (spec-instantiation only), external research ingestion path                                                                          | **Partial** — creatable only via ProjectSpec, not chat/agent write ops                              |
| **User intent / preferences**              | Personalization; dismissal memory                                                | Suppresses repeat suggestions; tunes tone                                    | `profile_fragments`, `user_contacts`, inbox dismissal feedback                                                                                      | **Partial / gated** — no safe user-triggered merge/apply yet (see AI Inbox doc §2)                  |
| **Calendar / activity traces**             | Evidence a project exists; the day's shape                                       | Calendar→project suggestions; merged agenda                                  | `onto_events`, `onto_event_sync`, calendar analysis service                                                                                         | **Surfaced** — `/today` agenda, calendar-analysis modal                                             |
| **Agent actions**                          | The receipts of what agents did                                                  | "What did my agent do while I was away?"                                     | `onto_project_logs` + `agent_call_tool_executions` + `agent_runs` + `security_events`                                                               | **Surfaced** — `/today` "what changed" receipts (actor-attributed)                                  |
| **Public artifacts**                       | Proof / distribution / templates                                                 | Shareable, crawlable, cloneable ("made with BuildOS")                        | `onto_public_pages` (document-scoped), `onto_public_page_views`, `onto_comments`                                                                    | **Surfaced** — `/p/[slug]`; but document-scoped and feedback does not return to project memory      |
| **Relationships between all of the above** | The graph that makes structure reasoning possible                                | "Which task matters because of a decision three weeks ago?" needs edges      | `onto_edges` (typed rel, src/dst kind)                                                                                                              | **Surfaced** — project graph view; underused in surfacing logic                                     |
| **The change ledger itself**               | The compounding substrate — every mutation, before/after, actor, source, session | Powers restart clarity + agent audit; the one thing ChatGPT cannot be handed | `onto_project_logs` (before_data, after_data, change_source, changed_by_actor_id, agent_call_session_id, chat_session_id, external_agent_caller_id) | **Surfaced** — `/today` receipts via `what-changed.service.ts`                                      |

**The pattern in this table is the finding:** the objects that compound and are surfaced are the _operational_ ones (tasks, docs, goals, risks, events, the change ledger). The objects that would power _cognitive forcing and true day-30 differentiation_ (decisions, open questions, contradictions) are the ones stored-but-not-surfaced or not built. The moat's operational floor is solid; its cognitive ceiling is unbuilt.

---

## 3. The Compounding Ladder: Day 1 / 7 / 30 / 90

For each rung: what the user entered, what BuildOS remembers, what it can now do that it could not before, what the user feels, and the metric that proves it. **Bracketed `[GAP]` marks where the rung depends on something not yet shipped or not enabled in prod.**

### Day 1 — Messy input becomes a recognizable project

- **Entered:** one messy brain dump / voice dump / chat, or a calendar signal.
- **Remembers:** a project with tasks, maybe goals/docs/risks, created through agentic chat or an agent-run (the raw brain-dump processor only stores title/topics/summary — real structuring is the chat/agent path).
- **Newly able to:** show the project as a navigable thing, not a scrollback (`TP11`).
- **Feels:** "It understood the mess and gave it a shape." (relief)
- **Metric:** first structured project created; transformation receipt viewed. `[GAP]` — onboarding still allows zero-project completion; transformation receipt is not shown (see thinking-loop doc P0 and tasker/22).

### Day 7 — Resume without re-reading everything

- **Entered:** a few work sessions; some tasks done; a chat or two.
- **Remembers:** task state changes, doc edits, chat mutations — all in `onto_project_logs`.
- **Newly able to:** `/today` shows "what changed since you were here," actor-attributed, grouped by project, anchored to last visit. This is the first rung that is genuinely shipped and strong.
- **Feels:** "I can pick up where I left off without paying the re-orientation tax."
- **Metric:** 7-day return rate; `/today` receipt-section views; time-to-restart. `[GAP]` — `/today` currently emits **zero** telemetry (tasker/25).

### Day 30 — Notices drift, stale work, recurring blockers, next moves

- **Entered:** a month of updates across multiple entities.
- **Remembers:** enough history to compute staleness, blockers, goals-at-risk, and cross-project patterns.
- **Newly able to (shipped):** the daily brief surfaces active risks, blocked tasks, stale-in-progress (>7d), goals at risk, and "3 projects waiting on the same blocker" patterns.
- **Newly able to (built, dark):** Project Reviews compute drift, task conflicts (duplicate/contradiction/blocked_by), stale assumptions, and outdated docs — `[GAP]` **flag-gated OFF in prod** (`PROJECT_LOOPS_ENABLED` / `ENABLE_PROJECT_LOOPS`).
- **Not able to:** flag a _stale decision_ or a _contradiction between new input and a prior decision_ — `[GAP]` no code reads `onto_decisions`; the loop's "open_decisions" is faked from top-3 task titles.
- **Feels:** "It's watching the project the way I would if I had the time." — partially true today; the strongest version is behind a flag.
- **Metric:** brief acted-on rate within 24h; suggestions accepted; repeat-blocker detection. `[GAP]` — brief has near-zero reach and no decide/update path.

### Day 90 — Canonical project memory for humans and agents

- **Entered:** sustained multi-actor use, including connected external agents.
- **Remembers:** a deep graph + a long, multi-actor change ledger; agent reads/writes interleaved with human edits, all audited.
- **Newly able to:** be the single source of truth every agent reads off (`TP4` cross-agent coherence); answer "what did my agent do while I was away?" from `/today` receipts; give a new agent the whole project in one connection (`TP15` asymmetric leverage).
- **Feels:** "This is where the project lives. My tools plug into it, not the other way around." (`the office`, not another chat)
- **Metric:** projects with 30/90-day continuous history; external-agent reads/writes tied to owner-visible receipts; restart-clarity self-rating; agents-per-project. This rung is architecturally supported (gateway + audit shipped) but unmeasured and only lightly used.

**Ladder verdict:** Days 1 and 7 are shipped (1 with an activation gap, 7 strong via `/today`). Day 30's operational half ships; its cognitive half is dark. Day 90 is architecturally real but unproven and unmeasured.

---

## 4. Seven-Component Moat Audit

Each component: definition, user-visible feeling, product objects/systems, current implementation evidence (with file paths), gaps, metrics, risk, and best next experiment.

### 4.1 Persistent Project State — STRONG

| Field                    | Assessment                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definition**           | BuildOS is not a better chat; it is where the project lives — a typed, durable entity graph.                                                                                                                                    |
| **Feeling**              | "My project is a place I can see, click, and navigate" (`TP11`).                                                                                                                                                                |
| **Objects / systems**    | `onto_projects/tasks/documents/goals/milestones/plans/risks/events`, `onto_edges` (relationships), `onto_project_logs` (ledger). Entity-kind vocabulary: `packages/shared-agent-ops/src/ontology/onto.ts`, `edge-direction.ts`. |
| **Evidence**             | Full ontology schema in `packages/shared-types/src/database.schema.ts` (L1702–2153). Project page + `v2/EntityTabStrip.svelte` surface Goals/Milestones/Plans/Risks/Events. `/today` reads across projects.                     |
| **Gaps**                 | `onto_decisions`, `onto_signals`, `onto_insights` are **dormant tables** (no create/read/surface). Relationships (`onto_edges`) exist but are underused in surfacing logic. Orientation facts live as prose, not fields.        |
| **Metrics**              | Entities per project over time; % projects with >1 entity type; relationship density; graph continuity at 30/90d.                                                                                                               |
| **Risk**                 | Frontier labs ship "project memory" as default (see §6). Mitigate by owning _structure + audit + gateway_, not raw memory.                                                                                                      |
| **Best next experiment** | Ship `onto_decisions` end-to-end (create from chat + a Decisions tab + brief section) — it is the single highest-leverage unlock because it is named most in the pitch and built least.                                         |

### 4.2 Structured Messy Input — MEDIUM

| Field                    | Assessment                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definition**           | Voice / brain dump becomes projects, tasks, decisions, risks, docs — automatically, no maintenance tax (`TP7`, `TP13`).                                                                                                                                                                                                                                                          |
| **Feeling**              | "I talked; it organized."                                                                                                                                                                                                                                                                                                                                                        |
| **Objects / systems**    | Agentic chat + agent-runs (`BUILDOS_AGENT_WRITE_OPS` in `agent-call.types.ts`), ProjectSpec instantiation (`instantiation.service.ts`), raw braindump processor (`braindumpProcessor.ts`).                                                                                                                                                                                       |
| **Evidence**             | Structuring via chat/agent-run creates project, task, document, goal, plan, milestone, risk (+ requirement/metric/source via spec). Handlers in `op-execution-gateway.core-entities.ts`.                                                                                                                                                                                         |
| **Gaps**                 | The **raw brain-dump processor is metadata-only** (title/topics/summary) — creates zero entities. Decisions/signals/insights are never created by any structuring path. The core marketing verb ("brain dump → structured work") is served by the _chat_ path, not the _brain dump_ path — a naming/reality mismatch (thinking-loop doc, "Resolve the brain dump object model"). |
| **Metrics**              | Capture→structure conversion by source; entities generated per capture; % captures that create ≥1 entity.                                                                                                                                                                                                                                                                        |
| **Risk**                 | Noisy captures lower trust (§6). Mitigate with review/receipts.                                                                                                                                                                                                                                                                                                                  |
| **Best next experiment** | Route raw brain dumps through the same structuring pipeline as chat (or explicitly park them with a next action) so "brain dump" the noun matches "brain dump → structure" the promise.                                                                                                                                                                                          |

### 4.3 Context Compounding — MEDIUM-STRONG (substrate strong, proof missing)

| Field                    | Assessment                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Definition**           | The project is more useful on day 30 than day 1; every interaction adds to the graph + ledger.                                                                                                                                                                           |
| **Feeling**              | "It keeps getting easier to resume."                                                                                                                                                                                                                                     |
| **Objects / systems**    | `onto_project_logs` (the compounding substrate), the entity graph, `what-changed.service.ts`.                                                                                                                                                                            |
| **Evidence**             | Every mutation path writes `onto_project_logs` with before/after + actor + source + session (REST via `X-Change-Source`, gateway = `agent_call`, worker chat = `chat`, external agents carry `external_agent_caller_id`). `/today` reads it back.                        |
| **Gaps**                 | **No telemetry proves compounding** — `/today` emits zero events (tasker/25). No metric distinguishes a compounding project from a dead one. The `brain_dump` actor branch in `what-changed.service.ts` is largely unreachable (raw brain dumps don't write the ledger). |
| **Metrics**              | Repeated-update projects; restart time trend; brief acted-on rate; graph growth; return-after-7/30d.                                                                                                                                                                     |
| **Risk**                 | If users don't maintain context, nothing compounds (§6).                                                                                                                                                                                                                 |
| **Best next experiment** | Instrument the loop envelope from the thinking-loop doc on `/today` first (capture-submitted, receipt-viewed, done-toggled, decision-made), then define one "compounding project" metric and watch it.                                                                   |

### 4.4 Restart Clarity — STRONG (newly shipped)

| Field                    | Assessment                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definition**           | "What matters now?" after days or weeks away, without re-reading everything.                                                                                                                                                                                                                                                                                                                          |
| **Feeling**              | "I'm oriented in 30 seconds."                                                                                                                                                                                                                                                                                                                                                                         |
| **Objects / systems**    | `/today` view; `what-changed.service.ts`; `project-logs-enrich.ts`; daily brief.                                                                                                                                                                                                                                                                                                                      |
| **Evidence**             | `/today` (shipped 2026-07-10, `4395206f`): merged agenda, "what changed since you were here" receipts (actor-attributed You / member / Agent chat / Agent run / external caller / Brain dump; grouped per entity; anchored to last visit, clamped 7d), quick capture, done toggles. Wired in `Navigation.svelte` (`/today`, L210). Doc: `apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md`. |
| **Gaps**                 | Daily brief — the _other_ restart surface — is degraded: a 39KB wall, no app-open trigger, no decide/update path, and effectively zero reach (every daily-brief email in 60 days went to DJ; see `DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md`). Receipts don't yet click through to the entity or offer per-change chat.                                                                                    |
| **Metrics**              | Time-to-restart; receipt-section views; 7/30-day return; "did you know what to do next?" self-rating.                                                                                                                                                                                                                                                                                                 |
| **Risk**                 | Product stores context but fails to surface it (§6) — `/today` directly counters this.                                                                                                                                                                                                                                                                                                                |
| **Best next experiment** | Make `/today` the default post-login landing (flip the `/` redirect) once instrumented, and add receipt→entity click-through + per-receipt "chat about this change."                                                                                                                                                                                                                                  |

### 4.5 Agent Gateway — STRONG

| Field                    | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Definition**           | Agents read/write scoped project state with permissions and audit trails.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Feeling**              | "Any smart agent can walk into my office, read the files, and help — and I can see what it touched" (`TP5`, `TP16`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Objects / systems**    | Remote MCP connector `/mcp/buildos` + OAuth 2.1; agent-call gateway; `BUILDOS_AGENT_READ_OPS`/`WRITE_OPS` (`agent-call.types.ts`); `policy.ts` (scopes); `op-execution-gateway.core.ts`; audit services.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Evidence**             | External read+write for project, task, document, goal, plan, milestone, risk, edges, calendar. Scope: read-only default (`DEFAULT_SCOPE_MODE='read_only'`), op-level + project/access gates. Audit in **three** places: `agent_call_tool_executions`, `onto_project_logs` (`change_source:'agent_call'`, `external_agent_caller_id`), `security_events`. Threat model written: `buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md` (per-grant `allowed_project_ids` scoping, ChatGPT profile hard read-only). Staged mutations / change-sets: `commitChangeSet()` in `packages/shared-agent-ops/src/gateway/change-set.ts` (per-change approve/reject, freshness/drift, atomic commit). |
| **Gaps**                 | External MCP writes **apply directly** — no human-review/receipt-approval step for outside writes (staging exists only on the worker Agent-Run path, not wired to the external connector; `dry_run` is self-service). Decisions/insights/signals are **not readable or writable** by agents at all. Owner-facing "an outside agent changed this" surfacing lands in `/today` receipts but has no dedicated review/notify path for medium/high-risk external writes (thinking-loop doc, External Agent UX).                                                                                                                                                                                 |
| **Metrics**              | Agent write attempts by scope/risk; direct-apply vs reviewed; receipt-surfaced latency; rollback/correction rate; agents-per-project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Risk**                 | Agent writes create security/permission risk (§6) — mitigated but residual (lethal trifecta legs A+B present).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Best next experiment** | Add a risk-tiered review threshold for external writes (low-risk direct + receipt; medium/high → inbox item), reusing the existing change-set machinery. This closes the one clear trust gap in an otherwise strong component.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### 4.6 Cognitive Forcing — WEAK IN PROD (built, mostly dark)

| Field                      | Assessment                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definition**             | Surface assumptions, contradictions, risks, stale decisions, and next moves.                                                                                                                                                                                                                                                                |
| **Feeling**                | "It challenges me the way a sharp collaborator would."                                                                                                                                                                                                                                                                                      |
| **Objects / systems**      | Daily brief (`ontologyBriefDataLoader.ts`, `ontologyBriefGenerator.ts`, `ontologyPrompts.ts`); Project Reviews (legacy code: `project-loop/generators.ts`, `projectLoopWorker.ts`) → AI Inbox.                                                                                                                                              |
| **Evidence (shipped)**     | Daily brief reads `onto_risks`, computes stale-in-progress (>7d), blocked tasks, goals-at-risk, and prompts for cross-project patterns ("3 projects waiting on the same blocker"). Prompt says "if the existing next step is stale, replace it."                                                                                            |
| **Evidence (built, dark)** | Project Review passes generate `open_decisions`, `stale_assumptions`, `contradictions_or_drift`, drift, task-conflicts (`duplicate`/`contradiction`/`blocked_by`), outdated docs, and respect prior decisions — surfaced via AI Inbox. **Flag-gated OFF in prod** (`config/project-loops.ts`, `config/projectLoops.ts`).                    |
| **Gaps**                   | The brief never reads `onto_decisions`; **no code detects a stale decision or a contradiction between new input and a prior decision** (the primitive is unbuilt). The loop's heuristic `open_decisions` = top-3 task titles; `contradictions_or_drift` heuristic = empty. The one shipped cognitive surface (brief) barely reaches anyone. |
| **Metrics**                | Suggestions generated/accepted/dismissed; repeat-blocker detection; brief acted-on-within-24h; "did it tell you something you didn't already know?"                                                                                                                                                                                         |
| **Risk**                   | Noisy/false cognitive prompts destroy trust faster than they build it. Validate quality before broad enablement.                                                                                                                                                                                                                            |
| **Best next experiment**   | Turn on Project Reviews for a tiny cohort (DJ + a few power users) with the AI-Inbox review rail and measure _clarity delivered_ (accept rate, "useful?" rating), not run completion — the gate the thinking-loop plan already names.                                                                                                       |

### 4.7 Public Artifacts — MEDIUM (distribution loop, not compounding loop)

| Field                    | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Definition**           | Creator project pages that become proof, distribution, and templates.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Feeling**              | "I can share this and get feedback / show my work."                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Objects / systems**    | `public-page.service.ts`; `onto_public_pages`, `onto_public_page_views`, `onto_public_page_slug_history`, `onto_comments`; route `(public)/p/[slug]/`.                                                                                                                                                                                                                                                                                                                                                                          |
| **Evidence**             | Live (not flag-gated). Publishes a **single document** snapshot + optional content-reviewed live-sync; exposes content, title, summary, project name, author, view count, citations. Views tracked (crawler-filtered, DNT-respecting, 24h dedup). Threaded comments for authenticated users on listed-public docs. Separate `/api/public/projects` exposes whole example projects for the homepage picker. Distribution thesis: `buildos-strat.md` (public pages as crawlable/shareable/cloneable "made with BuildOS" surface). |
| **Gaps**                 | A public page is **document-scoped, not a whole project** — it is not yet the "public project page" the moat imagines. **Public feedback never returns to project memory** (no comment→task/risk bridge). No "clone this as a template" mechanic. Anonymous readers cannot comment.                                                                                                                                                                                                                                             |
| **Metrics**              | Pages published; views; comments; comments converted to project work; clones/templates spawned.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Risk**                 | Moderation / privacy / quality burden; low willingness-to-pay in the creator wedge (§6).                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Best next experiment** | Route a public comment back to the owner as an inbox item convertible to task/risk/doc-note — the smallest change that turns the distribution loop into a thinking loop. (Lower priority than 4.1/4.6; the thinking-loop plan places this at Phase 6.)                                                                                                                                                                                                                                                                          |

**Audit scorecard (strongest → weakest on shipped evidence):**

1. Agent Gateway — **strong** (shipped, audited, threat-modeled; one review-gap).
2. Persistent Project State — **strong** (real graph; decisions dormant).
3. Restart Clarity — **strong** (`/today` newly shipped; brief degraded).
4. Context Compounding — **medium-strong** (substrate strong; unmeasured).
5. Structured Messy Input — **medium** (chat path works; raw brain dump metadata-only).
6. Public Artifacts — **medium** (live but doc-scoped, no feedback loop).
7. Cognitive Forcing — **weak in prod** (built but flag-off; decisions unbuilt).

---

## 5. Queries ChatGPT Cannot Recreate From One Prompt

For each: what historical state, structure, and trust it requires, what UI surface should make it visible, and — critically — **whether BuildOS can answer it today.**

| Query                                                            | Requires                                        | Surface                                         | Answerable today?                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| "What changed since I last worked on this?"                      | Change ledger + last-visit anchor               | `/today` receipts                               | **Yes** — shipped (`what-changed.service.ts`). The single best proof of the moat.                                       |
| "What did my agent do while I was away?"                         | Actor-attributed agent writes in the ledger     | `/today` receipts (external-caller attribution) | **Yes** — shipped; receipts attribute Agent chat / Agent run / external caller.                                         |
| "Which open loops are blocking the project?"                     | Blocked-task state + dependency edges           | Daily brief; project page                       | **Partial** — brief surfaces blocked tasks + "waiting on same blocker"; reach is near-zero.                             |
| "What should I do next if I only have 20 minutes?"               | Ranked next-move over current state             | Brief `nextStep`; `/today`                      | **Partial** — next-step exists; no explicit time-boxed ranking.                                                         |
| "Which decisions are now stale?"                                 | `onto_decisions` records + staleness logic      | (none)                                          | **No** — `onto_decisions` dormant; decisions are prose in docs; no staleness code.                                      |
| "What does this new idea contradict?"                            | Prior decisions + contradiction detection       | Project Reviews → AI Inbox                      | **No** — contradiction detection is built in review passes but flag-off, and it reasons over tasks/docs, not decisions. |
| "Which task matters because of a decision from three weeks ago?" | Decision entities + edges linking decision→task | Project graph                                   | **No** — needs decisions-as-entities + relationship surfacing; both unbuilt/underused.                                  |
| "What public artifact can I share for feedback?"                 | Publishable doc + public page                   | `/p/[slug]`                                     | **Yes (doc-scoped)** — but it's a document, not a project, and feedback doesn't return.                                 |

**The tell:** the queries BuildOS answers today are the **operational / ledger** queries (what changed, what did the agent do, what's blocked). The queries it _cannot_ answer are exactly the **decision-centric** ones the pitch leans on hardest ("which decisions are stale," "what does this contradict," "which task matters because of a 3-week-old decision"). Those three queries are the clearest "ChatGPT can't do this" demos, and BuildOS can't do them either yet. **Building `onto_decisions` end-to-end converts three of the strongest moat demos from aspirational to real.**

---

## 6. Metrics For Proving Context Compounding

The moat is a claim about a _derivative_: value rises with accumulated state. To prove it, instrument the accumulation and the return, not just usage. Reuse the loop-telemetry envelope from the thinking-loop synthesis (IDs/counts/stage transitions only — no content).

**Accumulation (is the graph growing?)**

- Entities per project over time; entity-type diversity per project; relationship (edge) density.
- Change-ledger depth per project (log rows / week); % projects with a mutation in the last 7/30 days.
- Capture→structure conversion by source (brain dump vs chat vs agent vs calendar).

**Return (does accumulation pull users back?)**

- 7-day and 30-day return rate; return-after-≥7-inactive-days.
- Time-to-restart (session start → first meaningful action).
- `/today` receipt-section views; brief acted-on-within-24h.

**Compounding proof (does value rise with age/size?)**

- The key metric: **restart time and "did you know what to do next?" self-rating as a function of project age and graph size.** If day-30 projects restart faster / rate clearer than day-7 projects, context is compounding. If not, it isn't — it's just accumulating.
- Agents-per-project and external-agent reads/writes tied to owner-visible receipts (day-90 proof).
- "Compounding project" definition: a project with ≥N mutations across ≥M sessions spanning ≥T days that the user returned to after inactivity. Track the count and the cohort curve.

**Instrumentation reality:** `/today` currently emits **zero** analytics; the daily brief has **zero** per-stage readout (both audits confirm). PostHog is wired app-wide (`PUBLIC_POSTHOG_KEY`, no-ops without a key). **Nothing above is measurable today.** First move is not a new metric — it is instrumenting `/today` and the brief.

---

## 7. Product Gaps And Next Experiments

Ranked by moat leverage (how much each closes the day-30 gap), cross-referenced to the thinking-loop plan-of-attack phases.

1. **Ship `onto_decisions` end-to-end** — create from chat/agent-run, a Decisions tab on the project page, a Decisions section in the brief, and edges linking decisions→tasks. **Highest leverage:** it is the primitive the pitch names most, is built least, and unlocks three of the strongest "ChatGPT can't do this" queries. (New work; supports Phase 7.)
2. **Instrument the loop on `/today` and the brief** — the loop-telemetry envelope. Without it, compounding is unprovable and every other bet is blind. (Plan Phase 0; tasker/25 item 3.)
3. **Enable Project Reviews for a tiny cohort with the AI-Inbox review rail** — measure _clarity delivered_, not run completion. This is the fastest way to turn the dark cognitive-forcing engine into evidence. (Plan Phase 4.)
4. **Fix the daily brief as a restart/decide surface** — app-open ensure-trigger, shorter/project-linked body, and a decide/update path (done / still open / not relevant / update / chat). Currently a 39KB wall reaching one user. (Plan Phase 3; brief audit.)
5. **Add risk-tiered review for external agent writes** — low-risk direct + receipt; medium/high → inbox item, reusing change-set machinery. Closes the one trust gap in the strongest component. (Plan Phase 6.)
6. **Resolve the raw brain-dump object model** — route raw brain dumps through the real structuring pipeline (or explicitly park them), so the product's core verb matches its core noun. (Plan Phase 5.)
7. **Make `/today` the default landing + receipt→entity click-through** — cheap, compounds restart clarity, once instrumented. (tasker/25 polish.)
8. **Turn public pages into a feedback loop** — comment→owner inbox→convert to task/risk. Lower priority; converts distribution into thinking. (Plan Phase 6.)

**Sequencing note:** items 1–4 are the moat-defining work; 5–8 are hardening. Activation (getting to day 1 at all) is covered by tasker/22 and is the true upstream constraint — a compounding moat is worth nothing if users never reach day 7. This doc assumes tasker/22's activation fixes land in parallel.

---

## 8. Moat Risks (Pressure-Test)

For each risk: **avoid / accept / mitigate / turn into a differentiator.**

| Risk                                                           | Stance                                      | Reasoning                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontier labs make project memory a default feature            | **Mitigate + differentiate**                | Labs will win raw memory. They **cannot** be the neutral, user-owned, cross-provider surface — OpenAI won't read Anthropic's state and vice versa (`TP17`, the "where does context live" argument). Lean the moat into _structure + ownership + audit + gateway_, not memory. This risk is the reason the moat must be narrow. |
| Users don't maintain enough context to compound                | **Mitigate**                                | The single biggest real threat. Counter with restart clarity (`/today`), a low-friction return ritual (brief that asks "what changed?"), and capture that doesn't dead-end. Activation (tasker/22) is upstream of this.                                                                                                        |
| Captured data becomes noisy and lowers trust                   | **Mitigate**                                | Receipts + review rails + dismissal memory keep the graph inspectable and correctable. Do not surface cognitive prompts (loops) broadly until quality is validated — a false "stale decision" is worse than none.                                                                                                              |
| Product stores context but fails to surface it                 | **Mitigate (in progress)**                  | This was the central thinking-loop finding; `/today` directly attacks it. The remaining offenders are decisions (stored as prose, unsurfaced) and loops (built, dark).                                                                                                                                                         |
| Users export the project to another tool                       | **Accept + differentiate**                  | Portability is on-brand (user-owned data). The moat isn't lock-in; it's that the _live, multi-actor, audited_ surface is more valuable than any static export. Make export a feature, not a fear.                                                                                                                              |
| Agent writes create security / permission risk                 | **Mitigate**                                | Already strong: read-only default, per-grant project scoping, three-place audit, lethal-trifecta threat model. Residual: direct external writes need risk-tiered review (§7 item 5).                                                                                                                                           |
| Public artifacts create moderation / privacy / quality burden  | **Mitigate**                                | Content-policy review already gates public live-sync; unlisted-by-default and auth-gated comments limit blast radius. Keep public surface deliberately small until the feedback loop earns expansion.                                                                                                                          |
| Creator wedge has low willingness-to-pay vs AI-heavy operators | **Accept (wedge) + differentiate (thesis)** | The creator wedge is distribution, not the whole TAM (`how-to-explain` VC section: consumer wedge → infrastructure pull-through). The agent-gateway thesis is where willingness-to-pay concentrates. Don't over-index the moat on creator monetization; index it on being the context surface.                                 |

**The one risk that is existential and internal:** _store-but-don't-surface, applied to decisions and cognitive forcing._ If the day-30 experience never demonstrably notices drift or stale decisions, the moat stays a slide, not a product. Everything in §7 items 1–3 exists to retire this risk.

---

## Decisions DJ Needs To Make

1. **Is "decisions as a first-class entity" worth building now?** It is the highest-leverage moat unlock (converts 3 marquee "ChatGPT can't do this" demos to real) but it is net-new surface. Yes/no drives whether the day-30 story becomes demonstrable this quarter or stays aspirational.
2. **Turn on Project Reviews for a small cohort, or keep them dark until more polish?** The cognitive-forcing engine already exists. The question is whether to gather real quality signal now (small cohort + AI Inbox review + clarity metric) or wait. Nothing improves it while it is dark.
3. **Which surface owns restart clarity — `/today`, the brief, or both?** `/today` is winning; the brief is degraded and expensive. Decide whether to fix the brief as a restart/decide surface (Plan Phase 3) or demote it to a notification and let `/today` own restart. This also gates flipping the `/` redirect to `/today`.
4. **Do external agent writes get a review gate, or stay direct-commit?** Direct writes maximize the "tell your agent to update BuildOS" fluidity but leave the one trust gap in the gateway. Pick the risk-tier threshold (which ops apply directly + receipt vs require review).
5. **Are raw `onto_braindumps` first-class structuring inputs or a parked archive?** This resolves the "brain dump" noun-vs-verb mismatch and decides whether the marketing's core verb is served by its namesake surface.
6. **Instrument before or alongside building?** The plan says instrument first (Phase 0). Confirm that `/today` + brief telemetry ships before or with the next moat build, so compounding stops being an unprovable claim.
7. **How far to invest in public artifacts now?** Document-scoped pages are live; the "public project page + feedback loop + templates" vision is Phase 6. Decide whether the creator-distribution value justifies pulling it forward, given the moat's core is the private compounding surface, not the public one.

---

## Sources Reviewed

Positioning: `docs/marketing/START_HERE.md`, `docs/marketing/brand/brand-guide-1-pager.md`, `docs/marketing/strategy/how-to-explain-buildos-2026-05-11.md`, `docs/marketing/strategy/thinking-environment-creator-strategy.md`, `buildos-strat.md`.

Product / architecture: `docs/product/thinking-loop-*` (both), `apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md`, `tasker/25-today-view-dashboard-v2-handoff.md`, `apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md`, `apps/worker/docs/features/daily-briefs/DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md`, `docs/specs/buildos-mcp-lethal-trifecta-self-audit-2026-06-28.md`.

Code (verified): `packages/shared-types/src/database.schema.ts` (ontology tables), `packages/shared-types/src/agent-call.types.ts` (`BUILDOS_AGENT_READ_OPS`/`WRITE_OPS`, `OPENCLAW_DEFAULT_WRITE_OPS`), `packages/shared-agent-ops/src/ontology/onto.ts` + `edge-direction.ts` (entity-kind vocabulary — no `decision`), `packages/shared-agent-ops/src/gateway/op-execution-gateway.core-entities.ts` + `write-audit.service.ts` + `agent-call-project-activity.service.ts` + `change-set.ts` + `policy.ts`, `apps/web/src/lib/server/what-changed.service.ts` + `project-logs-enrich.ts`, `apps/web/src/lib/config/project-loops.ts` + `apps/worker/src/config/projectLoops.ts`, `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` + `ontologyBriefGenerator.ts` + `ontologyPrompts.ts`, `apps/worker/src/workers/project-loop/generators.ts` + `projectLoopWorker.ts`, `apps/worker/src/workers/braindump/braindumpProcessor.ts`, `apps/worker/src/workers/chat/startHereCaptureProcessor.ts`, `apps/web/src/lib/server/public-page.service.ts`, `apps/web/src/routes/(public)/p/[slug]/`, `apps/web/src/lib/components/project/v2/EntityTabStrip.svelte`, `apps/web/src/lib/components/layout/Navigation.svelte`.
