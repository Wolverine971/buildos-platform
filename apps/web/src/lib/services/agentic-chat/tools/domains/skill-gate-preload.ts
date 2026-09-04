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
 *
 * Productivity allowlist (founder decision 2026-09-03): marketing, sales, and
 * writing-craft skills left the default chat runtime. Automatic preload is
 * restricted to PRODUCTIVITY_PRELOAD_ALLOWLIST; every other skill preloads only
 * on an explicit ask (isExplicitSkillAskTurn) and is otherwise refused with
 * `gate_suppressed_by: 'not_allowlisted'`. Domain sensing itself is unchanged —
 * craft domains still arrive as routing hints, and skill_search / skill_load
 * still reach every registered skill.
 */

import { loadSkill } from '../skills/skill-load';
import { getSkillById } from '../skills/registry';
import { isSkillHelpPayload, type SkillExample, type SkillHelpPayload } from '../skills/types';
import {
	getSkillGateCandidateSkillIds,
	hasExplicitSkillRequestShape,
	resolveSkillGateSuppression,
	type DomainSensingPreloadSource,
	type DomainSensingResult,
	type SkillGateSuppressionReason
} from './domain-sensing';
import {
	resolveOperationalSkillForTurn,
	type OperationalSkillId
} from './operational-skill-intent';

export type SkillGatePreloadSource = DomainSensingPreloadSource;

/**
 * Why a preload was admitted. `productivity_allowlist` is the automatic route,
 * `explicit_ask` is the narrow escape a craft skill has to earn per turn, and
 * `project_domain_affinity` is a persisted per-project selection the user
 * already made (it is not automatic sensing).
 */
export type SkillPreloadReason =
	| 'productivity_allowlist'
	| 'explicit_ask'
	| 'project_domain_affinity';

/**
 * Skills the runtime may preload automatically (founder decision 2026-09-03).
 * Everything else — marketing, sales, writing craft, design craft — preloads
 * only on an explicit ask. Marketing skills stay registered, searchable, and
 * loadable; they just stop riding into every turn's prompt for free.
 */
export const PRODUCTIVITY_PRELOAD_ALLOWLIST: readonly string[] = [
	'calendar_management',
	'context_engineering_for_agent_work',
	'document_workspace',
	'google_calendar',
	'people_context',
	'plan_management',
	'project_audit',
	'project_creation',
	'project_forecast',
	'research_capture',
	'task_management',
	'task_state_updates'
];

const PRODUCTIVITY_PRELOAD_ALLOWLIST_SET = new Set(PRODUCTIVITY_PRELOAD_ALLOWLIST);

export function isProductivityPreloadSkill(skillId: string | null | undefined): boolean {
	return PRODUCTIVITY_PRELOAD_ALLOWLIST_SET.has((skillId ?? '').trim().toLowerCase());
}

export type SkillGatePreload = {
	skillId: string;
	source: SkillGatePreloadSource;
	reason: SkillPreloadReason;
	format: 'short';
	payload: SkillHelpPayload;
	promptContent: string;
	materializedToolNames: string[];
};

/**
 * The no-preload shape keeps the telemetry the gate produced: `null` preload
 * plus the reason the chokepoint refused. `not_allowlisted` means the candidate
 * is a craft skill and this turn carried no explicit ask.
 */
export type SkillGatePreloadDecision = {
	preload: SkillGatePreload | null;
	gate_suppressed_by?: SkillGateSuppressionReason;
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
	return resolveSkillGatePreloadDecision(sensing, options).preload;
}

/**
 * The full decision, including why a candidate was refused. Callers that only
 * need the block keep using `resolveSkillGatePreload`; telemetry and tests read
 * `gate_suppressed_by` from here.
 */
