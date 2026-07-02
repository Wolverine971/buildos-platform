<!-- docs/specs/buildos-domain-skill-architecture-2026-05-18.md -->

# BuildOS Domain + Skill Architecture

Status: background/reference draft; superseded for implementation
Date: 2026-05-18; updated 2026-05-19
Owner: BuildOS agentic chat

Implementation note:

This document captures the original domain/skill direction and remains useful for the domain catalog, session state, resource handles, and research queue model. The implementation target is now the refined work-capability architecture in `docs/specs/buildos-domain-work-capability-architecture-2026-05-18.md`, which adds the missing outcome-routing layer between domains and skills.

As of 2026-05-19, Phase 1 infrastructure is implemented in the work-capability architecture: domain/work-capability tools, compact domain prompt index, session domain state, demand capture, and the admin-managed `domain_research_queue`. The broader candidate map for 10-20 future domain packs lives in `docs/specs/buildos-domain-candidate-map-2026-05-19.md`.

2026-06-22 clarification: the original "domain as routing map" thesis remains, but the implementation-facing question is now route strength, not whether sensing has consumers. Active domain signals feed the prompt and admin queue flow. Future work should decide whether to keep this advisory/admin-visible or make it product-critical, using domain signal frequency, prompt-injected usage, backlog promotion, and downstream skill/tool usage by domain as the measurement set.

## Purpose

BuildOS needs a first-class domain layer that lets agentic chat understand the subject territory of a conversation before choosing skills, resources, tools, or future research.

This layer should stay in BuildOS. Libri can supply source material for domains that are not yet mature inside BuildOS, but BuildOS should own the routing map, session state, skill coverage, demand telemetry, and research queue.

The target system has two phases:

1. Build the domain/skill infrastructure and a BuildOS-owned research queue.
2. Build the research flow that turns queued domain gaps into better domains, skills, micro-skills, and resources.

## Working Thesis

Domains are the semantic routing layer above skills.

Capabilities describe what BuildOS can do.

Domains describe the subject world the user is operating in.

Skills are workflow playbooks that become relevant when a domain and capability intersect.

Micro-skills are composable niche playbooks under a larger skill.

Resources are supporting material: source maps, examples, transcripts, templates, benchmark notes, or Libri-backed corpus items.

Tools execute actions.

The domain layer should not make the prompt huge. It should progressively reveal context:

```txt
user message
  -> detect active domains
  -> show compact domain signals
  -> discover or load matching skills/resources only when needed
  -> record coverage gaps as BuildOS research demand
```

## Design Principles

1. BuildOS owns the control plane.
   Domain IDs, aliases, hierarchy, coverage status, linked skills, research gaps, session state, and prioritization live in BuildOS/Supabase.

2. Libri owns corpus depth, not routing authority.
   Libri can provide books, people, videos, transcripts, and source references. BuildOS should call Libri through bounded resource handles, not depend on Libri/Convex for core chat routing.

3. Root skills stay self-sufficient.
   A root skill should be the default playbook. Micro-skills and references are optional depth handles, not automatic prompt payload.

4. Domains are maps, not payload dumps.
   Detecting `marketing.youtube_growth` should not load every content, video, and marketing skill. It should expose the top routes and gaps.

5. Gaps become product signal.
   When users repeatedly ask about domains where coverage is weak, BuildOS should queue research and skill work instead of pretending the skill exists.

6. Research is asynchronous and bounded.
   Research should run from an explicit BuildOS queue with budgets, status, provenance, and review gates. It should not recursively expand itself without fuses.

## Concept Model

```txt
Domain
  subject territory, market, craft, niche, problem space

Capability
  class of work BuildOS can perform

Skill
  workflow playbook for doing a type of work well

Micro-skill
  nested or child skill for a narrower mode, failure case, or sub-workflow

Resource
  supporting evidence, examples, source maps, templates, Libri corpus handles

Tool / Op
  executable runtime action

Research Queue Item
  BuildOS-owned demand signal that says a domain/skill/resource gap should be researched
```

## Phase 1: Infrastructure + Research Queue

Phase 1 sets up the durable maps and demand capture. It does not try to automate research yet.

### Goals

- Keep a first-class domain catalog in BuildOS.
- Connect domains to capabilities, root skills, micro-skills, resources, and known gaps.
- Track active domains per chat session.
- Populate a BuildOS research queue when detected domains have partial or missing coverage.
- Add admin analytics for domain demand and skill/resource coverage.
- Keep Libri optional and bounded through resource handles.

