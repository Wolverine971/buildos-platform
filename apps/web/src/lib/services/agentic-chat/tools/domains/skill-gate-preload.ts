// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts
/**
 * Skill-gate preload (WP-7, speed audit 2026-07-08).
 *
 * Domain sensing can know the top skill candidate before the first LLM pass,
 * and a persisted project-domain profile can supply it after project context
 * loads. Making the model call skill_load costs a full pass (and up to three
 * when post-hoc gate repair fires). The server loads the trusted candidate in
 * short format and injects it into the prompt instead — mirroring the existing
 * project_create preload precedent. Gate repair stays as the fallback for
 * sensing misses that have no trusted project affinity.
 *
 * Short format only: workflow, guardrails, and output contract keep the prompt
 * bounded. Full markdown would re-create the prompt bloat the audit is trying
 * to shrink; the model can still call skill_load with format 'full' when it
 * needs the deeper playbook.
 */

import { loadSkill } from '../skills/skill-load';
import { isSkillHelpPayload, type SkillHelpPayload } from '../skills/types';
import { getSkillGateCandidateSkillIds, type DomainSensingResult } from './domain-sensing';

export type SkillGatePreload = {
	skillId: string;
	source: 'domain_sensing' | 'project_domain_affinity';
	format: 'short';
	payload: SkillHelpPayload;
	promptContent: string;
	materializedToolNames: string[];
};

const PRELOAD_LIST_LIMIT = 6;
const PRELOAD_WHEN_TO_USE_LIMIT = 3;

type SkillPreloadOptions = {
	alreadyLoadedSkillIds?: string[];
};

export function resolveSkillGatePreload(
	sensing: DomainSensingResult | null | undefined,
	options: SkillPreloadOptions = {}
): SkillGatePreload | null {
	if (!sensing || sensing.skill_load_required !== true) {
		return null;
	}
	const candidates = getSkillGateCandidateSkillIds(sensing);
	const topCandidate = candidates[0]?.trim();
	if (!topCandidate) {
		return null;
	}
	return resolveSkillPreload(topCandidate, candidates.slice(1), 'domain_sensing', options);
}

/**
 * Preload a trusted skill selected by persisted project-domain affinity rather
 * than lexical sensing. The same loaded-skill ledger and short-format contract
 * apply, so affinity activation does not add an extra agent round trip.
 */
export function resolveSkillPreloadById(
	skillId: string | null | undefined,
	options: SkillPreloadOptions = {}
): SkillGatePreload | null {
	const normalizedSkillId = skillId?.trim();
	if (!normalizedSkillId) return null;
	return resolveSkillPreload(normalizedSkillId, [], 'project_domain_affinity', options);
}

function resolveSkillPreload(
	skillId: string,
	remainingCandidates: string[],
	source: SkillGatePreload['source'],
	options: SkillPreloadOptions
): SkillGatePreload | null {
	const alreadyLoaded = new Set(
		(options.alreadyLoadedSkillIds ?? []).map((id) => id.trim().toLowerCase())
	);
	if (alreadyLoaded.has(skillId.toLowerCase())) {
		return null;
	}

	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) {
		return null;
	}

	return {
		skillId: payload.id,
		source,
		format: 'short',
		payload,
		promptContent: renderPreloadedSkillPromptContent(payload, remainingCandidates),
		materializedToolNames: payload.materialized_tools ?? []
	};
}

function renderPreloadedSkillPromptContent(
	payload: SkillHelpPayload,
	remainingCandidates: string[]
): string {
	const lines: string[] = [
		`Preloaded skill: ${payload.id} (${payload.name}) — loaded at short format. It counts as loaded; do NOT call skill_load for it again at short format. Apply its workflow to this turn's work.`
	];

	// When-to-use is capped harder than the other lists (tasker/39 stage 4):
	// on a preload-satisfied turn routing already happened, so these lines are
	// confirmation, not selection — the workflow is the part that earns tokens.
	if (payload.when_to_use.length) {
		lines.push(
			'',
			'When to use:',
			...payload.when_to_use.slice(0, PRELOAD_WHEN_TO_USE_LIMIT).map((item) => `- ${item}`)
		);
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
