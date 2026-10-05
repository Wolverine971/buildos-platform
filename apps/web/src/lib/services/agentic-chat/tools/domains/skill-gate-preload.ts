// apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts
/**
 * Skill-gate preload (WP-7, speed audit 2026-07-08).
 *
 * Domain sensing can know the top skill candidate before the first LLM pass.
 * Making the model call skill_load costs a full pass. The server loads the
 * trusted candidate in short format and injects it into the prompt instead —
 * mirroring the existing project_create preload precedent.
 *
 * Lane-aware rendering (2026-09-02 turn executor audit, Finding 4 / lane D
 * P1-3, P2-1): the web lane keeps the short block because the model can call
 * skill_load with format 'full' for depth. The reviewed worker lane has no
 * such escape, so its block is a plain playbook under a one-line heading: the
 * core blocks, the worked example that matches the turn's intent (update by
 * exact id when nothing says otherwise), the Judgment block when the skill
 * explicitly asks for `recommended_load_format: full`, capped by characters
 * (~1,500 tokens) rather than by block type. No gate wording, no skill_load,
 * no note about reference modules the worker cannot load
 * (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F71).
 *
 * Operational skills (task_management, document_workspace, plan_management,
 * calendar_management) are in no domain or outcome card, so they arrive via the
 * deterministic intent map in operational-skill-intent.ts rather than sensing,
 * and they render on
 * every turn their intent fires: the system prompt is rebuilt per turn, so a
 * per-window dedupe just removed the playbook from the next write turn (F69).
 * Craft preloads (sensing, explicit ask) are one-shot and still dedupe against
 * the skills the history window already showed.
 *
 * Productivity allowlist (founder decision 2026-09-03): marketing, sales, and
 * writing-craft skills left the default chat runtime. Automatic preload is
 * restricted to PRODUCTIVITY_PRELOAD_ALLOWLIST; every other skill preloads only
 * on an explicit ask (isExplicitSkillAskTurn) and is otherwise refused with
 * `gate_suppressed_by: 'not_allowlisted'`. Domain sensing itself is unchanged —
 * craft domains still arrive as routing hints, and skill_search / skill_load
 * still reach every registered skill.
 *
 * Two more admission rules (2026-10-04):
 * - Mounted tools. On the worker, a skill whose declared tools
 *   (`materialized_tools`) are all absent from the turn's surface is refused
 *   with `gate_suppressed_by: 'tools_unmounted'`: its playbook would commission
 *   calls the turn cannot make (people_context's contact tools have no worker
 *   adapter). A skill that declares no tools is advisory and always passes.
 * - User launch. A skill the user picked before the chat opened (the public
 *   "Try in BuildOS" link) arrives as the structured `requestedSkillId` on the
 *   launch's first turn, is trusted only once it resolves in the registry, and
 *   preloads with source `user_launch` regardless of the allowlist.
 *
 * Focused table (BuildOS Tables, 2026-10-04): when the chat's focused entity
 * is a table document (a structured fact from the prepared context, never the
 * message text), table_workspace preloads with source `focused_entity`, and
 * this turn's operational write playbook (task follow-ups, say) rides along
 * as a companion. Table words never enter operational-skill-intent.ts.
 */

import { isTableTypeKey } from '@buildos/shared-agent-ops/tables';
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
	type OperationalExampleHint,
	type OperationalSkillId
} from './operational-skill-intent';

export type SkillGatePreloadSource = DomainSensingPreloadSource;

/**
 * Why a preload was admitted. `productivity_allowlist` is the automatic route,
 * `explicit_ask` is the narrow escape a craft skill has to earn per turn, and
 * `user_launch` is a skill the user picked before the chat opened.
 */
export type SkillPreloadReason = 'productivity_allowlist' | 'explicit_ask' | 'user_launch';

/** Why a candidate was refused: a sensing guard, the allowlist, or the surface. */
export type SkillPreloadRefusalReason = SkillGateSuppressionReason | 'tools_unmounted';

