<!-- docs/specs/buildos-domain-work-capability-architecture-2026-05-18.md -->

# BuildOS Domain + Work Capability Architecture

Status: Phase 1 infrastructure implemented; Phase 2 research flow pending
Date: 2026-05-18; updated 2026-05-19
Owner: BuildOS agentic chat

## Purpose

BuildOS needs a scalable context-engineering layer for Agentic Chat. The system should stop preloading every skill into every prompt and move toward progressive discovery:

```txt
base BuildOS kernel
  -> runtime capability index
  -> compact domain index
  -> active domain signals when relevant
  -> candidate work capability cards
  -> selected skill summaries
  -> full skill / micro-skill / resource only when needed
  -> concrete tools
```

The goal is not to make domains the new prompt dump. The goal is to give the agent enough structure to decide what specialized context to load, when to load it, and when to keep working from the general BuildOS context.

## Implementation Status (2026-05-19)

Phase 1 is now operational for routing, progressive discovery, demand capture, and admin queue management. This does not mean domains are fully researched or broadly populated yet. It means BuildOS has the infrastructure needed to start using domains safely and to queue missing coverage.

2026-06-22 clarification: active domain signals are consumed by the prompt and admin/research-queue surfaces. The remaining decision is route strength: keep domain/work-capability routing advisory and admin-visible, or make it product-critical by nudging skill/tool selection more forcefully. Do not change the route strength without measuring domain signal frequency, prompt-injected domain usage, backlog promotion, downstream skill/tool usage by domain, and TTFR/prompt-token deltas for domain-active turns.

Implemented:

- File-backed `Domain` catalog with `domain_search` and `domain_load`.
- File-backed `WorkCapability` registry with `work_capability_search` and `work_capability_load`.
- Gateway definitions, execution handlers, exact-id behavior, and tool-payload compaction for domain and work-capability tools.
- Compact domain index in the lite prompt, while keeping existing root/child skill prompt metadata as the fallback surface.
- Deterministic domain sensing, candidate work-capability sensing, and per-session `fastchat_domain_state` persistence.
- Domain demand analytics and research backlog candidate extraction.
- First-class `domain_research_queue` schema with list-page indexes, RLS policies, queue keys, provenance fields, budget/result fields, and review statuses.
- Admin Domains page and APIs for queue listing, candidate promotion, prioritization, claiming, status changes, and result/review metadata.

Current seeded coverage:

- Domains: `marketing`, `marketing.content_strategy`, `marketing.short_form_video`, `marketing.youtube_growth`, `marketing.linkedin_company_page_growth`, `sales_and_growth`, `sales_and_growth.cold_email`, `product_and_design`, `product_and_design.ui_ux_quality`, `product_and_design.design_systems`, `product_and_design.usability_research`, `creator_growth`, `writing`.
- Work capabilities: `cold_email_campaign_build`, `cold_email_sender_readiness`, `youtube_growth_strategy_plan`, `youtube_video_improvement`, `linkedin_company_page_growth_plan`, `ui_ux_screen_review`, `design_system_architecture_review`, `short_form_video_asset_improvement`, `content_strategy_plan`, `project_audit`.

Still pending:

- Automated bounded research worker for queued domain, work-capability, skill, micro-skill, and resource gaps.
- Draft artifact model for proposed domain/work-capability/skill/resource updates.
- Human approval flow that promotes reviewed research drafts into runtime catalogs.
- Routing evals and latency/token telemetry before removing always-on root/child skill metadata.
- Broader 10-20 domain seed map beyond the current hand-authored catalog. See `docs/specs/buildos-domain-candidate-map-2026-05-19.md`.

## Working Thesis

The current architecture has been using "capability" in two different ways:

1. Product/runtime capability: what BuildOS can operate on or execute.
2. Domain outcome capability: what the user is trying to accomplish in a subject area.

Those should be separated.

This spec uses:

```txt
BuildOSCapability
  stable product/runtime capability: planning, documents, calendar, web research

Domain
  subject territory: marketing.youtube_growth, sales_and_growth.cold_email

WorkCapability
  outcome card: youtube_growth_strategy_plan, cold_email_campaign_build

Skill
  reusable workflow playbook or method

MicroSkill
  narrower skill module for a sub-workflow, lens, or failure mode

Resource
  optional evidence, template, benchmark, source map, transcript, or Libri handle

Tool / Op
  concrete callable execution surface
```

The key model is:

```txt
Domain -> WorkCapabilities -> Skill Stack
BuildOSCapability -> Tools
WorkCapability bridges Domain, BuildOSCapability, Skills, Resources, and Tools
```

The product abstraction should feel like:

```txt
Base BuildOS operating system
  always available for projects, tasks, documents, plans, calendar, context, and safe writes

Specialized domain packs
  visible as compact menus
  loaded only when the conversation enters a domain
```

Implementation rule:

```txt
Always load the domain index.
Do not always load domain contents.
```

The model should know that BuildOS has specialized coverage in 10-20 named domains. It should not receive every domain card, work capability card, skill summary, child skill, resource, or source map up front.

## Why This Exists

Agentic Chat currently preloads compact skill metadata because the skill catalog is small. That does not scale.

As BuildOS grows specialized skills for cold outreach, UI/UX, YouTube growth, LinkedIn growth, writing craft, research, and other domains, the prompt must shift from "all skill metadata always on" to "indexes first, playbooks later."

The new system should:

- Keep general BuildOS project chat fast and lightweight.
- Load specialized domain context only when it changes the answer, workflow, tools, or quality bar.
- Make skills reusable graph nodes, not tree leaves owned by one domain.
- Let repeated coverage gaps become product and research signal.
- Keep Libri optional and bounded through resource handles.

## Concept Boundaries

### BuildOS Capability

A BuildOS capability is a product/runtime ability. It describes what the system can operate on.

Examples:

```txt
overview
project_creation
project_graph
planning
documents
calendar
people_context
project_audit
project_forecast
web_research
buildos_reference
schema_reference
```

BuildOS capabilities are stable and mostly tool-facing. They map to direct operations, context surfaces, and system-native project behavior.

Current implementation:

- `apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts`

### Domain

A domain is a subject world. It describes vocabulary, boundaries, coverage, related domains, gaps, and candidate work capabilities.

Examples:

```txt
marketing
marketing.youtube_growth
marketing.linkedin_company_page_growth
sales_and_growth.cold_email
product_and_design.ui_ux_quality
writing
```

Domains are routing maps, not prompt payloads. Loading a domain should not automatically load every skill inside it.

Current implementation:

- `apps/web/src/lib/services/agentic-chat/tools/domains/catalog.ts`
- `apps/web/src/lib/services/agentic-chat/tools/domains/types.ts`
- `domain_search`
- `domain_load`
- per-session `fastchat_domain_state`

### Work Capability

A work capability is an outcome the user wants to accomplish. This is the missing middle layer between a domain and skills.

Examples:

```txt
cold_email_campaign_build
cold_email_sender_readiness
youtube_growth_strategy_plan
youtube_video_improvement
short_form_video_asset_improvement
linkedin_company_page_growth_plan
ui_ux_screen_review
design_system_architecture_review
creator_growth_strategy
```

This object is close to the current `DomainSkillStack`, but it should become more explicit and first-class.

A work capability answers:

```txt
What kind of work is the user trying to get done?
Which domain standards apply?
Which BuildOS runtime abilities are relevant?
Which skill stack should be considered?
Which outputs should be produced?
What does good look like?
```

### Skill

A skill is a reusable workflow playbook or method.

Examples:

```txt
content_strategy_beyond_blogging
algorithm_aware_publishing
viral_video_script_structure
cold_email_engagement_first_outreach
cold_email_research_anchors
build_quality_ui_ux
visual_craft_fundamentals
accessibility_inclusive_ui_review
project_audit
document_workspace
```

Skills are graph nodes. A skill can be referenced by many work capabilities across many domains.

Current implementation:

- registered `SkillDefinition`
- `skill_search`
- `skill_load`
- `skill_reference_load`
- root and child skill registries

### MicroSkill

A micro-skill is a registered skill with a parent skill, depth, and narrow use case. It is loaded only when the root skill or user intent makes the narrow lens necessary.

Examples:

```txt
cold_email_offer_lab
cold_email_reply_os
information_architecture_review
usability_quick_research
task_state_updates
```

Current implementation already models these as normal skills with `parentId`.

### Resource

A resource is supporting context. It is not a skill and should not be loaded by default.

Examples:

```txt
source map
provider requirement matrix
signal scoring rubric
growth playbook
template
example
benchmark note
Libri book/person/video/transcript handle
```

Resources should be searchable/loadable only through declared handles. `resource_load` must not become arbitrary file browsing.

