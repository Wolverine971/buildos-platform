// apps/worker/src/workers/agentic-chat/provider/turn-rules.ts
//
// "Rules for This Turn" on the worker lane (Q1, audit 2026-10-17).
//
// Until 2026-10-17 web admission picked the write playbook by scoring the
// user's message against a regex lexicon (operational-skill-intent.ts) and
// spliced it into the middle of the system prompt. A misfire put a write
// playbook on an analysis turn, the acting model proposed writes nobody asked
// for, and the reviewer bounced them (S5); and a per-turn block mid-prompt cut
// the provider's prefix cache short on every turn.
//
// Now admission ships, as appended prompt sections of the turn artifact:
//   - the turn rules it still owns (a user-launched skill, a focused table's
//     playbook, a pending-contract write recipe), marked
//     `slots.placement = 'after_user_message'` instead of rendered in the
//     system prompt, and
//   - one candidate per operational playbook whose write tools are mounted,
//     each with its worked examples, never selected by admission.
// The worker picks at most one candidate from Jev's structured write
// commission through the static table below, and appends the whole block as a
// system message AFTER the user message. Nothing here reads message text.
// The system prompt is now the same bytes every turn of a session, so a
// prepared prompt is reused byte-for-byte (the admission RPC's copy fence
// accepts an unchanged prompt plus appended sections).

import type { JsonObject } from '@buildos/shared-types';
import type { AgenticChatTurnProviderRequestV1 } from './contracts';
import { appendSystemInstruction } from './request-builders';
import type { AgenticChatWorkerExecutionInputV1 } from '../turn/execution-input';

/** Section id of the admission-owned turn rules (shared with build-lite-prompt.ts). */
export const TURN_RULES_SECTION_ID = 'situational_rules';
/** Placement slot that moves the turn rules after the user message. */
export const TURN_RULES_AFTER_USER_MESSAGE = 'after_user_message';
/** Section id of an operational playbook candidate (shared with web admission). */
export const OPERATIONAL_PLAYBOOK_CANDIDATE_SECTION_ID = 'operational_playbook_candidate';

export type OperationalPlaybookId =
	| 'plan_management'
	| 'document_workspace'
	| 'calendar_management'
	| 'task_management';

export type OperationalExampleHint = 'organize' | 'create' | 'update';

/**
 * Static map from Jev-commissioned write tools to the operational playbook.
 * Key order is precedence: the most specific playbook wins when a commission
 * spans families (plan_management covers the tasks under a plan; a document
 * or calendar change with a follow-up task keeps its own playbook). The plan
 * family follows plan_management's own Activation (goals, milestones, plans,
 * risks).
 */
export const OPERATIONAL_PLAYBOOK_WRITE_TOOLS: Readonly<
	Record<OperationalPlaybookId, readonly string[]>
> = Object.freeze({
	plan_management: [
		'create_onto_plan',
		'update_onto_plan',
		'create_onto_goal',
		'update_onto_goal',
		'create_onto_milestone',
		'update_onto_milestone',
		'create_onto_risk',
		'update_onto_risk'
	],
	document_workspace: ['create_onto_document', 'update_onto_document', 'move_document_in_tree'],
	calendar_management: [
		'create_calendar_event',
		'update_calendar_event',
		'delete_calendar_event',
		'set_project_calendar'
	],
	task_management: ['create_onto_task', 'update_onto_task', 'move_onto_task']
});

/** Which worked example to show, from the commissioned tools (organize > create > update). */
const ORGANIZE_TOOLS = new Set(['move_document_in_tree', 'move_onto_task']);
const CREATE_TOOLS = new Set(
	Object.values(OPERATIONAL_PLAYBOOK_WRITE_TOOLS)
		.flat()
		.filter((name) => name.startsWith('create_'))
);

const MAX_RULES_CHARS = 8_000;
const MAX_PLAYBOOK_CHARS = 8_000;

export type OperationalPlaybookCandidate = {
	skillId: OperationalPlaybookId;
	content: string;
	examples: Partial<Record<OperationalExampleHint, string>>;
};

export type TurnRulesInput = {
	/** Admission-owned rules for after the user message, or null. */
	rules: string | null;
	candidates: OperationalPlaybookCandidate[];
};