/**
 * Skills the runtime may preload automatically (founder decision 2026-09-03).
 * Everything else — marketing, sales, writing craft, design craft — preloads
 * only on an explicit ask. Marketing skills stay registered, searchable, and
 * loadable; they just stop riding into every turn's prompt for free.
 *
 * Only skills a preload route can actually reach are listed: the four
 * operational skills whose write tools are mounted on a worker surface (plan,
 * goal, milestone, and risk writes joined both surfaces on 2026-09-18) and the
 * project_audit outcome card. A skill in no domain, outcome card, or intent
 * kind — or whose tools are on no surface — cannot fire and does not belong
 * here (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F70). context_engineering_for_
 * agent_work and project_forecast left on 2026-10-04: neither ever fired and
 * neither is a BuildOS user job; an explicit ask still reaches them.
 * table_workspace joined on 2026-10-04 (BuildOS Tables): the focused-table
 * route reaches it and its tools are mounted on the project surface.
 * skill_search / skill_load and the external gateway are unaffected.
 */
export const PRODUCTIVITY_PRELOAD_ALLOWLIST: readonly string[] = [
	'calendar_management',
	'document_workspace',
	'plan_management',
	'project_audit',
	'table_workspace',
	'task_management'
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
	/**
	 * Other playbooks rendered in the same block. A user-launched skill keeps
	 * this turn's operational write playbook beside it instead of dropping it.
	 */
	companionSkillIds?: string[];
};

/**
 * The no-preload shape keeps the telemetry the gate produced: `null` preload
 * plus the reason the chokepoint refused. `not_allowlisted` means the candidate
 * is a craft skill and this turn carried no explicit ask.
 */
