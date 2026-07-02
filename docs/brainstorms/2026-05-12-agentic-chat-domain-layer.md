<!-- docs/brainstorms/2026-05-12-agentic-chat-domain-layer.md -->

# Agentic Chat Domain Layer Brainstorm

Status: historical brainstorm; Phase 1 infrastructure is now partially implemented
Date: 2026-05-12
Context: Follow-up from discussion about connecting BuildOS blog-derived agent skills into Agentic Chat.

2026-06-22 current status:

- Domain sensing is live in `/api/agent/v2/stream`.
- Active domain signals are injected into the lite prompt and persisted in `chat_sessions.agent_metadata.fastchat_domain_state`.
- Domain/work-capability search/load tools, domain demand capture, and the admin-managed `domain_research_queue` flow exist.
- The admin domain page reads backlog candidates, and `/api/admin/chat/domains/research-queue/promote` can promote session backlog into durable queue records.
- The open question is no longer "is domain sensing consumed?" It is whether domain routing should remain advisory/admin-visible or become product-critical by nudging skill/tool selection more forcefully.

Suggested measurement before increasing route strength:

- domain signal frequency by context type
- prompt-injected active-domain usage and follow-up continuity
- research backlog candidate creation and promotion rate
- downstream skill/tool usage by sensed domain/work capability
- TTFR and prompt-token delta for domain-active vs routine BuildOS turns

## Why This Exists

BuildOS already has a useful Agentic Chat structure:

- capabilities
- skills
- tools

The current system is strong for native BuildOS project operations. If a user asks to create, update, inspect, or restructure BuildOS projects, the chat can use existing project, task, document, plan, calendar, and overview tools.

The gap appears when the chat moves into a subject-matter area that is not only a BuildOS product operation.

Example:

```txt
I want to grow my YouTube audience.
```

That request is not only a "project update" request. It enters a subject domain:

- marketing
- creator growth
- YouTube growth
- content strategy
- maybe short-form video
- maybe audience diagnostics

BuildOS has useful skills in or near those areas, but the current runtime does not yet have a clean layer for noticing the domain, mapping the domain to available skills, surfacing relevant skill coverage, and tracking gaps.

This document captures the train of thought and sketches a domain-aware architecture.

## Current Repo Reality

The current Agentic Chat gateway already has the right shape for progressive disclosure:

- `skill_load`: load one skill playbook by id.
- `tool_search`: discover candidate BuildOS tools on demand.
- `tool_schema`: inspect exact tool arguments and examples.
- Direct tools: context-specific execution surfaces materialized for the current turn.

Relevant code:

- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/gateway.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`
- `apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`

The current prompt already teaches a useful three-layer model:

```txt
Capability -> Skill -> Tool / Op
```

But the registered runtime skills are mostly internal BuildOS operational skills:

- `calendar_management`
- `document_workspace`
- `plan_management`
- `project_creation`
- `task_management`
- `people_context`
- `libri_knowledge`
- `project_audit`
- `project_forecast`

The blog-derived skills exist elsewhere:

- public articles in `apps/web/src/content/blogs/agent-skills/`
- draft skill packages in `docs/research/youtube-library/skill-drafts/`
- lineage maps in nearby `lineage.yaml` files
- category indexes in `docs/research/youtube-library/skill-combo-indexes/`

Those are valuable, but they are not yet first-class runtime skills for Agentic Chat.

## Research And Prior Design Anchors

This brainstorm builds on three existing lines of evidence.

### Existing BuildOS Gateway Pattern

BuildOS already moved toward a provider-neutral progressive disclosure model:

```txt
small static discovery surface
  -> search / load metadata
  -> materialize exact direct tools
  -> use direct tools in the next model pass
```

This is visible in the current `skill_load`, `tool_search`, `tool_schema`, and direct-tool materialization flow.

### Libri Dynamic Discovery Pattern

The Libri discovery bridge notes already describe the same pattern for external capabilities:

1. A trusted manifest describes available capabilities.
2. BuildOS validates and caches the manifest.
3. The agent gets a small permanent discovery bridge.
4. Discovery returns specific direct tool names.
5. BuildOS materializes those tools for the next model pass.
6. The model calls the direct tool by name.

That pattern should generalize to domains and skills:

```txt
domain discovery
  -> skill/resource discovery
  -> focused skill/resource load
  -> direct BuildOS or external tool use when needed