Current implementation:

- `apps/web/src/lib/services/agentic-chat/tools/resources/resource-registry.ts`
- `resource_search`
- `resource_load`

### Tool / Op

A tool or op is the concrete execution surface.

Examples:

```txt
get_workspace_overview
get_project_overview
create_onto_document
update_onto_task
search_project
tool_schema
libri_search_capabilities
```

Tools should be selected by BuildOS runtime capability, current context, loaded skill related ops, or explicit schema discovery.

## Always-On BuildOS Kernel

The always-on prompt should not be a skill catalog. It should be a small kernel that teaches the agent how to operate inside BuildOS.

Always-on kernel:

```txt
identity and mission
loaded-context-first rule
entity resolution order
context zooming rules
write safety and confirmation rules
tool discipline
response contract
current tool surface summary
previously loaded skill ledger
```

Always-on compact domain index:

```txt
specialized domains BuildOS can route into
one-line domain summaries
one-line coverage hints
no skill lists beyond optional top-level handles
no resources
no full domain cards
```

Example domain index:

```txt
- sales_and_growth.cold_email: cold outreach, campaign building, sender readiness, replies.
- marketing.youtube_growth: YouTube strategy, content cadence, scripts; partial analytics coverage.
- marketing.linkedin_company_page_growth: Company Page growth, content, employee advocacy, measurement.
- product_and_design.ui_ux_quality: UI reviews, IA, visual craft, accessibility, usability.
- writing: essays, articles, nonfiction narrative, content structure.
```

Budget:

```txt
10-20 domains
roughly 300-700 tokens total
stable enough to cache with the base prompt
```

Not always-on:

```txt
cold email playbooks
UI/UX review playbooks
YouTube growth strategy
LinkedIn Page growth
creator growth
writing craft
specialized research methods
large source maps
examples and templates
```

## Progressive Discovery Flow

### Current Problem

The prompt currently preloads all root and child skill summaries. That is workable with a small catalog, but it will degrade as the skill system grows.

The next architecture should not replace that with all domain contents. The always-on layer is:

```txt
BuildOS kernel
BuildOS runtime capability index
compact specialized domain index
current direct tool surface
```

Everything deeper is progressively disclosed.

### Target Flow

```txt
1. Start with base BuildOS kernel.
2. Load current project/session context.
3. Expose compact BuildOS capability index.
4. Expose compact specialized domain index.
5. Sense domains from latest message, conversation summary, and prior domain state.
6. If no specialized domain is active, proceed from normal BuildOS context.
7. If a domain is active, expose compact domain signals.
8. Route to one or more candidate WorkCapabilities.
9. Expose only those WorkCapability cards.
10. Load selected skill summary or full skill only when the task needs workflow guidance.
11. Load micro-skills or resources only when the selected skill/work capability points there and the turn needs depth.
12. Expose or discover concrete tools as needed.
13. Persist observed domains, loaded capabilities, loaded skills, resource loads, and gaps.
```

This keeps the system from replacing "preload every skill" with "preload every domain."

### End-to-End Chat Flow

```txt
USER CHAT MESSAGE
  |
  v
BuildOS Kernel + Loaded Context
  |
  |  always present:
  |    - BuildOS operating rules
  |    - BuildOS runtime capability index
  |    - compact specialized domain index
  |    - current direct tool surface
  v
Local Domain Sensing
  |
  +-- no specialized domain active
  |     |
  |     v
  |   Normal BuildOS flow
  |     - answer from loaded context
  |     - use direct tools when needed
  |     - no domain skill load
  |
  +-- specialized domain active
        |
        v
      Active Domain State
        - domain ids
        - coverage status
        - candidate work capability ids
        - known gaps
        |
        v
      WorkCapability Routing
        |
        v
      Candidate WorkCapability Card(s)
        - outcome being attempted
        - relevant BuildOS capabilities
        - candidate skill ids
        - resource handles
        - output contract
        - quality criteria
        |
        +-- skill needed
        |     |
        |     v
        |   skill_search / skill_load
        |     |
        |     v
        |   root skill first, micro-skill only when needed
        |
        +-- source depth needed
        |     |
        |     v
        |   resource_search / resource_load
        |     |
        |     v
        |   bounded BuildOS or Libri resource handle
        |
        +-- concrete action needed
              |
              v
            direct tool / tool_search / tool_schema
              |
              v
            execute, answer, or ask for confirmation
              |
              v
            telemetry + session state + research backlog
```