export function resolveSkillGatePreloadDecision(
	sensing: DomainSensingResult | null | undefined,
	options: SkillPreloadOptions = {}
): SkillGatePreloadDecision {
	if (!sensing || sensing.skill_load_required !== true) {
		return {
			preload: null,
			...(sensing?.gate_suppressed_by
				? { gate_suppressed_by: sensing.gate_suppressed_by }
				: {})
		};
	}
	const candidates = getSkillGateCandidateSkillIds(sensing);
	const topCandidate = candidates[0]?.trim();
	if (!topCandidate) {
		return { preload: null };
	}
	return resolveSkillPreload(topCandidate, candidates.slice(1), 'domain_sensing', options, {
		explicitAsk: isExplicitSkillAskTurn(sensing)
	});
}

/**
 * An explicit ask, as ratified on 2026-09-03. All of:
 *   1. the sensed subject has strong coverage (a real playbook exists),
 *   2. the current message carries a request shape AND names the subject,
 *   3. no deterministic guard fired (narrow edits and direct reads are out).
 */
export function isExplicitSkillAskTurn(sensing: DomainSensingResult | null | undefined): boolean {
	if (!sensing || sensing.source !== 'current_user_message') return false;
	const message = sensing.query;
	if (!hasExplicitSkillRequestShape(message)) return false;
	if (resolveSkillGateSuppression(message) !== null) return false;
	const primaryDomain = sensing.active_domains[0];
	if (!primaryDomain) {
		// A BuildOS-native outcome card carries its own subject match.
		return sensing.candidate_outcome_cards[0]?.coverage_status === 'strong';
	}
	const namesSubject =
		primaryDomain.aliases_hit.length > 0 || primaryDomain.discriminative_hits > 0;
	return primaryDomain.coverage_status === 'strong' && namesSubject;
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
	return resolveSkillPreload(normalizedSkillId, [], 'project_domain_affinity', options, {
		explicitAsk: false
	}).preload;
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
	const preload = resolveSkillPreload(
		resolution.skillId,
		alternates,
		'operational_intent',
		{
			alreadyLoadedSkillIds: params.alreadyLoadedSkillIds,
			allowFollowupSkillLoad: false
		},
		{ explicitAsk: false }
	).preload;
	return preload ? { ...preload, skillId: resolution.skillId } : null;
}

/**
 * The single admission chokepoint. Every preload route lands here, so the
 * productivity allowlist is enforced in exactly one place.
 */
function resolvePreloadReason(
	skillId: string,
	source: SkillGatePreload['source'],
	admission: SkillPreloadAdmission
): SkillPreloadReason | null {
	if (isProductivityPreloadSkill(skillId)) return 'productivity_allowlist';
	// A persisted project domain profile is a selection the user already made
	// for this project; it is not the default runtime sensing this decision
	// restricts. The lexical and operational routes get no such pass.
	if (source === 'project_domain_affinity') return 'project_domain_affinity';
	return admission.explicitAsk ? 'explicit_ask' : null;
}

type SkillPreloadAdmission = {
	/** True when this turn earned a craft preload (see isExplicitSkillAskTurn). */
	explicitAsk: boolean;
};

function resolveSkillPreload(
	skillId: string,
	remainingCandidates: string[],
	source: SkillGatePreload['source'],
	options: SkillPreloadOptions,
	admission: SkillPreloadAdmission
): SkillGatePreloadDecision {
	const alreadyLoaded = new Set(
		(options.alreadyLoadedSkillIds ?? []).map((id) => id.trim().toLowerCase())
	);
	if (alreadyLoaded.has(skillId.toLowerCase())) {
		return { preload: null };
	}

	const reason = resolvePreloadReason(skillId, source, admission);
	if (!reason) {
		return { preload: null, gate_suppressed_by: 'not_allowlisted' };
	}

	const allowFollowupSkillLoad = options.allowFollowupSkillLoad !== false;
	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) {
		return { preload: null };
	}

	return {
		preload: {
			skillId: payload.id,
			source,
			reason,
			format: 'short',
			payload,
			promptContent: allowFollowupSkillLoad
				? renderPreloadedSkillPromptContent(payload, remainingCandidates)
				: renderWorkerPreloadedSkillPromptContent(payload, remainingCandidates),
			materializedToolNames: payload.materialized_tools ?? []
		}
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
