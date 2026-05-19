// apps/web/src/lib/services/agentic-chat/tools/work-capabilities/work-capability-load.ts
import { getWorkCapabilityById, listWorkCapabilities } from './catalog';
import type { WorkCapabilityDefinition, WorkCapabilityLoadPayload } from './types';

function materializedToolsFor(capability: WorkCapabilityDefinition): string[] {
	const tools: string[] = [];
	if (capability.skillIds.length > 0) {
		tools.push('skill_load');
	}
	if ((capability.resourceIds?.length ?? 0) > 0) {
		tools.push('resource_search');
	}
	return tools;
}

export function loadWorkCapability(
	workCapabilityId: string
): WorkCapabilityLoadPayload | Record<string, unknown> {
	const id = workCapabilityId.trim();
	const capability = getWorkCapabilityById(id);
	if (!capability) {
		return {
			type: 'not_found',
			work_capability: id,
			available_work_capabilities: listWorkCapabilities()
				.slice(0, 20)
				.map((item) => ({
					id: item.id,
					name: item.name,
					coverage_status: item.coverageStatus
				})),
			message: 'No work capability found for this id.'
		};
	}

	const payload: WorkCapabilityLoadPayload = {
		type: 'work_capability',
		id: capability.id,
		name: capability.name,
		summary: capability.summary,
		domain_ids: capability.domainIds,
		buildos_capability_ids: capability.buildosCapabilityIds,
		when_to_use: capability.whenToUse,
		example_requests: capability.exampleRequests,
		default_skill_id: capability.defaultSkillId,
		skill_ids: capability.skillIds,
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