### Runtime Flow

```txt
1. User sends a chat message.
2. BuildOS loads normal chat/project context.
3. Domain sensing finds active domains from the latest message, summary, and prior session domains.
4. BuildOS writes compact active domain state to session metadata.
5. Prompt receives active domain signals:
   - candidate domains
   - coverage status
   - linked root skills
   - recommended skill stacks
   - known gaps
6. Model may call:
   - domain_search
   - domain_load
   - skill_search
   - skill_load
   - resource_search
   - resource_load
7. BuildOS records domain observations and queues research backlog entries for gaps.
```

### Phase 1 Data Models

These can start file-backed for versioned definitions and persist operational state in Supabase. The file-backed definitions keep authoring fast; the database captures real demand.

#### Domain Definition

Authoritative domain catalog entry. Initially file-backed; later can be mirrored into a table.

```ts
type DomainCoverageStatus = 'none' | 'partial' | 'strong';

type DomainDefinition = {
	id: string;
	name: string;
	parentIds: string[];
	aliases: string[];
	summary: string;
	boundaries: string[];
	coverageStatus: DomainCoverageStatus;
	capabilityIds: string[];
	skills: DomainSkillLink[];
	recommendedSkillStacks?: DomainSkillStack[];
	resources?: DomainResourceLink[];
	relatedDomainIds?: string[];
	gaps?: DomainCoverageGap[];
	notes?: string[];
};
```

Rules:

- Domain IDs use stable dotted namespaces: `marketing.youtube_growth`, `people.executive_research`, `books.business_strategy`.
- Parent/related domains are indexes for routing, not inheritance of every skill.
- `coverageStatus` describes BuildOS skill/resource readiness, not whether the domain is important.
- A domain can have multiple active parents when useful, but the hierarchy should stay shallow.

#### Domain Skill Link

```ts
type DomainSkillLink = {
	id: string;
	useWhen: string;
	priority?: 'primary' | 'secondary' | 'experimental';
};
```

Rules:

- Root skills should usually be primary.
- Micro-skills can be linked directly only when the domain naturally maps to that narrow workflow.
- The link is not permission to auto-load the skill.

#### Domain Skill Stack

Reusable combination of skills for common multi-skill work.

```ts
type DomainSkillStack = {
	id: string;
	name: string;
	useWhen: string;
	skillIds: string[];
};
```

Example:

```ts
{
	id: 'youtube_growth_strategy_plan',
	name: 'YouTube Growth Strategy Plan',
	useWhen: 'the user wants positioning, content strategy, publishing rhythm, or a first-video roadmap',
	skillIds: [
		'content_strategy_beyond_blogging',
		'algorithm_aware_publishing',
		'viral_video_script_structure'
	]
}
```

#### Skill Definition

Existing runtime skill model should remain mostly intact.

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

- A root skill should remain useful without loading children.
- A micro-skill is a registered skill with `parentId`.
- A reference module is not a skill. It is supporting material loaded only when needed.
- Skill authoring validation should prevent duplicate IDs, parent cycles, unsafe reference paths, and overgrown roots.

#### Resource Definition

Resource registry entry. This can point to local skill references, local docs, or Libri.

```ts
type ResourceKind =
	| 'domain_resource'
	| 'skill_reference'
	| 'libri_book'
	| 'libri_person'
	| 'libri_video'
	| 'libri_source_map'
	| 'template'
	| 'example'
	| 'scorecard';

type ResourceDefinition = {
	id: string;
	kind: ResourceKind;
	title?: string;
	summary: string;
	whenToLoad: string[];
	domainIds: string[];
	skillIds: string[];
	source: 'buildos' | 'libri';
	loadPolicy: 'manual' | 'domain_referenced' | 'skill_referenced';
	localPath?: string;
	libriResourceKey?: string;
	visibility?: 'public' | 'internal';
};
```

Rules:

- Resources are search/load targets, not prompt defaults.
- Libri resources are allowed, but every Libri call must be explicit and bounded.
- `resource_load` should not become arbitrary file browsing.

#### Domain Session State

Stored in `chat_sessions.agent_metadata.fastchat_domain_state`.

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

Rules:

- This is per-chat session state.
- It should stay compact and bounded.
- It should help ambiguous follow-up turns continue in the same domain.
- It should not store large raw user messages.

#### Domain Research Backlog Entry

BuildOS-owned queue signal created when a domain gap appears.