/** Read the structured sections admission appended to the artifact. */
export function readTurnRulesInput(
	executionInput: Pick<AgenticChatWorkerExecutionInputV1, 'artifact'>
): TurnRulesInput {
	const sections = executionInput.artifact.prepared.promptSections;
	let rules: string | null = null;
	const candidates: OperationalPlaybookCandidate[] = [];
	for (const section of Array.isArray(sections) ? sections : []) {
		if (!isRecord(section)) continue;
		const slots = isRecord(section.slots) ? section.slots : {};
		if (
			section.id === TURN_RULES_SECTION_ID &&
			slots.placement === TURN_RULES_AFTER_USER_MESSAGE &&
			typeof section.content === 'string' &&
			section.content.trim()
		) {
			rules = section.content.trim().slice(0, MAX_RULES_CHARS);
			continue;
		}
		if (section.id !== OPERATIONAL_PLAYBOOK_CANDIDATE_SECTION_ID) continue;
		const skillId = slots.skillId;
		if (
			typeof skillId !== 'string' ||
			!Object.hasOwn(OPERATIONAL_PLAYBOOK_WRITE_TOOLS, skillId) ||
			typeof section.content !== 'string' ||
			!section.content.trim() ||
			candidates.some((candidate) => candidate.skillId === skillId)
		) {
			continue;
		}
		const examples: OperationalPlaybookCandidate['examples'] = {};
		if (isRecord(slots.examples)) {
			for (const hint of ['organize', 'create', 'update'] as const) {
				const example = slots.examples[hint];
				if (typeof example === 'string' && example.trim()) examples[hint] = example.trim();
			}
		}
		candidates.push({
			skillId: skillId as OperationalPlaybookId,
			content: section.content.trim(),
			examples
		});
	}
	return { rules, candidates };
}

/**
 * The operational playbook Jev's commission selects, or null: no commission
 * (a read turn, or Jev did not classify), or no mounted playbook for the
 * commissioned family.
 */
export function selectOperationalPlaybook(
	commissionedWriteToolNames: readonly string[],
	candidates: readonly OperationalPlaybookCandidate[]
): { candidate: OperationalPlaybookCandidate; hint: OperationalExampleHint } | null {
	if (commissionedWriteToolNames.length === 0) return null;
	const commissioned = new Set(commissionedWriteToolNames);
	for (const [skillId, tools] of Object.entries(OPERATIONAL_PLAYBOOK_WRITE_TOOLS)) {
		if (!tools.some((name) => commissioned.has(name))) continue;
		const candidate = candidates.find((entry) => entry.skillId === skillId);
		if (!candidate) continue;
		// The example follows this family's commissioned tools only: a task create
		// beside a document update must not show the document playbook's create.
		const familyTools = tools.filter((name) => commissioned.has(name));
		const hint: OperationalExampleHint = familyTools.some((name) => ORGANIZE_TOOLS.has(name))
			? 'organize'
			: familyTools.some((name) => CREATE_TOOLS.has(name))
				? 'create'
				: 'update';
		return { candidate, hint };
	}
	return null;
}

export function renderOperationalPlaybook(
	candidate: OperationalPlaybookCandidate,
	hint: OperationalExampleHint
): string {
	const example =
		candidate.examples[hint] ??
		candidate.examples.update ??
		candidate.examples.create ??
		candidate.examples.organize ??
		null;
	const rendered = example
		? `${candidate.content}\n\nWorked example:\n${example}`
		: candidate.content;
	return rendered.slice(0, MAX_PLAYBOOK_CHARS);
}

/**
 * Append the turn's rules after the user message (opening pass, after Jev).
 * Continuations inherit the message, so the rules hold for the whole turn.
 */
export function appendTurnRules(
	request: AgenticChatTurnProviderRequestV1,
	executionInput: Pick<AgenticChatWorkerExecutionInputV1, 'artifact'>
): { request: AgenticChatTurnProviderRequestV1; playbookSkillId: OperationalPlaybookId | null } {
	const input = readTurnRulesInput(executionInput);
	const selected = selectOperationalPlaybook(
		request.commissionedWriteToolNames ?? [],
		input.candidates
	);
	const blocks = [
		input.rules,
		selected ? renderOperationalPlaybook(selected.candidate, selected.hint) : null
	].filter((block): block is string => Boolean(block));
	if (blocks.length === 0) return { request, playbookSkillId: null };
	return {
		request: appendSystemInstruction(
			request,
			['## Rules for This Turn', '', blocks.join('\n\n')].join('\n')
		),
		playbookSkillId: selected?.candidate.skillId ?? null
	};
}

function isRecord(value: unknown): value is JsonObject {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