The domain layer orients the chat. The work capability layer chooses the outcome lane. Skills provide workflow depth. Resources provide supporting evidence. Tools execute.

### TTFB Constraint

The domain/work-capability layer must not add a pre-answer model call.

Allowed before first OpenRouter response:

```txt
local deterministic domain sensing
local deterministic work capability candidate selection
compact prompt additions
```

Not allowed before first OpenRouter response:

```txt
LLM router call
LLM domain classifier call
LLM work-capability classifier call
automatic full skill load
automatic resource load
```

Target first-response overhead:

```txt
routine BuildOS turn: ~0 added model latency
domain-active turn: compact prompt overhead only
deep workflow: pay skill/resource load latency after the first model decision
```

## Object Model

### BuildOSCapability

Current `CapabilityDefinition` can remain, but should be treated as runtime/product capability.

```ts
type BuildOSCapability = {
	id: string;
	path: `capabilities.${string}`;
	name: string;
	status: 'available' | 'planned';
	summary: string;
	whatYouCanDo: string[];
	directPaths: string[];
	nativeSkillIds?: string[];
	notes?: string[];
};
```

Rules:

- Keep this list compact and stable.
- Use it for product-level routing and tool discovery.
- Do not make specialized subject outcomes live here unless they are truly BuildOS-native runtime modes.
- Do not link domain-specialized skills from BuildOSCapability. Use WorkCapability for those.
- `nativeSkillIds` is only for BuildOS-operational skills such as `project_creation`, `task_management`, or `document_workspace`.

### Domain

The current `DomainDefinition` is mostly right, but `recommendedSkillStacks` should be replaced or supplemented by `workCapabilityIds`.

```ts
type DomainDefinition = {
	id: string;
	name: string;
	parentIds: string[];
	aliases: string[];
	summary: string;
	boundaries: string[];
	coverageStatus: DomainCoverageStatus;
	buildosCapabilityIds: string[];
	workCapabilityIds: string[];
	skills?: DomainSkillLink[];
	resources?: DomainResourceLink[];
	relatedDomainIds?: string[];
	gaps?: DomainCoverageGap[];
	notes?: string[];
};
```

Migration note:

- Keep `capabilityIds` temporarily as an alias for BuildOS capability ids.
- Keep `recommendedSkillStacks` temporarily as proto-work-capabilities.
- Add `workCapabilityIds` once `WorkCapability` is registered.

### WorkCapability

This should become the primary specialized routing card.

```ts
type WorkCapabilityCoverageStatus = 'none' | 'partial' | 'strong';

type WorkCapability = {
	id: string;
	name: string;
	summary: string;
	domainIds: string[];
	buildosCapabilityIds: string[];
	whenToUse: string[];
	exampleRequests: string[];
	defaultSkillId?: string;
	skillIds: string[];
	resourceIds?: string[];
	toolHints?: string[];
	outputs: string[];
	evaluationCriteria?: string[];
	coverageStatus: WorkCapabilityCoverageStatus;
	gaps?: DomainCoverageGap[];
	notes?: string[];
};
```

Rules:

- A work capability references skills. It does not own them.
- A work capability can span multiple domains.
- A work capability can reference multiple BuildOS runtime capabilities.
- It is an index card first, not a full playbook.
- Full playbook content still lives in skills.
- A work capability can hint at relevant tool families or ops, but it does not grant tool access or bypass normal tool selection.

### Skill

The current `SkillDefinition` can remain mostly intact.

```ts
type SkillDefinition = {
	id: string;
	name: string;
	summary: string;
	parentId?: string;
	depth?: number;
	sourceMarkdown?: string;
	relatedOps: string[];
	whenToUse: string[];
	workflow: string[];
	childSkills?: SkillLinkedResource[];
	referenceModules?: SkillLinkedResource[];
	guardrails?: string[];
	examples?: SkillExample[];
	notes?: string[];
};
```

Rules:

- Root skills should stay self-sufficient.
- Child skills should be registered as normal skills.
- Reference modules are not skills.
- Skills should not know every domain that might use them; that relationship belongs in WorkCapability and Domain registries.

### Resource

The current resource registry should be expanded toward the spec shape.

