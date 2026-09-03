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
 * Lane-aware rendering (2026-09-02 turn executor audit, Finding 4 / lane D
 * P1-3, P2-1): the web lane keeps the short block because the model can call
 * skill_load with format 'full' for depth. The reviewed worker lane has no
 * such escape, so its block also carries the first worked example, inlines the
 * Judgment block when the skill explicitly asks for `recommended_load_format:
 * full`, says plainly that reference modules and child skills are unavailable,
 * and is capped by characters (~1,500 tokens) rather than by block type.
 *
 * Operational skills (task_management, document_workspace, plan_management,
 * calendar_management) are in no domain or outcome card, so they arrive via the
 * deterministic intent map in operational-skill-intent.ts rather than sensing.
 */

import { loadSkill } from '../skills/skill-load';
import { getSkillById } from '../skills/registry';
import { isSkillHelpPayload, type SkillExample, type SkillHelpPayload } from '../skills/types';
import {
	getSkillGateCandidateSkillIds,
	type DomainSensingPreloadSource,
	type DomainSensingResult
} from './domain-sensing';
import {
	resolveOperationalSkillForTurn,
	type OperationalSkillId
} from './operational-skill-intent';

export type SkillGatePreloadSource = DomainSensingPreloadSource;

export type SkillGatePreload = {
	skillId: string;
	source: SkillGatePreloadSource;
	format: 'short';
	payload: SkillHelpPayload;
	promptContent: string;
	materializedToolNames: string[];
};

const PRELOAD_LIST_LIMIT = 6;
const PRELOAD_WHEN_TO_USE_LIMIT = 3;
/** Worker-lane budget: ~1,500 tokens at the repo's 4 chars/token estimator. */
export const WORKER_PRELOAD_MAX_CHARS = 6_000;
const WORKER_PRELOAD_EXAMPLE_MAX_LINES = 60;
const WORKER_PRELOAD_JUDGMENT_MAX_CHARS = 1_800;
const WORKER_PRELOAD_TRUNCATION_MARKER = '[Playbook truncated for prompt budget.]';

type SkillPreloadOptions = {
	alreadyLoadedSkillIds?: string[];
	/** Keep false for runtimes that can consume a preload but cannot execute skill_load. */
	allowFollowupSkillLoad?: boolean;
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

/**
 * Deterministic operational preload for the reviewed worker lane: the message's
 * mutation intent picks the skill, the mounted tools decide eligibility. When a
 * craft (domain-sensing) candidate also fired, it rides along as an alternate
 * so the model can still see the other route without a second block.
 */
export function resolveOperationalSkillPreload(params: {
	message: string | null | undefined;
	toolNames: readonly string[];
	craftAlternateSkillIds?: string[];
	alreadyLoadedSkillIds?: string[];
}): (SkillGatePreload & { skillId: OperationalSkillId }) | null {
	const resolution = resolveOperationalSkillForTurn({
		message: params.message,
		toolNames: params.toolNames
	});
	if (!resolution) return null;
	const alternates = uniqueIds([
		...resolution.alternateSkillIds,
		...(params.craftAlternateSkillIds ?? [])
	]).filter((id) => id !== resolution.skillId);
	const preload = resolveSkillPreload(resolution.skillId, alternates, 'operational_intent', {
		alreadyLoadedSkillIds: params.alreadyLoadedSkillIds,
		allowFollowupSkillLoad: false
	});
	return preload ? { ...preload, skillId: resolution.skillId } : null;
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

	const allowFollowupSkillLoad = options.allowFollowupSkillLoad !== false;
	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) {
		return null;
	}

	return {
		skillId: payload.id,
		source,
		format: 'short',
		payload,
		promptContent: allowFollowupSkillLoad
			? renderPreloadedSkillPromptContent(payload, remainingCandidates)
			: renderWorkerPreloadedSkillPromptContent(payload, remainingCandidates),
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
	pushCoreBlocks(lines, payload);
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
		`Need more depth? Call skill_load with {"skill":"${payload.id}","format":"full"} for the complete playbook.`
	);
	if (remainingCandidates.length) {
		lines.push(
			`Alternate skill candidates if this one does not fit: ${remainingCandidates.join(', ')}.`
		);
	}

	return lines.join('\n');
}

