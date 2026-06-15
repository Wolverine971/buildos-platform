// apps/web/src/lib/services/agentic-chat/tools/domains/types.ts
export type DomainCoverageStatus = 'none' | 'partial' | 'strong';

export interface DomainSkillLink {
	id: string;
	useWhen: string;
}

export interface DomainResourceLink {
	id: string;
	title?: string;
	summary: string;
	whenToLoad: string[];
}

export interface DomainCoverageGap {
	missingSkillId?: string;
	missingResourceId?: string;
	userNeed: string;
	summary: string;
}

export interface DomainSkillStack {
	id: string;
	name: string;
	useWhen: string;
	skillIds: string[];
}

export interface DomainDefinition {
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
}

export interface DomainSearchMatch {
	domain_id: string;
	name: string;
	confidence: number;
	coverage_status: DomainCoverageStatus;
	parent_ids: string[];
	aliases_hit: string[];
	skill_ids: string[];
	outcome_card_ids: string[];
	related_domain_ids: string[];
	next_step: string;
}

export interface DomainSearchPayload {
	type: 'domain_search_results';
	query: string | null;
	total_matches: number;
	matches: DomainSearchMatch[];
	materialized_tools: string[];
	next_step: string;
}

export interface DomainLoadPayload {
	type: 'domain';
	domain_id: string;
	name: string;
	summary: string;
	coverage_status: DomainCoverageStatus;
	parent_ids: string[];
	child_domains: Array<{
		id: string;
		name: string;
		coverage_status: DomainCoverageStatus;
		summary: string;
	}>;
	related_domain_ids: string[];
	boundaries: string[];
	capability_ids: string[];
	outcome_card_ids: string[];
	skills: Array<{
		id: string;
		use_when: string;
	}>;
	recommended_skill_stacks: Array<{
		id: string;
		name: string;
		use_when: string;
		skill_ids: string[];
	}>;
	resources: Array<{
		id: string;
		title?: string;
		summary: string;
		when_to_load: string[];
	}>;
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