```ts
type ResourceKind =
	| 'domain_resource'
	| 'skill_reference'
	| 'libri_book'
	| 'libri_person'
	| 'libri_video'
	| 'libri_transcript'
	| 'libri_source_map'
	| 'template'
	| 'example'
	| 'scorecard'
	| 'benchmark';

type ResourceDefinition = {
	id: string;
	kind: ResourceKind;
	title?: string;
	summary: string;
	whenToLoad: string[];
	domainIds: string[];
	workCapabilityIds?: string[];
	skillIds: string[];
	source: 'buildos' | 'libri';
	loadPolicy: 'manual' | 'domain_referenced' | 'work_capability_referenced' | 'skill_referenced';
	localPath?: string;
	libriResourceKey?: string;
	visibility?: 'public' | 'internal';
};
```

Rules:

- Resources are search/load targets, not prompt defaults.
- Libri resources are handles, not routing authority.
- Every external load must be explicit and bounded.

## Routing Semantics

### Domain Sensing

Domain sensing answers:

```txt
What subject world might this conversation be in?
```

Inputs:

```txt
latest user message
conversation summary
prior session domain state
loaded project context maybe later
```

Outputs:

```txt
candidate domains
coverage status
candidate work capability ids
candidate root skill ids
known gaps
```

Domain sensing should be conservative. If the user is doing routine project work, it should return null.

### Work Capability Routing

Work capability routing answers:

```txt
What outcome is the user trying to accomplish?
```

Inputs:

```txt
user intent
active domains
BuildOS context type
available BuildOS capabilities
prior loaded skills
```

Outputs:

```txt
candidate work capability cards
default skill id
candidate skill ids
resource handles
output contract
quality criteria
coverage gaps
```

### Skill Loading

Skill loading answers:

```txt
What workflow guidance do I need before acting?
```

Rules:

- Prefer root skill first.
- Load full skill only when the task is multi-step, stateful, high-risk, or easy to get wrong.
- Do not load a child skill automatically after loading a root skill.
- Do not reload a skill already present in the loaded skill ledger unless the current turn needs full markdown/examples.

### Resource Loading

Resource loading answers:

```txt
What source detail, examples, templates, or provenance do I need?
```

Rules:

- Search or load resources only after a domain, work capability, or skill exposed declared handles.
- Do not use resource loading for arbitrary browsing.
- Do not load references when a normal answer is enough.

### Tool Discovery

Tool discovery answers:

```txt
Which concrete operation should I call?
```

Rules:

- Use direct tools first when available.
- Use loaded BuildOS capability and skill `relatedOps` to avoid unnecessary tool search.
- Use `tool_search` only when the exact operation is unknown.
- Use `tool_schema` before first-time or uncertain writes.

## Prompt Strategy

### Current Prompt Shape

The current lite prompt includes:

- capabilities
- root skill table
- child skill table
- active domain signals
- current tool surface
- operating strategy
- loaded context

This should evolve toward:

```txt
Identity and Mission
BuildOS Kernel
BuildOS Capability Index
Current Tool Surface
Compact Domain Index
Active Domain Signals
Candidate Work Capabilities
Previously Loaded Skills
Loaded Context
Operating Rules
```

The prompt should no longer include the full root and child skill catalog once `skill_search` and `work_capability_search` are reliable.

### Prompt Load Levels

Use four levels:

```txt
Level 0: BuildOS kernel + stable indexes
  always on:
    - operating rules
    - BuildOS capability index
    - compact domain index
    - current direct tool surface

Level 1: active routing signals
  active domain signals, candidate work capability summaries, previously loaded skill ledger

Level 2: selected cards
  one domain card, one work capability card, selected skill summaries

Level 3: full payload
  full skill markdown, reference module, resource content, source map
```

Only Level 0 should be guaranteed in every chat. Level 1 appears when deterministic routing sees a relevant domain/work capability or prior session state. Levels 2 and 3 are explicit progressive-discovery loads.

## Gateway Tool Surface

Current gateway tools:

```txt
domain_search
domain_load
skill_search
resource_search
resource_load
skill_load
skill_reference_load
tool_search
tool_schema
libri_overview
libri_search_capabilities
libri_get_capability_schema
```

Implemented additions:

```txt
work_capability_search
work_capability_load
```

`work_capability_search`:

```ts
type WorkCapabilitySearchArgs = {
	query?: string;
	domain?: string;
	buildosCapability?: string;
	limit?: number;
};
```

Returns:

