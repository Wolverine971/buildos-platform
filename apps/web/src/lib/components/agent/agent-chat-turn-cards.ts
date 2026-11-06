// apps/web/src/lib/components/agent/agent-chat-turn-cards.ts
//
// Turn cards (tasker 153, phase A): one card per project a chat turn touched, with what the
// context finder pulled in and every step, grouped. Pure: built from the thinking block's
// activities, the same way live and after a reload. No tool-name lists: a step's project comes
// from its arguments, then its result, then the chat's own project.

import { parseContextSelectionEventV1, type ContextSelectionEventV1 } from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';

/** Metadata key for the finder's `context_selection` receipt, stored as a hidden activity. */
export const CONTEXT_SELECTION_METADATA_KEY = 'contextSelection';

export type TurnCardProject = { id: string; name: string };

export type TurnCardPulled = {
	/** Records the finder put in front of the model. */
	count: number;
	/** Records it looked through to choose them (0 when unknown). */
	checked: number;
	labels: string[];
};

export type TurnCard = {
	key: string;
	projectId: string | null;
	name: string;
	/** Loaded from last turn's working set without a new search (tasker 153, phase B). */
	carried: string[] | null;
	pulled: TurnCardPulled | null;
	/** Ids of the step activities on this card, in turn order. */
	stepIds: string[];
};

export type TurnCards = {
	cards: TurnCard[];
	/** Global turns: "Checked 12 projects, picked 2". */
	picked: { checked: number; picked: number } | null;
};

const ACROSS_KEY = 'across';
const MAX_LABELS = 3;

/** A step the thinking block shows as a row (the same filter it uses for its log). */
export function isTurnStep(activity: ActivityEntry): boolean {
	return (
		activity.activityType === 'tool_call' ||
		Boolean(activity.metadata?.skillActivity) ||
		activity.metadata?.activityVisibility === 'activity_log'
	);
}

