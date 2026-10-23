// apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.ts
/**
 * Operational write playbooks and the tools that make each one usable
 * (2026-09-02 turn executor audit, Finding 4 / Decision 4).
 *
 * The operational skills (task_management, document_workspace,
 * plan_management, calendar_management) live in no domain or outcome card, and
 * the reviewed worker lane cannot call skill_load, so admission ships them to
 * the worker. Until 2026-10-17 this module also chose which one fired by
 * scoring the user's message against a regex lexicon of mutation verbs and
 * entity nouns. That broke AGENTS.md "Never classify language with regex": a
 * misfire put a write playbook on an analysis turn, the acting model proposed
 * writes nobody asked for, and the reviewer bounced them (audit 2026-10-17
 * Q1/S5). The lexicon is gone.
 *
 * What remains is structural. Admission ships one candidate per playbook whose
 * write tools are mounted on the turn's surface (a playbook that names an
 * unmounted tool is a turn kill on the worker), and the worker picks at most
 * one from Jev's structured write commission with a static tool → playbook
 * table (apps/worker/src/workers/agentic-chat/provider/turn-rules.ts). The
 * worked example is picked there too, from the commissioned tools.
 */

export type OperationalEntityKind = 'task' | 'document' | 'plan' | 'calendar';

export type OperationalSkillId =
	| 'task_management'
	| 'document_workspace'
	| 'plan_management'
	| 'calendar_management';

/** Which worked example a rendered playbook shows. */
export type OperationalExampleHint = 'create' | 'update' | 'organize';

export const OPERATIONAL_EXAMPLE_HINTS: readonly OperationalExampleHint[] = [
	'update',
	'create',
	'organize'
];

export const OPERATIONAL_SKILL_BY_ENTITY: Readonly<
	Record<OperationalEntityKind, OperationalSkillId>
> = {
	task: 'task_management',
	document: 'document_workspace',
	plan: 'plan_management',
	calendar: 'calendar_management'
};

/**
 * A skill is only eligible when at least one of its write tools is mounted on
 * the surface the model will actually see. Task, calendar, and plan-layer
 * writes (plans, goals, milestones, risks since 2026-09-18) are on the global
 * and project surfaces. create_onto_document joined global on 2026-10-23 (a
 * save that fits no project goes to the user's Workspace), but the document
 * playbook walks the project's document tree (search_project, get_document_tree,
 * update_onto_document, move_document_in_tree), so it keys on the project-only
 * document writes and stays a project-surface playbook; global chat's save rule
 * lives in its always-on workflow hints.
 */
const OPERATIONAL_SKILL_TOOL_REQUIREMENTS: Record<OperationalEntityKind, readonly string[]> = {
	task: ['create_onto_task', 'update_onto_task'],
	document: ['update_onto_document', 'move_document_in_tree'],
	plan: ['create_onto_plan', 'update_onto_plan'],
	calendar: ['create_calendar_event', 'update_calendar_event']
};

const ENTITY_PRIORITY: OperationalEntityKind[] = ['task', 'document', 'plan', 'calendar'];

export function isOperationalSkillEligibleForTools(
	entityKind: OperationalEntityKind,
	toolNames: readonly string[]
): boolean {
	const mounted = new Set(toolNames);
	return OPERATIONAL_SKILL_TOOL_REQUIREMENTS[entityKind].some((name) => mounted.has(name));
}

/**
 * Every operational playbook the mounted tools can honor, in a stable order.
 * Capability only: nothing here reads the message.
 */
export function operationalEntityKindsForTools(
	toolNames: readonly string[]
): OperationalEntityKind[] {
	return ENTITY_PRIORITY.filter((entityKind) =>
		isOperationalSkillEligibleForTools(entityKind, toolNames)
	);
}
