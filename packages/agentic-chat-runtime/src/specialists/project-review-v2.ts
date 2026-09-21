// packages/agentic-chat-runtime/src/specialists/project-review-v2.ts
import { AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2 } from '@buildos/shared-types';
import { createSpecialistRegistryV1 } from './registry';
import { PROJECT_REVIEW_SPECIALISTS_V1 } from './project-review-v1';
import { SPECIALIST_REGISTRY_V4 } from './document-organization';

/** Frozen definitions: change the version, not these instructions, when evolving the recipe. */
const evidenceRules = `
The project-review evidence recipe includes bounded saved risks, relationships, activity, prior suggestions and relevant document excerpts. Inspect each family's coverage and each document's content_coverage. An absent, unavailable or truncated family is not evidence that no such records exist. Prior suggestions describe previous recommendations, not verified project facts. Excerpts cannot establish what an unread part of a document says.
Use only the supplied record versions. Distinguish recorded facts, supported interpretations and missing information. Return an explicit outcome: findings, no_material_findings, insufficient_evidence, or needs_clarification. Never manufacture a finding to satisfy the format. A clean review is limited to the inspected evidence. Every factual risk must cite supplied evidence. No changes have been made.`;

export const SPECIALIST_REGISTRY_V5 = createSpecialistRegistryV1([
	...SPECIALIST_REGISTRY_V4.list(),
	{
		...PROJECT_REVIEW_SPECIALISTS_V1.project_analyst,
		version: 2,
		knowledge: [
			{ id: 'saved_project_evidence', version: 2, source: 'prepared_project_context' }
		],
		outputContract: AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2,
		instructions: {
			system:
				PROJECT_REVIEW_SPECIALISTS_V1.project_analyst.instructions.system + evidenceRules,
			defaultAssignment:
				'Identify the most useful next decision or action using saved goals, milestones, dependencies, risks and document commitments. Explain which prerequisite matters and what evidence would change the recommendation. Use an honest no-finding outcome when appropriate.'
		}
	},
	{
		...PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer,
		version: 3,
		knowledge: [
			{ id: 'saved_project_evidence', version: 2, source: 'prepared_project_context' }
		],
		outputContract: AGENTIC_CHAT_WORKFLOW_ROLE_REPORT_VERSION_V2,
		instructions: {
			system: PROJECT_REVIEW_SPECIALISTS_V1.risk_reviewer.instructions.system + evidenceRules,
			defaultAssignment:
				'Independently stress-test the plan. Start with the saved risk register and dependency evidence; distinguish open risks from resolved issues. Identify consequential assumptions, contradictory commitments, early warning signals and proportionate mitigations. Missing evidence is not proof of failure.'
		}
	}
]);
export const PROJECT_REVIEW_SPECIALISTS_V2 = Object.freeze({
	project_analyst: SPECIALIST_REGISTRY_V5.resolve({ id: 'project_analyst', version: 2 }),
	risk_reviewer: SPECIALIST_REGISTRY_V5.resolve({ id: 'risk_reviewer', version: 3 })
});
export const PROJECT_REVIEW_EDITOR_TASK_V2 = `Answer the user's question using accepted specialist reports and supplied project evidence. Preserve each report's explicit outcome and evidence coverage. No material findings means none in the inspected evidence, not a guarantee about the entire project. If evidence is insufficient, state what is missing and the smallest useful next check. Do not invent claims to fill a section. Distinguish proposals from completed work. Name and link supplied project records; never expose bare IDs. Prioritize useful next decisions and meaningful uncertainty. Clearly label a review partial when a specialist failed.`;
