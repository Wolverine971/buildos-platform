// apps/web/src/lib/services/agentic-chat/tools/outcome-cards/types.ts
import type { DomainCoverageGap } from '../domains/types';
import type { SkillLoadFormat } from '../skills/types';

export type OutcomeCardCoverageStatus = 'none' | 'partial' | 'strong';

export interface OutcomeCardDefinition {
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
	coverageStatus: OutcomeCardCoverageStatus;
	gaps?: DomainCoverageGap[];
	notes?: string[];
}

export interface OutcomeCardSearchMatch {
	outcome_card_id: string;
	name: string;
	confidence: number;
	summary: string;
	domain_ids: string[];
	buildos_capability_ids: string[];
	default_skill_id?: string;
	skill_ids: string[];
	skill_load_formats: Record<string, SkillLoadFormat>;
	coverage_status: OutcomeCardCoverageStatus;
	load_hint: string;
}

export interface OutcomeCardSearchPayload {
	type: 'outcome_card_search_results';
	query: string | null;
	filters: {
		domain: string | null;
		buildos_capability: string | null;
	};
	total_matches: number;
	matches: OutcomeCardSearchMatch[];
	materialized_tools: string[];
	next_step: string;
}

export interface OutcomeCardLoadPayload {
	type: 'outcome_card';
	id: string;
	name: string;
	summary: string;
	domain_ids: string[];
	buildos_capability_ids: string[];
	when_to_use: string[];
	example_requests: string[];
	default_skill_id?: string;
	skill_ids: string[];
	skill_load_formats: Record<string, SkillLoadFormat>;
	resource_ids: string[];
	tool_hints: string[];
	outputs: string[];
	evaluation_criteria: string[];
	coverage_status: OutcomeCardCoverageStatus;
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