```

### Model-Turn Constraint

Most tool-calling APIs require tools to be declared before the model starts a response. So the runtime usually cannot discover a brand-new direct tool halfway through a response and have the same model call invoke it immediately.

The safe pattern is:

```txt
pass 1: discover domain / skill / tool
runtime: materialize relevant definitions
pass 2: use the loaded skill/tool context
```

This is why dynamic discovery should not become a generic `call_anything({ op, args })` pattern for normal chat. Direct, named, schema-shaped tools are easier for models to use correctly and easier for BuildOS to validate, repair, log, and secure.

### External Pattern

The broader agent ecosystem points in the same direction:

- Load only skill metadata up front.
- Load full skill instructions on demand.
- Keep tools schema-rich and self-describing.
- Use deferred loading or search for large tool/skill catalogs.
- Keep supporting references separate from the first prompt unless needed.

## Key Distinction

Capabilities and domains are different.

Capabilities are product affordances:

```txt
What can BuildOS do?
```

Domains are subject-matter territory:

```txt
What world are we operating in?
```

Skills sit at the intersection:

```txt
Given this domain and desired capability, what playbook should guide the agent?
```

Tools execute:

```txt
What exact action can the runtime perform?
```

Resources support:

```txt
What source material, examples, templates, lineage, scripts, or references can be loaded?
```

## Proposed Mental Model

Use five distinct concepts:

```txt
Domain     = subject territory, market, niche, craft, or problem space
Capability = kind of work BuildOS can help perform
Skill      = on-demand workflow playbook
Tool       = executable runtime action
Resource   = supporting reference material
```

Example:

```txt
User: I want to grow my YouTube audience.
```

Potential domain stack:

```txt
marketing
creator_growth
marketing.youtube_growth
marketing.short_form_video
marketing.content_strategy
```

Potential capabilities:

```txt
content strategy
hook critique
script planning
publishing plan
audience diagnostics
analytics review
project planning
task creation
```

Potential skills:

```txt
hook-craft-short-form
viral-video-script-structure
content-strategy-beyond-blogging
algorithm-aware-publishing
going-viral
story-driven-content-craft
viral-content-for-boring-brands
```

Potential tools:

```txt
get_project_overview
create_onto_task
update_onto_task
create_onto_document
web search / web visit
Libri search or transcript lookup
future YouTube analytics tools
```

Potential resources:

```txt
skill lineage files
YouTube transcript analyses
skill-combo indexes
example hooks
platform-specific references
creator benchmark notes
```

## Domain Should Not Mean Auto-Load Everything

A domain match should not automatically inject every related skill.

Better behavior:

1. Detect candidate domains.
2. Update active domain state.
3. Expose a compact domain card or domain summary.
4. Make relevant skills discoverable.
5. Let the model load the specific skill only when the task needs the playbook.
6. Log missing coverage when a domain is detected but BuildOS has no strong skill.

The domain layer is a map, not a payload dump.

## Proposed Domain Catalog

Add a domain catalog that can represent hierarchy, aliases, skill coverage, and gaps.

Sketch:

```ts
type DomainCoverageStatus = 'none' | 'partial' | 'strong';

