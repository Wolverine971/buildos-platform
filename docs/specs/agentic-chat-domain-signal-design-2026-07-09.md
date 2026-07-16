<!-- docs/specs/agentic-chat-domain-signal-design-2026-07-09.md -->

# Agentic Chat Domain Signal Design Pass

Status: design target, not yet implemented
Date: 2026-07-09
Owner: BuildOS agentic chat

## Purpose

The current domain system correctly supports manual research queue promotion, but it conflates several different ideas:

- the user mentioned or implied a known domain;
- the agent actually used a domain, outcome card, resource, or skill;
- a known domain has an explicit coverage gap;
- users are asking for an area where BuildOS does not yet have a domain, process, skill, or data source.

This design separates those signals while preserving the current manual `domain_research_queue` workflow.

## Current Baseline

The live pipeline is:

```txt
user message
  -> senseDomains(...)
  -> prompt Active Domain Signals
  -> merge fastchat_domain_state into chat_sessions.agent_metadata
  -> /admin/chat/domains aggregates session metadata
  -> admin manually promotes candidates into domain_research_queue
```

This is the correct control shape. The next pass should improve the signal model, not auto-promote queue rows.

## Target Principle

Domain demand should be evidence-based, not just catalog-match-based.

Every admin-visible domain row should be able to say why it exists:

- `sensed`: matched the user message or session summary;
- `loaded`: the agent loaded a domain, outcome card, resource, or skill tied to that domain;
- `gap`: the known domain explicitly says coverage is missing;
- `unknown_interest`: the user asked for a specialized area that did not map cleanly to a known domain;
- `workflow_gap`: the system could name the user need but could not map it to an existing process, skill, or resource.

## Signal Taxonomy

### 1. Sensed Domain

User language matched a registered domain.

```ts
type SensedDomainSignal = {
	domain_id: string;
	source: 'current_user_message' | 'conversation_summary' | 'session_state';
	confidence: number;
	aliases_hit: string[];
	query_preview: string;
};
```

This is mostly the current `active_domains` path.

### 2. Used Domain

The runtime actually loaded something with domain metadata.

```ts
type UsedDomainSignal = {
	domain_id: string;
	source:
		| 'domain_load'
		| 'outcome_card_load'
		| 'resource_load'
		| 'skill_load'
		| 'skill_loaded_event';
	tool_name?: string;
	skill_id?: string;
	outcome_card_id?: string;
	resource_id?: string;
	turn_run_id?: string;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
};
```

Extraction rules:

- `domain_load`: use `result.domain_id`.
- `outcome_card_load`: use `result.domain_ids`.
- `resource_load`: use `result.domain_ids`.
- `skill_load`: map `result.id` to domains through skill metadata and the domain catalog.
- `skill_loaded_event`: same mapping, but from `chat_turn_events` as backup telemetry.

This closes the gap where domain demand currently tracks what was sensed but not what the agent actually used.

### 3. Known Coverage Gap

A registered domain or outcome card explicitly says a skill/resource/process is missing.

```ts
type KnownCoverageGapSignal = {
	queue_key: string;
	kind: 'skill' | 'resource' | 'work_capability';
	domain_ids: string[];
	missing_skill_id?: string;
	missing_resource_id?: string;
	work_capability_id?: string;
	user_need: string;
	summary: string;
	source: 'domain_gap' | 'outcome_card_gap';
};
```

Rule change: outcome-card gaps should be promoted into session backlog even when the parent domain does not duplicate the gap.

### 4. Unknown Domain Interest

The user is asking for specialized subject-matter help, but no catalog domain matches strongly enough.

```ts
type UnknownDomainInterestSignal = {
	interest_key: string;
	label: string;
	query_preview: string;
	reason: 'no_catalog_match' | 'low_confidence_catalog_match' | 'ambiguous_many_domains';
	confidence: number;
	first_seen_at: string;
	last_seen_at: string;
	occurrences: number;
	example_queries: string[];
};
```

This should not be created for generic chat, simple task CRUD, scheduling, or project status asks. It should trigger only when the user is asking for specialized judgment, data, research, a repeatable workflow, or domain-specific quality criteria.

Initial implementation can be deterministic:

- no active domain;
- no native BuildOS project outcome card;
- request contains work-intent verbs such as audit, plan, diagnose, build, research, rewrite, evaluate, compare, score, strategy, workflow;
- request has enough nouns after stopword filtering to label the interest.

Later implementation can add an offline/admin-only classifier or clustering pass for higher recall.

### 5. Workflow Gap Candidate

The user need is clear, but BuildOS does not have a named domain process, skill, or resource.

```ts
type WorkflowGapCandidate = {
	queue_key: string;
	kind: 'domain' | 'work_capability' | 'skill' | 'resource';
	domain_ids: string[];
	label: string;
	user_need: string;
	summary: string;
	source: 'partial_domain_without_gap' | 'unknown_domain_interest' | 'missing_process';
	priority: 'high' | 'medium' | 'low';
};
```

Examples:

- `domain:agent_engineering:coverage_gap` when a partial domain is used repeatedly but has no explicit gap.
- `domain:unknown:customer-success-playbooks` when repeated unknown-interest queries cluster around customer success workflows.
- `work_capability:marketing_site_quality_review` when a known domain exists but the repeatable output lane is missing.

## Session State Additions

Keep the existing `fastchat_domain_state` location. Add optional fields so old rows remain valid.

```ts
type DomainSessionStateV1Extension = {
	used_domains?: UsedDomainSessionEntry[];
	unknown_domain_interests?: UnknownDomainInterestSessionEntry[];
	workflow_gap_candidates?: WorkflowGapCandidateSessionEntry[];
};
```

Do not require a database migration for the first pass. This lives inside `chat_sessions.agent_metadata.fastchat_domain_state`, just like current active domains, coverage gaps, and backlog.

## Runtime Flow

```txt
1. Before the model call:
   - run existing senseDomains(...)
   - produce Active Domain Signals
   - merge sensed domain observations

2. During tool execution:
   - keep existing chat_tool_executions and chat_turn_events
   - do not add queue writes here

3. After tool results are known:
   - derive used-domain signals from tool results and skill-loaded events
   - merge those into fastchat_domain_state.used_domains

4. During session-state merge:
   - merge domain gaps from active domains
   - merge outcome-card gaps from candidate/loaded outcome cards
   - detect unknown domain interests when no known domain fits
   - create workflow-gap candidates for partial domains with repeated usage but no explicit gaps

5. In admin:
   - aggregate sensed demand, used demand, known gaps, unknown interests, and workflow candidates
   - continue requiring manual Promote before writing domain_research_queue
```

## Admin UX Changes

`/admin/chat/domains` should distinguish four counts:

- Sensed domains: demand inferred from language.
- Used domains: demand proven by actual loaded domain/card/resource/skill.
- Coverage gaps: known missing skill/resource/work-capability metadata.
- Unknown interests: repeated specialized asks outside the catalog.

Queue Candidates should be derived from:

- existing `research_backlog`;
- outcome-card gaps;
- repeated unknown interests;
- repeated partial domains with no explicit gap;
- repeated used-skill domains whose domain is missing from the domain catalog.

Promotion stays manual.

## Priority Rules

Suggested initial priority:

```txt
high
  repeated across >= 3 users, or explicit user need plus no coverage

medium
  repeated in >= 2 sessions, or known partial domain gap

low
  one-off unknown interest, weak confidence, or exploratory candidate
```

Do not promote low-confidence unknown interests automatically. Surface them for review.

## Backward Compatibility

- Existing `active_domains`, `coverage_gaps`, and `research_backlog` remain valid.
- Existing `domain_research_queue` schema already supports `kind = domain | work_capability | skill | micro_skill | resource`.
- Existing queue promotion API can keep using stable `queue_key`; it only needs more candidate sources.
- Existing tests around YouTube diagnostics should continue passing unchanged.

## Implementation Slices

### Slice 1: Add Type + Merge Support

- Extend `DomainSessionState` with optional `used_domains`, `unknown_domain_interests`, and `workflow_gap_candidates`.
- Add parsers/readers that tolerate absent fields.
- Add merge helpers with bounded array sizes.

### Slice 2: Derive Used Domains

- Add a pure helper that takes tool executions/events and returns `UsedDomainSignal[]`.
- Map `domain_load`, `outcome_card_load`, `resource_load`, and `skill_load` results to domains.
- Add tests using representative tool-result payloads.

### Slice 3: Outcome Card Gaps

- Add outcome-card gaps to sensing/session merge.
- Ensure a gap does not need to be duplicated on both the domain and outcome card.

### Slice 4: Unknown Interest Detector

- Add deterministic unknown-interest extraction for no-match specialized asks.
- Keep it conservative.
- Add regression tests that it does not fire for project CRUD, scheduling, greetings, or generic follow-ups.

### Slice 5: Admin Aggregation

- Extend `buildDomainDemandAnalytics` to aggregate used domains, unknown interests, and workflow candidates.
- Show these as separate admin sections.
- Keep Promote manual.

### Slice 6: Queue Candidate Expansion

- Extend queue candidate builder to include:
    - known backlog;
    - outcome-card-only gaps;
    - unknown domain interests above threshold;
    - partial domains with repeated demand but no explicit gap.

## Test Plan

Required tests:

- current YouTube diagnostics path still creates `skill:youtube_channel_diagnostics`;
- a loaded outcome card with `domain_ids` increments used-domain demand;
- a loaded skill maps back to at least one domain;
- an outcome-card-only gap becomes backlog without domain duplication;
- unknown specialized ask creates an unknown-interest candidate;
- generic/project/tooling asks do not create unknown-interest candidates;
- admin analytics separates sensed and used counts;
- promote endpoint still writes only when invoked manually.

## Non-Goals

- No automatic research worker in this pass.
- No direct writes to `domain_research_queue` from live chat turns.
- No replacement of the existing domain catalog.
- No broad LLM classifier in the hot path until deterministic coverage is measured.