```ts
type WorkCapabilitySearchPayload = {
	type: 'work_capability_search_results';
	query: string | null;
	filters: {
		domain: string | null;
		buildos_capability: string | null;
	};
	total_matches: number;
	matches: Array<{
		work_capability_id: string;
		name: string;
		confidence: number;
		summary: string;
		domain_ids: string[];
		buildos_capability_ids: string[];
		default_skill_id?: string;
		skill_ids: string[];
		coverage_status: WorkCapabilityCoverageStatus;
		load_hint: string;
	}>;
	materialized_tools: ['work_capability_load'];
	next_step: string;
};
```

`work_capability_load`:

```ts
type WorkCapabilityLoadArgs = {
	workCapability: string;
};
```

Returns one compact card:

```ts
type WorkCapabilityLoadPayload = {
	type: 'work_capability';
	id: string;
	name: string;
	summary: string;
	domain_ids: string[];
	buildos_capability_ids: string[];
	when_to_use: string[];
	example_requests: string[];
	default_skill_id?: string;
	skill_ids: string[];
	resource_ids: string[];
	tool_hints: string[];
	outputs: string[];
	evaluation_criteria: string[];
	coverage_status: WorkCapabilityCoverageStatus;
	gaps: Array<{
		missing_skill_id?: string;
		missing_resource_id?: string;
		user_need: string;
		summary: string;
	}>;
	materialized_tools?: Array<'skill_load' | 'resource_search'>;
	next_step: string;
};
```

Rules:

- `work_capability_load` may materialize `skill_load` and `resource_search`.
- It should not materialize broad direct tools such as write operations.
- Direct tool availability still comes from context surface profiles, loaded skill related ops, `tool_search`, and `tool_schema`.

## Session State

Current session state should be kept and extended.

Current:

```ts
type DomainSessionState = {
	version: 1;
	updated_at: string;
	active_domains: DomainSessionStateEntry[];
	coverage_gaps: DomainGapSessionEntry[];
	research_backlog: DomainResearchBacklogEntry[];
	recent_observations: DomainSessionObservation[];
};
```

Recommended v2 shape:

```ts
type DomainRuntimeState = {
	version: 2;
	updated_at: string;
	active_domains: DomainSessionStateEntry[];
	active_work_capabilities: WorkCapabilitySessionEntry[];
	loaded_skill_ids: string[];
	loaded_resource_ids: string[];
	coverage_gaps: DomainGapSessionEntry[];
	research_backlog: DomainResearchBacklogEntry[];
	recent_observations: DomainSessionObservation[];
};
```

Rules:

- Keep it compact and bounded.
- Store ids, summaries, timestamps, and counts, not raw user messages.
- Use it to continue ambiguous follow-up turns.
- Use it for admin demand analytics.

## Research Demand

Coverage gaps should become product signal.

Examples:

```txt
User repeatedly asks for YouTube analytics diagnostics.
  -> active domain: marketing.youtube_growth
  -> missing work capability: youtube_channel_diagnostics
  -> missing skill: youtube_channel_diagnostics
  -> queue research backlog

User repeatedly asks for creator growth strategy across platforms.
  -> active domain: creator_growth
  -> missing work capability: creator_growth_strategy
  -> queue research backlog
```

Research should remain asynchronous and bounded:

- no automatic runtime promotion
- no unbounded web/Libri recursion
- source budgets required
- review gate required
- provenance required

### BuildOS Research Queue

Session metadata can accumulate immediate backlog signals, but the real research workflow should use a first-class BuildOS queue table before any automated research begins.

```sql
create table domain_research_queue (
	id uuid primary key default gen_random_uuid(),
	queue_key text not null unique,
	kind text not null check (kind in ('domain', 'work_capability', 'skill', 'micro_skill', 'resource')),
	status text not null check (
		status in ('queued', 'researching', 'draft_ready', 'reviewing', 'approved', 'rejected', 'archived')
	),
	priority text not null check (priority in ('high', 'medium', 'low')),
	domain_ids text[] not null default '{}',
	work_capability_id text,
	parent_skill_id text,
	missing_skill_id text,
	missing_resource_id text,
	user_need text not null,
	summary text not null,
	evidence jsonb not null default '[]'::jsonb,
	source_session_ids uuid[] not null default '{}',
	source_user_count integer not null default 0,
	occurrences integer not null default 1,
	first_seen_at timestamptz not null default now(),
	last_seen_at timestamptz not null default now(),
	claimed_at timestamptz,
	claimed_by text,
	completed_at timestamptz,
	budget jsonb not null default '{}'::jsonb,
	result jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
```