export type SkillGatePreloadDecision = {
	preload: SkillGatePreload | null;
	gate_suppressed_by?: SkillPreloadRefusalReason;
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
	/** Worker-lane heading; defaults to a generic playbook line naming the skill. */
	workerHeading?: string;
	/** Worker-lane example selection; falls back to the first example. */
	workerExampleHint?: OperationalExampleHint | null;
	/**
	 * Worker lane: the tool names mounted this turn. A skill whose declared
	 * tools are all absent is refused (see skillToolsAreMounted).
	 */
	mountedToolNames?: readonly string[];
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
	// Generic email capture/newsletter language is not an outreach commission.
	return resolveSkillPreload(topCandidate, candidates.slice(1), 'domain_sensing', options, {
		explicitAsk:
			isExplicitSkillAskTurn(sensing) &&
			(!topCandidate.startsWith('cold_email_') ||
				/\b(?:cold[\s_-]+(?:email|outreach)|outbound|prospects?|prospecting|outreach|first[ -](?:contact|touch))\b/iu.test(
					sensing.query
				))
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
 * Deterministic operational preload for the reviewed worker lane: the message's
 * mutation intent picks the skill, the mounted tools decide eligibility. When a
 * craft (domain-sensing) candidate also fired, it rides along as an alternate
 * so the model can still see the other route without a second block. There is
 * deliberately no already-loaded dedupe here: an operational playbook is this
 * turn's write rules, and the prompt that carried it last turn is gone.
 */
export function resolveOperationalSkillPreload(params: {
	message: string | null | undefined;
	toolNames: readonly string[];
	craftAlternateSkillIds?: string[];
}): (SkillGatePreload & { skillId: OperationalSkillId }) | null {
	// An entity whose playbook this turn cannot preload (off the allowlist, or
	// its tools unmounted) falls through to the next sensed entity instead of
	// ending the route with no playbook at all.
	const resolution = resolveOperationalSkillForTurn({
		message: params.message,
		toolNames: params.toolNames,
		isSkillEligible: (skillId) =>
			isProductivityPreloadSkill(skillId) &&
			isSkillPreloadableOnTools(skillId, params.toolNames)
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
			allowFollowupSkillLoad: false,
			workerHeading: `Playbook for ${resolution.entityKind} writes this turn:`,
			workerExampleHint: resolution.exampleHint,
			mountedToolNames: params.toolNames
		},
		{ explicitAsk: false }
	).preload;
	return preload ? { ...preload, skillId: resolution.skillId } : null;
}

/**
 * A skill the user picked before the chat opened (the public "Try in BuildOS"
 * link), carried as the structured `requestedSkillId` on the launch's first
 * turn. The client value is only a request: it must resolve in the registry,
 * and the skill's tools must be mounted. It skips the productivity allowlist —
 * a deliberate pick is the most explicit ask there is. When this turn's
 * operational write playbook fired for a different skill, both render, the
 * chosen skill first: dropping either would silently lose the user's pick or
 * the write rules this turn's mutations depend on.
 */
export function resolveUserLaunchSkillPreload(params: {
	skillId: string | null | undefined;
	toolNames: readonly string[];
	operationalPreload?: SkillGatePreload | null;
}): SkillGatePreloadDecision {
	const requestedId = (params.skillId ?? '').trim().toLowerCase();
	const skill = requestedId ? getSkillById(requestedId) : undefined;
	if (!skill) return { preload: null };
	const operational = params.operationalPreload ?? null;
	if (operational?.skillId === skill.id) {
		return { preload: { ...operational, source: 'user_launch', reason: 'user_launch' } };
	}
	const decision = resolveSkillPreload(
		skill.id,
		[],
		'user_launch',
		{
			allowFollowupSkillLoad: false,
			workerHeading: `Playbook the user chose for this chat (${skill.name}):`,
			mountedToolNames: params.toolNames
		},
		{ explicitAsk: false, userLaunch: true }
	);
	if (!decision.preload || !operational) return decision;
	return {
		preload: {
			...decision.preload,
			promptContent: `${decision.preload.promptContent}\n\n${operational.promptContent}`,
			materializedToolNames: uniqueIds([
				...decision.preload.materializedToolNames,
				...operational.materializedToolNames
			]),
			companionSkillIds: [operational.skillId]
		}
	};
}

export const TABLE_WORKSPACE_SKILL_ID = 'table_workspace';

/**
 * True when a prepared chat context (`{ data: { focus_entity_type,
 * focus_entity_full } }`) is focused on a table document. Reads the structured
 * focus (entity type + type_key), never the message; the worker reads the same
 * fields for its table tool pins (request-builders.ts
 * focusedTableIdFromContextPayload).
 */
export function isFocusedTableContextPayload(contextPayload: unknown): boolean {
	const record = (value: unknown): Record<string, unknown> | null =>
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	const data = record(record(contextPayload)?.data);
	if (!data || data.focus_entity_type !== 'document') return false;
	const typeKey = record(data.focus_entity_full)?.type_key;
	return typeof typeKey === 'string' && isTableTypeKey(typeKey);
}

/**
 * The table playbook for a turn whose focused entity is a table (structured:
 * the caller reads the prepared context's focus entity type_key). It leads the
 * block; an operational playbook for a different skill renders right after it,
 * because "make follow-up tasks for anything in Interview" needs both the table
 * read rules and the task write rules.
 */
export function resolveFocusedTableSkillPreload(params: {
	focusedTable: boolean;
	toolNames: readonly string[];
	operationalPreload?: SkillGatePreload | null;
}): SkillGatePreload | null {
	if (!params.focusedTable) return null;
	const operational = params.operationalPreload ?? null;
	if (operational?.skillId === TABLE_WORKSPACE_SKILL_ID) return operational;
	const preload = resolveSkillPreload(
		TABLE_WORKSPACE_SKILL_ID,
		[],
		'focused_entity',
		{
			allowFollowupSkillLoad: false,
			workerHeading: 'Playbook for the table in focus:',
			mountedToolNames: params.toolNames
		},
		{ explicitAsk: false }
	).preload;
	if (!preload) return operational;
	if (!operational) return preload;
	return {
		...preload,
		promptContent: `${preload.promptContent}\n\n${operational.promptContent}`,
		materializedToolNames: uniqueIds([
			...preload.materializedToolNames,
			...operational.materializedToolNames
		]),
		companionSkillIds: [operational.skillId]
	};
}

/**
 * Structural surface check: a skill that declares tools needs at least one of
 * them mounted this turn, or its playbook can only commission calls the turn
 * cannot make. A skill that declares none is advisory and always passes.
 */
export function skillToolsAreMounted(
	payload: Pick<SkillHelpPayload, 'materialized_tools'>,
	mountedToolNames: readonly string[]
): boolean {
	const declared = payload.materialized_tools ?? [];
	if (declared.length === 0) return true;
	const mounted = new Set(mountedToolNames);
	return declared.some((name) => mounted.has(name));
}

function isSkillPreloadableOnTools(skillId: string, mountedToolNames: readonly string[]): boolean {
	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	return isSkillHelpPayload(payload) && skillToolsAreMounted(payload, mountedToolNames);
}

/**
 * The single admission chokepoint. Every preload route lands here, so the
 * productivity allowlist is enforced in exactly one place.
 */
function resolvePreloadReason(
	skillId: string,
	admission: SkillPreloadAdmission
): SkillPreloadReason | null {
	if (admission.userLaunch) return 'user_launch';
	if (isProductivityPreloadSkill(skillId)) return 'productivity_allowlist';
	return admission.explicitAsk ? 'explicit_ask' : null;
}

type SkillPreloadAdmission = {
	/** True when this turn earned a craft preload (see isExplicitSkillAskTurn). */
	explicitAsk: boolean;
	/** True for a registry-resolved skill the user picked at chat launch. */
	userLaunch?: boolean;
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

	const reason = resolvePreloadReason(skillId, admission);
	if (!reason) {
		return { preload: null, gate_suppressed_by: 'not_allowlisted' };
	}

	const allowFollowupSkillLoad = options.allowFollowupSkillLoad !== false;
	const payload = loadSkill(skillId, { format: 'short', surface: 'chat_internal' });
	if (!isSkillHelpPayload(payload)) {
		return { preload: null };
	}
	if (options.mountedToolNames && !skillToolsAreMounted(payload, options.mountedToolNames)) {
		return { preload: null, gate_suppressed_by: 'tools_unmounted' };
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
				: renderWorkerPreloadedSkillPromptContent(payload, remainingCandidates, {
						heading:
							options.workerHeading ?? `Playbook for this turn (${payload.name}):`,
						exampleHint: options.workerExampleHint ?? null
					}),
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
 * the model will ever see for the turn. A one-line heading, then Procedure +
 * Policy + Contract, the worked example that matches the turn's intent, an
 * explicit `full` recommendation pulls the Judgment block in, and the result
 * is capped by characters. Exported only so tests can render skills no
 * admission route reaches; production callers go through resolveSkillPreload.
 */
export function renderWorkerPreloadedSkillPromptContent(
	payload: SkillHelpPayload,
	remainingCandidates: string[],
	options: { heading: string; exampleHint: OperationalExampleHint | null }
): string {
	const lines: string[] = [options.heading];
	const judgment = resolveExplicitFullJudgmentBlock(payload.id);
	if (judgment) {
		lines.push('', 'Judgment:', judgment);
	}
	pushCoreBlocks(lines, payload);
	const example = selectWorkerExample(payload.examples, options.exampleHint);
	if (example) {
		lines.push('', 'Worked example:', ...renderExampleLines(example));
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

/**
 * The example whose title opens with the turn's verb (create / update /
 * organize); otherwise the first, which the operational skills keep as the
 * update-by-exact-id case.
 */
function selectWorkerExample(
	examples: SkillExample[] | undefined,
	hint: OperationalExampleHint | null
): SkillExample | undefined {
	if (!examples?.length) return undefined;
	if (hint) {
		const match = examples.find((example) =>
			example.description.trim().toLowerCase().startsWith(hint)
		);
		if (match) return match;
	}
	return examples[0];
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