type DomainDefinition = {
	id: string;
	name: string;
	parentIds: string[];
	aliases: string[];
	summary: string;
	coverageStatus: DomainCoverageStatus;
	capabilityIds: string[];
	skillIds: string[];
	resourceIds: string[];
	relatedDomainIds: string[];
	exclusions?: string[];
	notes?: string[];
};
```

Example:

```ts
{
  id: 'marketing.youtube_growth',
  name: 'YouTube Growth',
  parentIds: ['marketing', 'creator_growth'],
  aliases: [
    'youtube audience',
    'grow my channel',
    'youtube strategy',
    'youtube subscribers',
    'youtube content growth'
  ],
  summary: 'Growing a YouTube channel through positioning, hooks, scripts, publishing rhythm, audience understanding, and retention-aware content.',
  coverageStatus: 'partial',
  capabilityIds: [
    'content_strategy',
    'project_planning',
    'audience_growth'
  ],
  skillIds: [
    'hook-craft-short-form',
    'viral-video-script-structure',
    'content-strategy-beyond-blogging',
    'algorithm-aware-publishing'
  ],
  resourceIds: [
    'youtube-library.skill-combos.marketing-and-content',
    'youtube-library.skill-drafts.going-viral.references.youtube'
  ],
  relatedDomainIds: [
    'marketing.short_form_video',
    'marketing.creator_positioning',
    'marketing.content_distribution'
  ],
  exclusions: [
    'Do not assume paid ads unless the user mentions paid acquisition.',
    'Do not assume short-form content if the user is asking about long-form YouTube.'
  ],
  notes: [
    'Coverage is partial because BuildOS has hook and content skills, but no dedicated YouTube analytics diagnosis skill yet.'
  ]
}
```

## Domain Sensing

Add a lightweight domain sensing step to each chat turn.

Input:

- latest user message
- recent conversation summary
- active project context
- current chat context type
- existing active domains

Output:

```ts
type DomainSensingResult = {
	activeDomains: Array<{
		id: string;
		confidence: number;
		evidence: string[];
		state: 'new' | 'continuing' | 'decayed';
	}>;
	recommendedSkillIds: string[];
	recommendedResourceIds: string[];
	coverageGaps: Array<{
		domainId: string;
		missingSkill: string;
		userNeed: string;
	}>;
};
```

Example:

```json
{
	"activeDomains": [
		{
			"id": "marketing.youtube_growth",
			"confidence": 0.86,
			"evidence": ["grow my YouTube audience"],
			"state": "new"
		},
		{
			"id": "creator_growth",
			"confidence": 0.74,
			"evidence": ["audience growth intent"],
			"state": "new"
		}
	],
	"recommendedSkillIds": ["content-strategy-beyond-blogging", "hook-craft-short-form"],
	"recommendedResourceIds": ["youtube-library.skill-combos.marketing-and-content"],
	"coverageGaps": [
		{
			"domainId": "marketing.youtube_growth",
			"missingSkill": "youtube-channel-diagnostics",
			"userNeed": "diagnose channel growth blockers from analytics and content history"
		}
	]
}
```

The sensing step should be conservative. It should rank domains, not decide the whole workflow.

## Runtime Flow

Target flow:

```txt
User message
  -> load BuildOS context
  -> sense candidate domains
  -> update active domain state
  -> build prompt with compact domain awareness
  -> model decides:
       answer from context
       or domain_load
       or skill_search
       or skill_load
       or tool_search/tool_schema/direct tool
```

More concretely:

```txt
1. User says: "I want to grow my YouTube audience."
2. Domain sensing identifies marketing.youtube_growth and creator_growth.
3. Prompt includes compact active-domain summary:
   - active domain
   - coverage status
   - top matching skills
   - known gaps
