// apps/web/src/lib/services/agentic-chat/tools/work-capabilities/types.ts
import type { DomainCoverageGap } from '../domains/types';

export type WorkCapabilityCoverageStatus = 'none' | 'partial' | 'strong';

export interface WorkCapabilityDefinition {
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
}

export interface WorkCapabilitySearchMatch {
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
}

export interface WorkCapabilitySearchPayload {
	type: 'work_capability_search_results';
	query: string | null;
	filters: {
		domain: string | null;
		buildos_capability: string | null;
	};
	total_matches: number;
	matches: WorkCapabilitySearchMatch[];
	materialized_tools: string[];
	next_step: string;
}

export interface WorkCapabilityLoadPayload {
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
	notes?: string[];
	materialized_tools?: string[];
	next_step: string;
}