```ts
type DomainResearchBacklogEntry = {
	id: string; // e.g. skill:youtube_channel_diagnostics
	kind: 'skill' | 'resource';
	status: 'queued';
	priority: 'high' | 'medium' | 'low';
	domain_ids: string[];
	missing_skill_id?: string;
	missing_resource_id?: string;
	user_need: string;
	summary: string;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};
```

This metadata is enough for Phase 1. It is not yet the full research workflow table.

#### Future Database Table: Domain Research Queue

Phase 1 can start with session metadata and admin aggregation. Before automated research begins, promote the backlog into a first-class table.

```sql
create table domain_research_queue (
	id uuid primary key default gen_random_uuid(),
	queue_key text not null unique,
	kind text not null check (kind in ('domain', 'skill', 'micro_skill', 'resource')),
	status text not null check (
		status in ('queued', 'researching', 'draft_ready', 'reviewing', 'approved', 'rejected', 'archived')
	),
	priority text not null check (priority in ('high', 'medium', 'low')),
	domain_ids text[] not null default '{}',
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
	result jsonb,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);
```

Use this table when the research workflow needs durable claiming, retries, and admin review.

### Phase 1 Deliverables

- Domain catalog and authoring validation.
- Domain sensing per agentic chat turn.
- `domain_search` / `domain_load`.
- `skill_search`.
- `resource_search` / `resource_load`.
- Session domain state.
- Research backlog in BuildOS metadata.
- Admin analytics endpoint for:
    - top active domains
    - coverage status counts
    - queued skill/resource gaps
    - domain demand over time
- No automatic research yet.

## Phase 2: Research Flow

Phase 2 turns demand into better domain coverage.

### Goals

- Promote repeated research backlog items into durable queue records.
- Research domains, skills, micro-skills, and resources from bounded source sets.
- Use Libri where it is useful for books, people, videos, and source corpora.
- Generate draft artifacts, not auto-publish runtime skills.
- Add review gates before a researched draft becomes part of the runtime skill/domain system.

### Research Flow

```txt
1. Admin or scheduler promotes backlog item to domain_research_queue.
2. Worker claims one queue item.
3. Worker builds a bounded research plan:
   - target domain
   - target skill or resource gap
   - source budget
   - max depth
   - allowed providers
4. Worker gathers sources:
   - BuildOS docs and existing skills
   - Libri resources
   - selected web/search providers if enabled
5. Worker synthesizes:
   - domain updates
   - root skill draft
   - micro-skill draft
   - resource/source map
   - evidence notes
6. Draft is written to a review area.
7. Admin reviews and approves.
8. Approved artifact is promoted into runtime catalog/registry.
```

### Research Job Model

```ts
type DomainResearchJob = {
	id: string;
	queueKey: string;
	kind: 'domain' | 'skill' | 'micro_skill' | 'resource';
	status:
		| 'queued'
		| 'researching'
		| 'draft_ready'
		| 'reviewing'
		| 'approved'
		| 'rejected'
		| 'archived';
	priority: 'high' | 'medium' | 'low';
	domainIds: string[];
	parentSkillId?: string;
	targetSkillId?: string;
	targetResourceId?: string;
	userNeed: string;
	summary: string;
	sourcePolicy: DomainResearchSourcePolicy;
	budget: DomainResearchBudget;
	result?: DomainResearchResult;
};
```

### Research Source Policy

```ts
type DomainResearchSourcePolicy = {
	allowBuildosDocs: boolean;
	allowExistingSkills: boolean;
	allowLibri: boolean;
	allowWeb: boolean;
	allowedLibriKinds: Array<'book' | 'person' | 'video' | 'transcript' | 'source_map'>;
	requiredSourceCount: number;
	maxSourceCount: number;
};
```

### Research Budget

Hard fuses are required before automated research touches Libri or recursive sources.

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

Rules:

- No unbounded recursion.
- No worker-spawned worker loops without an explicit queue record and dedupe key.
- No automatic promotion into runtime skills.
- Every source load must be counted.
- Every draft must keep provenance.

### Research Result

```ts
type DomainResearchResult = {
	recommendedAction:
		| 'create_domain'
		| 'update_domain'
		| 'create_root_skill'
		| 'create_micro_skill'
		| 'create_resource'
		| 'no_action';
	draftDomain?: Partial<DomainDefinition>;
	draftSkill?: {
		id: string;
		parentId?: string;
		markdown: string;
	};
	draftResource?: ResourceDefinition;
	sourceMap: Array<{
		sourceId: string;
		sourceKind: string;
		title: string;
		url?: string;
		libriResourceKey?: string;
		usedFor: string[];
	}>;
	risks: string[];
	openQuestions: string[];
};
```

