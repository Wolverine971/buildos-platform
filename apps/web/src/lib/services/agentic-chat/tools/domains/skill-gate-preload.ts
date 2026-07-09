// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts
/**
 * Skill-gate preload (WP-7, speed audit 2026-07-08).
 *
 * Domain sensing already knows the top skill candidate before the first LLM
 * pass; making the model call skill_load costs a full pass (and up to three
 * when the post-hoc gate repair fires). When the gate is active, the server
 * loads the top candidate in short format and injects it into the prompt
 * instead — mirroring the existing project_create preload precedent. The
 * gate repair machinery stays as the fallback for sensing misses.
 *
 * Short format only: workflow, guardrails, and output contract cost a few
 * hundred tokens. Full markdown (3.5k-8k tokens) would re-create the prompt
 * bloat the audit is trying to shrink; the model can still call skill_load
 * with format 'full' when it needs the deeper playbook.
 */

import { loadSkill } from '../skills/skill-load';
import { isSkillHelpPayload, type SkillHelpPayload } from '../skills/types';
import { getSkillGateCandidateSkillIds, type DomainSensingResult } from './domain-sensing';

export type SkillGatePreload = {
	skillId: string;
	format: 'short';
	payload: SkillHelpPayload;
	promptContent: string;
	materializedToolNames: string[];
};

const PRELOAD_LIST_LIMIT = 6;

export function resolveSkillGatePreload(
	sensing: DomainSensingResult | null | undefined,
	options: { alreadyLoadedSkillIds?: string[] } = {}
): SkillGatePreload | null {
	if (!sensing || sensing.skill_load_required !== true) {
		return null;
	}
	const candidates = getSkillGateCandidateSkillIds(sensing);
	const topCandidate = candidates[0]?.trim();
	if (!topCandidate) {
		return null;
	}
	const alreadyLoaded = new Set(
		(options.alreadyLoadedSkillIds ?? []).map((id) => id.trim().toLowerCase())
	);
	if (alreadyLoaded.has(topCandidate.toLowerCase())) {
		return null;
	}

	const payload = loadSkill(topCandidate, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) {
		return null;
	}

	return {
		skillId: payload.id,
		format: 'short',
		payload,
		promptContent: renderPreloadedSkillPromptContent(payload, candidates.slice(1)),
		materializedToolNames: payload.materialized_tools ?? []
	};
}

function renderPreloadedSkillPromptContent(
	payload: SkillHelpPayload,
	remainingCandidates: string[]
): string {
	const lines: string[] = [
		`Preloaded skill: ${payload.id} (${payload.name}) — loaded at short format. It counts as loaded; do NOT call skill_load for it again. Apply its workflow to this turn's work.`
	];

	if (payload.when_to_use.length) {
		lines.push('', 'When to use:', ...clip(payload.when_to_use).map((item) => `- ${item}`));
	}
	if (payload.workflow.length) {
		lines.push('', 'Workflow:', ...payload.workflow.map((step) => `- ${step}`));
	}
	if (payload.guardrails?.length) {
		lines.push('', 'Guardrails:', ...clip(payload.guardrails).map((item) => `- ${item}`));
	}
	if (payload.output_contract) {
		lines.push('', `Output contract: ${payload.output_contract}`);
	}
	if (payload.child_skills?.length) {
		lines.push(
			'',
			`Linked child skills (load via skill_load only if this turn needs them): ${payload.child_skills
				.map((child) => child.id)
				.slice(0, PRELOAD_LIST_LIMIT)
				.join(', ')}`
		);
	}
	lines.push(
		'',
		`Need more depth? Call skill_load with reference '${payload.id}' and format 'full' for the complete playbook.`
	);
	if (remainingCandidates.length) {
		lines.push(
			`Alternate skill candidates if this one does not fit: ${remainingCandidates.join(', ')}.`
		);
	}

	return lines.join('\n');
}

function clip(items: string[]): string[] {
	return items.slice(0, PRELOAD_LIST_LIMIT);
}