/**
 * Worker-lane block: no follow-up calls exist, so this is the whole playbook
 * the model will ever see for the turn. Procedure + Policy + Contract stay,
 * the first worked example is added, an explicit `full` recommendation pulls
 * the Judgment block in, and the result is capped by characters.
 */
function renderWorkerPreloadedSkillPromptContent(
	payload: SkillHelpPayload,
	remainingCandidates: string[]
): string {
	const lines: string[] = [
		`Preloaded skill: ${payload.id} (${payload.name}) — already loaded at short format. Apply its workflow directly to this turn's work.`
	];
	const judgment = resolveExplicitFullJudgmentBlock(payload.id);
	if (judgment) {
		lines.push('', 'Judgment:', judgment);
	}
	pushCoreBlocks(lines, payload);
	const example = payload.examples?.[0];
	if (example) {
		lines.push('', 'Worked example:', ...renderExampleLines(example));
	}
	if (payload.reference_modules?.length || payload.child_skills?.length) {
		lines.push(
			'',
			'Reference modules and child skills are not loadable on this surface; apply this playbook as written and state platform-specific claims as unverified.'
		);
	}
	if (remainingCandidates.length) {
		lines.push(
			'',
			`Alternate skill candidates if this one does not fit: ${remainingCandidates.join(', ')}.`
		);
	}

	return capPreloadContent(lines.join('\n'), WORKER_PRELOAD_MAX_CHARS);
}

function pushCoreBlocks(lines: string[], payload: SkillHelpPayload): void {
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
}

function renderExampleLines(example: SkillExample): string[] {
	const lines = [
		`- ${example.description}`,
		...example.next_steps.map((step) => `  - ${step}`)
	].filter((line) => line.trim().length > 0);
	return lines.slice(0, WORKER_PRELOAD_EXAMPLE_MAX_LINES);
}

/**
 * Only an explicit frontmatter `recommended_load_format: full` earns the
 * Judgment block. `preserve_markdown: true` alone derives `full` for 47/53
 * skills and would bloat every worker preload.
 */
function resolveExplicitFullJudgmentBlock(skillId: string): string | null {
	const skill = getSkillById(skillId);
	if (!skill || skill.recommendedLoadFormat !== 'full') return null;
	const markdown = skill.sourceMarkdown ?? skill.rawMarkdown;
	if (!markdown) return null;
	const body = `\n${markdown}`
		.split(/\n## /)
		.find((block) => /^Judgment\s*(?:\n|$)/.test(block))
		?.replace(/^Judgment\s*/, '')
		.trim();
	if (!body) return null;
	return body.length > WORKER_PRELOAD_JUDGMENT_MAX_CHARS
		? `${body.slice(0, WORKER_PRELOAD_JUDGMENT_MAX_CHARS).trimEnd()}\n${WORKER_PRELOAD_TRUNCATION_MARKER}`
		: body;
}

function capPreloadContent(content: string, maxChars: number): string {
	if (content.length <= maxChars) return content;
	const budget = maxChars - WORKER_PRELOAD_TRUNCATION_MARKER.length - 1;
	const head = content.slice(0, budget);
	const lastBreak = head.lastIndexOf('\n');
	const cut = lastBreak > budget * 0.6 ? head.slice(0, lastBreak) : head;
	return `${cut.trimEnd()}\n${WORKER_PRELOAD_TRUNCATION_MARKER}`;
}

function clip(items: string[]): string[] {
	return items.slice(0, PRELOAD_LIST_LIMIT);
}

function uniqueIds(ids: string[]): string[] {
	return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}