### Phase 2 Deliverables

- First-class `domain_research_queue` table or equivalent.
- Queue promotion job from session backlog aggregates.
- Worker for bounded research jobs.
- Draft output folder/table for generated skill/domain/resource proposals.
- Admin review surface.
- Promotion flow into runtime catalog after approval.
- Libri adapter with strict budgets and idempotency.

## BuildOS vs Libri Boundary

BuildOS owns:

- Domain taxonomy.
- Domain session state.
- Domain coverage status.
- Skill registry.
- Micro-skill relationships.
- Research backlog.
- Research queue.
- Admin review and promotion.
- Prompt/gateway policy.

Libri owns:

- Books.
- People.
- Videos.
- Transcripts.
- Source corpora.
- External resource metadata.

The bridge is a `ResourceDefinition` handle:

```ts
{
	id: 'books.business_strategy.good_strategy_bad_strategy',
	kind: 'libri_book',
	source: 'libri',
	domainIds: ['strategy', 'business.strategy'],
	skillIds: [],
	libriResourceKey: 'book:good-strategy-bad-strategy',
	loadPolicy: 'domain_referenced'
}
```

BuildOS can know the resource exists and when it is useful. Libri supplies the details only when `resource_load` or a research job explicitly asks for them.

## Domain + Nested Skill Relationship

Nested skills and domains solve different problems.

Domains answer:

```txt
What world are we in?
```

Root skills answer:

```txt
What workflow should guide this work?
```

Micro-skills answer:

```txt
Which narrow sub-workflow or failure mode is active?
```

Resources answer:

```txt
What evidence or examples do we need?
```

Example:

```txt
Domain: marketing.youtube_growth
Root skill: content_strategy_beyond_blogging
Micro-skill: viral_video_script_structure
Resource: youtube_library.marketing_and_content_combo_index
Tool: create_onto_document
```

The agent should not load all four by default. It should progressively discover and load only what the current turn needs.

## Coverage Status Semantics

```txt
none
  BuildOS recognizes the domain but has no dedicated skill/resource coverage.

partial
  BuildOS has adjacent or incomplete coverage. It can help, but should track gaps.

strong
  BuildOS has a reliable root skill or skill stack, supporting resources, and known boundaries.
```

Coverage status is not permanent. It should improve as research jobs are approved.

## Admin Analytics Shape

The domain demand admin payload should answer:

- Which domains are showing up in real chats?
- Which domains have weak coverage?
- Which missing skills/resources are repeatedly requested?
- Which root skills are being recommended but not loaded?
- Which resources are loaded after domain detection?
- Which gaps should become the next research jobs?

Initial payload:

```ts
type DomainDemandAnalyticsPayload = {
	overview: {
		total_domains: number;
		total_domain_occurrences: number;
		total_research_backlog_items: number;
		total_coverage_gaps: number;
		partial_or_no_coverage_sessions: number;
	};
	domains: DomainDemandMetric[];
	research_backlog: DomainResearchBacklogMetric[];
	coverage_gaps: DomainCoverageGapMetric[];
};
```

## Open Decisions

1. Whether Phase 1 should keep domain definitions file-backed only, or mirror them into Supabase for admin editing.
2. Whether research queue items should be global, per-user, per-workspace, or admin-only.
3. Whether users should see active domain chips in chat, or whether domain sensing should stay internal for now.
4. Whether repeated `research_backlog` items should auto-promote into queue records or require admin action.
5. Which Libri resource types should be enabled first: books, people, videos, or transcripts.
6. Whether `experts` should be a separate abstraction or modeled as person/resources plus skills.

## Recommended High-Level Direction

Keep the architecture conservative:

1. BuildOS owns domains, skills, micro-skills, resources, coverage, and research demand.
2. Keep the Phase 1 domain system lightweight, mostly file-backed, and telemetry-rich.
3. Store real demand in BuildOS so repeated gaps become visible.
4. Use Libri only as a bounded resource provider.
5. Do not build automated research until the queue model, budget fuses, and review flow are explicit.
6. Treat "experts" as a future layer. For now, model people as Libri resources and model expert workflows as skills.

This gives BuildOS the abstraction it needs without putting Convex/Libri on the critical path for agentic chat.