Minimum research budget:

```ts
type DomainResearchBudget = {
	maxDepth: number;
	maxQueries: number;
	maxSourcesLoaded: number;
	maxTokensIn: number;
	maxTokensOut: number;
	maxWallClockMs: number;
	idempotencyKey: string;
};
```

Promotion rule:

```txt
session research_backlog
  -> admin/domain analytics aggregate repeated demand
  -> promote to domain_research_queue
  -> bounded worker drafts proposal
  -> human/admin review
  -> approved artifact becomes domain/work capability/skill/resource update
```

Do not run automated research directly from the chat turn. Chat turns create demand signals; queue workers do research later.

Implementation note:

- Schema: `supabase/migrations/20260519000000_add_domain_research_queue.sql`.
- List indexes: `supabase/migrations/20260519000001_add_domain_research_queue_list_indexes.sql`.
- Candidate extraction and promotion helpers: `apps/web/src/lib/services/agentic-chat/tools/domains/domain-research-queue.ts`.
- Admin queue APIs: `apps/web/src/routes/api/admin/chat/domains/research-queue/`.
- Admin surface: `apps/web/src/routes/admin/chat/domains/+page.svelte`.

The queue is implemented for admin-managed demand capture and review. The next step is the bounded worker plus draft-artifact promotion path.

## Implementation Fit Check

The current codebase already has the right extension points for this design:

```txt
Domain registry/search/load:
  apps/web/src/lib/services/agentic-chat/tools/domains/

Skill registry/search/load:
  apps/web/src/lib/services/agentic-chat/tools/skills/

Resource registry/search/load:
  apps/web/src/lib/services/agentic-chat/tools/resources/

BuildOS capability catalog:
  apps/web/src/lib/services/agentic-chat/tools/registry/capability-catalog.ts

Gateway tool definitions and materialization:
  apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts
  apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts

Gateway tool execution:
  apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts

Lite prompt assembly:
  apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts

Gateway payload compaction:
  apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts
```

Implementation fit:

- `tools/work-capabilities/` follows the same shape as `tools/domains/`.
- `DomainSkillStack` remains as the compatibility bridge while `WorkCapability` is introduced.
- `work_capability_search` materializes only `work_capability_load`.
- `work_capability_load` materializes only `skill_load` and `resource_search`.
- `tool-payload-compaction` has compact handlers for `work_capability_search_results` and `work_capability`.
- The prompt should keep the existing root/child skill table until routing evals pass.
- The first prompt change added the compact domain index without removing skill metadata.

## Migration Plan

Implementation status:

- Phases 1 and 2 are implemented.
- Phase 3 has partial telemetry/admin visibility, but dedicated routing evals and latency dashboards are still pending.
- Phase 4 must remain gated on evals. Do not remove root/child skill prompt metadata yet.
- Phase 5 is partially implemented through the first-class queue table and admin queue workflow. The automated research worker, draft artifact format, and approval-to-runtime promotion path are still pending.

### Phase 0: Clarify Naming

- Treat existing `CapabilityDefinition` as `BuildOSCapability`.
- Treat existing `DomainSkillStack` as proto-`WorkCapability`.
- Keep current field names for compatibility while adding clearer aliases.

### Phase 1: Add Work Capability Registry Behind Existing Prompt

Do not remove skill metadata yet. The current root/child skill tables are still the fallback discovery surface.

Implemented WorkCapability while keeping the prompt behavior stable:

Implemented:

```txt
apps/web/src/lib/services/agentic-chat/tools/work-capabilities/
  types.ts
  catalog.ts
  work-capability-search.ts
  work-capability-load.ts
  work-capability-validation.ts
```

Seeded with 5-10 high-value work capabilities:

```txt
cold_email_campaign_build
cold_email_sender_readiness
youtube_growth_strategy_plan
youtube_video_improvement
linkedin_company_page_growth_plan
ui_ux_screen_review
design_system_architecture_review
short_form_video_asset_improvement
content_strategy_plan
project_audit
```

Some of these can be BuildOS-native and domain-aware, such as `project_audit`.

### Phase 2: Wire Gateway Tools

- Added `work_capability_search`.
- Added `work_capability_load`.
- `domain_load` returns `work_capability_ids`.
- `work_capability_load` materializes only `skill_load` and `resource_search` when appropriate.
- Keep direct tool availability controlled by context surface profiles and existing tool discovery.
- Keep the current root/child skill prompt tables during rollout.