/** The finder receipt stored on this turn's activities, if any (the last one wins). */
export function readTurnSelection(activities: ActivityEntry[]): ContextSelectionEventV1 | null {
	for (let i = activities.length - 1; i >= 0; i--) {
		const raw = activities[i]?.metadata?.[CONTEXT_SELECTION_METADATA_KEY];
		if (raw) return parseContextSelectionEventV1(raw);
	}
	return null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmpty = (value: unknown): string | null =>
	typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

function readArgs(activity: ActivityEntry): Record<string, unknown> {
	const args = activity.metadata?.arguments;
	if (isRecord(args)) return args;
	if (typeof args === 'string' && args.trim().startsWith('{')) {
		try {
			const parsed: unknown = JSON.parse(args);
			return isRecord(parsed) ? parsed : {};
		} catch {
			return {};
		}
	}
	return {};
}

const NESTED_ENTITY_KEYS = [
	'task',
	'goal',
	'plan',
	'document',
	'milestone',
	'risk',
	'event',
	'table'
] as const;

/** The project a step belongs to: its arguments, then its result. Null when it names none. */
export function stepProjectId(activity: ActivityEntry): string | null {
	const fromArgs = nonEmpty(readArgs(activity).project_id);
	if (fromArgs) return fromArgs;
	const result = activity.metadata?.result;
	if (!isRecord(result)) return null;
	const direct = nonEmpty(result.project_id);
	if (direct) return direct;
	if (isRecord(result.project)) {
		const id = nonEmpty(result.project.id);
		if (id) return id;
	}
	for (const key of NESTED_ENTITY_KEYS) {
		const nested = result[key];
		if (isRecord(nested)) {
			const id = nonEmpty(nested.project_id);
			if (id) return id;
		}
	}
	return null;
}

/** Project names the results already carry (`project`, `project_name`, lists of records). */
function harvestProjectNames(activities: ActivityEntry[], names: Map<string, string>): void {
	const note = (id: unknown, name: unknown) => {
		const key = nonEmpty(id);
		const label = nonEmpty(name);
		if (key && label && !names.has(key)) names.set(key, label);
	};
	const visit = (value: unknown, depth: number) => {
		if (depth > 2) return;
		if (Array.isArray(value)) {
			for (const item of value.slice(0, 50)) visit(item, depth + 1);
			return;
		}
		if (!isRecord(value)) return;
		note(value.project_id, value.project_name);
		if (isRecord(value.project)) note(value.project.id, value.project.name);
		for (const child of Object.values(value)) {
			if (Array.isArray(child) || isRecord(child)) visit(child, depth + 1);
		}
	};
	for (const activity of activities) {
		if (activity.activityType === 'tool_call') visit(activity.metadata?.result, 0);
	}
}

function pulledFrom(
	items: ContextSelectionEventV1['items'],
	checked: number
): TurnCardPulled | null {
	if (items.length === 0) return null;
	// Records the finder loaded in full read first; one-line summaries after.
	const ordered = [
		...items.filter((item) => item.tier === 'full'),
		...items.filter((item) => item.tier !== 'full')
	];
	return {
		count: items.length,
		checked: checked > items.length ? checked : 0,
		labels: ordered.slice(0, MAX_LABELS).map((item) => item.label)
	};
}

export function deriveTurnCards(input: {
	activities: ActivityEntry[];
	/** The chat's own project (a project chat); null in global chat. */
	sessionProject: TurnCardProject | null;
}): TurnCards {
	const { activities, sessionProject } = input;
	const selection = readTurnSelection(activities);
	const injected = selection?.injected === true;

	const names = new Map<string, string>();
	if (sessionProject) names.set(sessionProject.id, sessionProject.name);
	for (const project of selection?.projects ?? []) {
		if (!names.has(project.id)) names.set(project.id, project.name);
	}
	harvestProjectNames(activities, names);

	const cards = new Map<string, TurnCard>();
	const cardFor = (projectId: string | null): TurnCard => {
		const key = projectId ?? ACROSS_KEY;
		let card = cards.get(key);
		if (!card) {
			card = {
				key,
				projectId,
				name: projectId ? (names.get(projectId) ?? 'Another project') : 'Across projects',
				carried: null,
				pulled: null,
				stepIds: []
			};
			cards.set(key, card);
		}
		return card;
	};

	// Cards open in the order the turn met them: the chat's project, then the finder's picks.
	if (sessionProject) cardFor(sessionProject.id);
	if (selection && injected) {
		if (selection.project_id) {
			// Project chat: the finder looked inside this one project. Carried items came from
			// last turn; the rest the finder pulled in this turn.
			const card = cardFor(selection.project_id);
			const carried = selection.items.filter((item) => item.carried);
			if (carried.length)
				card.carried = carried.map((item) =>
					item.sections.length
						? `${item.label} › ${item.sections.join(', ')}`
						: item.label
				);
			card.pulled = pulledFrom(
				selection.items.filter((item) => !item.carried),
				selection.counts.checked
			);
		} else {
			for (const project of selection.projects) {
				const items = selection.items.filter((item) => item.project_id === project.id);
				const pulled = pulledFrom(items, 0);
				if (pulled) cardFor(project.id).pulled = pulled;
			}
		}
	}

	for (const activity of activities) {
		if (!isTurnStep(activity)) continue;
		const projectId = stepProjectId(activity) ?? sessionProject?.id ?? null;
		cardFor(projectId).stepIds.push(activity.id);
	}

	// Steps that name no project fold into the only project card when there is just one.
	const across = cards.get(ACROSS_KEY);
	const projectCards = [...cards.values()].filter((card) => card.projectId !== null);
	if (across && projectCards.length === 1) {
		const only = projectCards[0]!;
		const order = new Map(activities.map((activity, index) => [activity.id, index]));
		only.stepIds = [...only.stepIds, ...across.stepIds].sort(
			(a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
		);
		cards.delete(ACROSS_KEY);
	}

	const ordered = [...cards.values()].filter(
		(card) => card.stepIds.length > 0 || card.pulled !== null || card.carried !== null
	);
	// The "Across projects" group always sits last.
	ordered.sort((a, b) => Number(a.key === ACROSS_KEY) - Number(b.key === ACROSS_KEY));

	const picked =
		selection && !selection.project_id && selection.workspace && selection.projects.length > 0
			? { checked: selection.workspace.checked, picked: selection.projects.length }
			: null;

	return { cards: ordered, picked };
}

/** "Pulled in 3 of 9 · Worklist, Griffin, Q4 plan" */
export function describePulled(pulled: TurnCardPulled): { label: string; detail: string } {
	const label = pulled.checked
		? `Pulled in ${pulled.count} of ${pulled.checked}`
		: `Pulled in ${pulled.count}`;
	const more = pulled.count - pulled.labels.length;
	const detail = pulled.labels.join(', ') + (more > 0 ? ` +${more} more` : '');
	return { label, detail };
}

/** The finder's confidence at or above which a one-project global turn offers "Continue in X". */
export const CONTINUE_IN_PROJECT_MIN_P = 0.7;

/**
 * Global chat only: when the finder picked exactly one project, with confidence, the chat can
 * move into that project ("Continue in Wayne Strategies"), where it gets the project's prompt,
 * tools and context. Null when the turn was about several projects, none, or it wasn't sure.
 */
export function continueInProjectTarget(activities: ActivityEntry[]): TurnCardProject | null {
	const selection = readTurnSelection(activities);
	if (!selection || selection.project_id || !selection.injected) return null;
	if (selection.projects.length !== 1) return null;
	const [only] = selection.projects;
	if (!only || (only.p ?? 0) < CONTINUE_IN_PROJECT_MIN_P) return null;
	return { id: only.id, name: only.name };
}
