// apps/web/src/lib/services/agentic-chat/tools/outcome-cards/outcome-card-load.ts
import { getOutcomeCardById, listOutcomeCards } from './catalog';
import { getRecommendedSkillLoadFormat } from '../skills/skill-load';
import { getSkillById } from '../skills/registry';
import type { SkillLoadFormat } from '../skills/types';
import type { OutcomeCardDefinition, OutcomeCardLoadPayload } from './types';

function materializedToolsFor(capability: OutcomeCardDefinition): string[] {
	const tools: string[] = [];
	if (capability.skillIds.length > 0) {
		tools.push('skill_load');
	}
	if ((capability.resourceIds?.length ?? 0) > 0) {
		tools.push('resource_search');
	}
	return tools;
}

function buildSkillLoadFormats(capability: OutcomeCardDefinition): Record<string, SkillLoadFormat> {
	const formats: Record<string, SkillLoadFormat> = {};
	const skillIds = Array.from(
		new Set([capability.defaultSkillId, ...capability.skillIds].filter(Boolean))
	);
	for (const skillId of skillIds) {
		if (typeof skillId !== 'string') continue;
		const skill = getSkillById(skillId);
		if (skill) formats[skillId] = getRecommendedSkillLoadFormat(skill);
	}
	return formats;
}

export function loadOutcomeCard(
	outcomeCardId: string
): OutcomeCardLoadPayload | Record<string, unknown> {
	const id = outcomeCardId.trim();
	const capability = getOutcomeCardById(id);
	if (!capability) {
		return {
			type: 'not_found',
			outcome_card: id,
			available_outcome_cards: listOutcomeCards()
				.slice(0, 20)
				.map((item) => ({
					id: item.id,
					name: item.name,
					coverage_status: item.coverageStatus
				})),
			message: 'No outcome card found for this id.'
		};
	}

	const payload: OutcomeCardLoadPayload = {
		type: 'outcome_card',
		id: capability.id,
		name: capability.name,
		summary: capability.summary,
		domain_ids: capability.domainIds,
		buildos_capability_ids: capability.buildosCapabilityIds,
		when_to_use: capability.whenToUse,
		example_requests: capability.exampleRequests,
		default_skill_id: capability.defaultSkillId,
		skill_ids: capability.skillIds,
		skill_load_formats: buildSkillLoadFormats(capability),
		resource_ids: capability.resourceIds ?? [],
		tool_hints: capability.toolHints ?? [],
		outputs: capability.outputs,
		evaluation_criteria: capability.evaluationCriteria ?? [],
		coverage_status: capability.coverageStatus,
		gaps:
			capability.gaps?.map((gap) => ({
				missing_skill_id: gap.missingSkillId,
				missing_resource_id: gap.missingResourceId,
				user_need: gap.userNeed,
				summary: gap.summary
			})) ?? [],
		materialized_tools: materializedToolsFor(capability),
		next_step:
			'Use this as an outcome card. Load the default/root skill only when the current turn needs workflow guidance; search resources only when source detail would materially improve the answer.'
	};

	if (payload.materialized_tools?.length === 0) {
		delete payload.materialized_tools;
	}
	if (capability.notes?.length) {
		payload.notes = capability.notes;
	}

	return payload;
}