### Phase 3: Add Evals And Telemetry

Track and evaluate the new routing before removing prompt metadata:

```txt
domains sensed
work capabilities searched/loaded
skills searched/loaded
resources searched/loaded
first loaded skill
unnecessary reloads
coverage gaps
tool rounds
prompt tokens
time to first token
quality eval pass/fail
```

Add eval scenarios:

```txt
routine project status should not load domain skills
cold email review should route to cold_email domain and root skill
YouTube growth plan should route to youtube_growth_strategy_plan
UI screenshot review should route to ui_ux_screen_review
ambiguous follow-up should reuse session domain state
resource loads should occur only after declared handle exposure
```

### Phase 4: Prompt Refactor After Evals Pass

Change prompt from:

```txt
all capabilities + all root skills + all child skills
```

to:

```txt
BuildOS kernel
BuildOS capability index
current tool surface
compact domain index
active domain signals
candidate work capability cards
previously loaded skills
```

Only then reduce always-on skill metadata:

```txt
1. Remove child skill table first.
2. Keep root skill summaries until work capability routing is reliable.
3. Remove root skill table only after evals show no regression.
4. Keep a small previously loaded skills ledger for continuity.
```

### Phase 5: First-Class Research Queue

- Promote repeated metadata backlog entries into a durable BuildOS queue table.
- Add budget, provenance, and review fields before automated research begins.
- Do not run automated research directly from session metadata.

## Example: Cold Email

```txt
User:
  "Help me build a cold email campaign for founders at AI devtools startups."

BuildOSCapabilities:
  people_context
  documents
  web_research

Domain:
  sales_and_growth.cold_email

WorkCapability:
  cold_email_campaign_build

Skills:
  cold_email_engagement_first_outreach
  cold_email_icp_signal_design
  cold_email_offer_lab
  cold_email_research_anchors
  cold_email_outreach_compiler

Resources:
  signal scoring rubric
  provider requirement matrix maybe later

Tools:
  web research if needed
  create_onto_document if saving campaign
```

The prompt should not preload every cold email child skill. It should expose the work capability, then load the root skill or specific child skill when needed.

## Example: YouTube Growth

```txt
User:
  "I want to grow my YouTube audience and plan the next videos."

BuildOSCapabilities:
  planning
  documents
  web_research

Domain:
  marketing.youtube_growth

WorkCapability:
  youtube_growth_strategy_plan

Skills:
  content_strategy_beyond_blogging
  algorithm_aware_publishing
  viral_video_script_structure

Gaps:
  youtube_channel_diagnostics
  youtube_channel_craft_for_founders
```

The agent can help with available strategy skills while recording diagnostics as a coverage gap.

## Example: Routine BuildOS Work

```txt
User:
  "What is going on with my projects?"

BuildOSCapability:
  overview

Domain:
  none

WorkCapability:
  none required

Skills:
  none required

Tools:
  get_workspace_overview
```

This should not trigger domain search, work capability search, or skill loading.

## Implementation Defaults

1. Use `WorkCapability` as the internal name. Product-facing labels can change later.
2. Keep `project_audit` and `project_forecast` as BuildOS capabilities first. Add matching work capabilities only when they need outcome cards, quality criteria, or skill stacks.
3. Support both runtime-selected and model-called `work_capability_search`, but do not add a pre-answer LLM router.
4. Keep active domain/work capability chips admin-only until the behavior is proven.
5. Keep root skill metadata in the prompt until evals show work-capability routing has no quality regression.
6. Make pre-answer routing deterministic and local. Let the model request deeper work capability, skill, and resource loads during the normal response loop.
7. Roll work capability coverage up to domain coverage in admin analytics, not in the chat prompt.

## Recommended Direction

Use this hierarchy:

```txt
BuildOS Kernel
  always-on operating rules

BuildOSCapability
  what the product/runtime can do

Domain
  where the subject work lives

WorkCapability
  what outcome the user wants

Skill / MicroSkill
  how to do the work well

Resource
  optional depth, examples, evidence, provenance

Tool / Op
  concrete execution
```

This gives BuildOS a progressive-discovery architecture without making domains carry too much responsibility. Domains orient the agent. Work capabilities route the outcome. Skills provide reusable behavior. Tools execute. Resources deepen only when needed.