4. Model may call skill_load for a relevant playbook.
5. Model may use BuildOS project tools to turn the advice into a plan.
6. Telemetry records domain, skill usage, and gaps.
```

## Proposed Meta-Tools

Do not overload `skill_load` with everything.

Add domain-aware discovery tools:

```txt
domain_search({ query, limit? })
domain_load({ domain })
skill_search({ query, domain?, capability?, limit? })
resource_search({ query, domain?, skill?, limit? })
resource_load({ resource })
```

Possible minimal first step:

```txt
domain_search
domain_load
```

Then extend existing `skill_load` to support content skills once they are in the registry.

## Domain Search Behavior

`domain_search` answers:

```txt
What subject territory is this request in?
```

It should return:

- matching domains
- aliases hit
- confidence score
- parent domains
- linked skill ids
- coverage status
- suggested next action

Example result:

```json
{
	"type": "domain_search_results",
	"query": "grow my YouTube audience",
	"matches": [
		{
			"domain_id": "marketing.youtube_growth",
			"name": "YouTube Growth",
			"confidence": 0.86,
			"coverage_status": "partial",
			"parent_ids": ["marketing", "creator_growth"],
			"skill_ids": [
				"hook-craft-short-form",
				"content-strategy-beyond-blogging",
				"algorithm-aware-publishing"
			],
			"next_step": "Load this domain or a specific skill if the user wants a concrete growth plan."
		}
	]
}
```

## Domain Load Behavior

`domain_load` answers:

```txt
Given this domain, what should the agent know before selecting skills/tools?
```

It should return a compact domain card:

- summary
- boundaries
- child domains
- related capabilities
- relevant skills
- resources
- coverage gaps
- recommended skill stacks

Example:

```json
{
	"type": "domain",
	"domain_id": "marketing.youtube_growth",
	"name": "YouTube Growth",
	"summary": "Grow a YouTube channel through positioning, content format, hooks, scripts, retention, publishing rhythm, and distribution.",
	"coverage_status": "partial",
	"skills": [
		{
			"id": "content-strategy-beyond-blogging",
			"use_when": "the user needs a durable publishing strategy"
		},
		{
			"id": "hook-craft-short-form",
			"use_when": "the user needs better openings or content opt-in"
		},
		{
			"id": "viral-video-script-structure",
			"use_when": "the user needs the video body or retention path"
		}
	],
	"gaps": [
		"No dedicated YouTube analytics review skill.",
		"No dedicated long-form YouTube packaging skill yet."
	],
	"next_step": "Use skill_load for the relevant playbook, or ask one question if the user has not specified channel stage, format, or target audience."
}
```

## Resources As First-Class Supporting Material

Resources are not the same as skills.

Skills should be loaded when the agent needs a workflow.

Resources should be loaded when the agent needs supporting evidence, examples, lineage, or detailed reference material.

Resource examples:

- transcript
- source analysis
- `lineage.yaml`
- examples
- templates
- benchmark library
- platform-specific reference doc
- style guide
- scorecard

Potential resource type:

```ts
type ResourceDefinition = {
	id: string;
	title: string;
	kind:
		| 'source_analysis'
		| 'transcript'
		| 'lineage'
		| 'reference'
		| 'template'
		| 'example'
		| 'scorecard';
	path?: string;
	url?: string;
	domainIds: string[];
	skillIds: string[];
	summary: string;
	loadPolicy: 'manual' | 'skill_referenced' | 'domain_referenced';
};
```

Resources should be queryable, but not preloaded by default.

## Gaps Become Product Signal

The domain layer is useful even when BuildOS does not have a skill.

If the user enters a domain and no strong skill exists, BuildOS should still help using general reasoning and tools, but it should log the gap.

Example:

```txt
domain: marketing.youtube_growth
user_need: diagnose channel growth blockers
missing_skill: youtube-channel-diagnostics
missing_resource: youtube analytics interpretation examples
```

This turns real user demand into the skill roadmap.

Possible gap fields:

```ts
type DomainCoverageGap = {
	domainId: string;
	userNeed: string;
	missingSkillId?: string;
	missingResourceId?: string;
	observedInSessionId?: string;
	confidence: number;
	createdAt: string;
};
```

## Relationship To Existing Blog Skills

The current skill assets appear in three layers:

1. Public articles:
    - `apps/web/src/content/blogs/agent-skills/`
2. Draft portable skills:
    - `docs/research/youtube-library/skill-drafts/*/SKILL.md`
3. Source/composition metadata:
    - `docs/research/youtube-library/skill-drafts/*/lineage.yaml`
    - `docs/research/youtube-library/skill-combo-indexes/`

The runtime should probably not load the public blog article as the skill source.

Better:

- use the draft `SKILL.md` as the agent playbook source
- use the public blog post as marketing/distribution
- use `lineage.yaml` as a resource
- use skill-combo indexes as domain/resource discovery input

## Implementation Options

### Option 1: Register Curated Content Skills Directly

Add a curated set of public/draft skills to the current `skill_load` registry.

Pros:

- fastest path
- reuses current gateway
- lets chat actually use the existing skills

Cons:

- does not solve domain hierarchy
- skill catalog may grow noisy
- current parser may drop valuable markdown sections unless adjusted

Use this for an MVP only.

### Option 2: Add Domain Catalog + Skill Search

Create a domain catalog and domain-aware skill search.

Pros:

- matches the user mental model
- keeps skill loading demand-driven
- can represent partial coverage and gaps
- scales better than a flat skill list

Cons:

- requires new indexing and prompt integration
- needs careful taxonomy management
- first version must avoid over-routing

This is the recommended direction.

### Option 3: Capability Packs

Package domains, capabilities, skills, resources, permissions, and suggested tools together.

Example:

```txt
capability pack: marketing.youtube_growth
  domains
  capabilities
  skills
  resources
  tools
  examples
  gap map
```

Pros:

- strong product abstraction
- can power UI, marketplace, onboarding, and runtime
- easy to install/enable by domain

Cons:

- heavier abstraction
- may be premature before domain sensing proves itself

Good long-term direction after Option 2.

## Recommended Path

Start with Option 2, but keep the first cut small.

Phase 1:

1. Add a static domain catalog file.
2. Seed it with domains already implied by existing skills:
    - `marketing`
    - `marketing.content_strategy`
    - `marketing.short_form_video`
    - `marketing.youtube_growth`
    - `product_and_design`
    - `product_and_design.ui_ux_quality`
    - `writing`
    - `sales_and_growth`
3. Add `domain_search` and `domain_load`.
4. Add curated content skills to `skill_load` without flooding the prompt.
5. Make `domain_load` return linked skills and gaps.

Phase 2:

1. Add `skill_search({ domain, query })`.
2. Add resource registry and `resource_search`.
3. Preserve full skill markdown, not only structured sections.
4. Add telemetry:
    - detected domains
    - loaded domains
    - loaded skills
    - skipped recommended skills
    - domain coverage gaps

Phase 3:

1. Convert high-value domains into capability packs.
2. Promote proven gaps into new skill drafts.
3. Build an admin view of domain demand vs. skill coverage.
4. Use usage data to prioritize new skills and resources.

## Prompt Guidance

The system prompt should teach this compact model:

```txt
Think in five layers:

1. Domain - the subject territory or niche.
2. Capability - the kind of work BuildOS can do.
3. Skill - the workflow playbook to guide complex work.
4. Tool - the exact executable operation.
5. Resource - supporting reference material, examples, or source lineage.

Use domains to orient the conversation, not to preload everything.
Load a skill only when the task needs the full workflow.
Use tools only when an action or lookup is needed.
Load resources only when evidence, examples, or deeper reference material would change the answer.
When domain coverage is partial, help with what is available and surface the gap internally.
```

## What Should Stay Out Of The Domain Layer

Domains should not own:

- exact tool schemas
- project mutation rules
- user privacy policy
- low-level auth or permissions
- automatic prompt injection of large content
- final decisions about whether to write to BuildOS

Domains should own:

- taxonomy
- aliases
- subject boundaries
- linked skills
- linked resources
- coverage status
- gap tracking

## Open Questions

- Should domains be file-backed first, database-backed first, or generated from existing skill metadata?
- Should active domain state persist across a chat session, a project, or the user's whole workspace?
- How aggressively should domain sensing update state when the user briefly mentions another domain?
- Should a domain match be visible in the UI, or only internal telemetry at first?
- Should public blog skills and internal runtime skills share one registry, or should content skills be a separate catalog?
- Should `lineage.yaml` become a resource type immediately?
- How should BuildOS handle overlapping domains like `marketing.youtube_growth`, `marketing.short_form_video`, and `creator_growth`?
- Should gap logging require user consent if it includes the raw user need, or can it store a normalized summary?

## Working Thesis

Domains are the semantic routing layer above skills.

Capabilities describe what BuildOS can do.

Domains describe the subject world the user is operating in.

Skills are the playbooks that become relevant when a domain and capability intersect.

Tools execute.

Resources support.

The immediate goal is not to make the model "know everything." The goal is to make the chat aware of where it is, what BuildOS already knows how to do there, what skill should be loaded only when useful, and what skill/resource gaps keep showing up in real conversations.
