// packages/agentic-chat-client/src/agent-chat-turn-cards.ts
//
// Turn cards (tasker 153, phase A): one card per project a chat turn touched, with what the
// context finder put in view and every step, grouped. Pure: built from the thinking block's
// activities, the same way live and after a reload. No tool-name lists: a step's project comes
// from its arguments, then its result, then the chat's own project.
//
// Each card also carries a ledger: every record the turn touched, in exactly one of three
// states. Handed: the model got a summary and headings, or one line, and never opened it.
// Opened: the model had its text (given in full, or read by a step). Changed: a saved write
// touched it. A summary is never reported as read.

import {
	buildEntityHref,
	parseContextSelectionEventV1,
	type ContextSelectionEventV1,
	type RecordLinkKind
} from '@buildos/shared-types';
import type { ActivityEntry } from './agent-chat.types';
import { buildStepDetails, type StepAction } from './agent-chat-step-details';

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

/** What the finder put in the prompt for a record. */
export type LedgerGiven = 'text' | 'card' | 'line';
export type LedgerState = 'handed' | 'opened' | 'changed';
/** Where a record sits in the card's context list; finer than the state, same truth. */
export type LedgerGroup = 'changed' | 'opened' | 'given' | 'card' | 'line';

export type LedgerRecord = {
	key: string;
	kind: string;
	id: string;
	title: string;
	projectId: string | null;
	href: string | null;
	state: LedgerState;
	group: LedgerGroup;
	/** What the finder handed the model for it; null when the turn found it on its own. */
	given: LedgerGiven | null;
	carried: boolean;
	/** Sections flagged on its card (handed) or actually read (opened). */
	sections: string[];
	action: StepAction | null;
	/** One plain sentence saying what the model had: the chip's tooltip and label. */
	note: string;
};

export type TurnLedger = {
	records: LedgerRecord[];
	/** Records the finder looked through to choose (0 when unknown). */
	checked: number;
	/** Records put in front of the model in any form. */
	inView: number;
	/** Records whose text the model had: given in full, or read by a step. */
	opened: number;
	changed: number;
};

/** A change's fate after the turn: the person undid it, approved it, or turned it down. */
export type StepSettlement = { state: 'undone' | 'approved' | 'declined'; label: string };

export type TurnCard = {
	key: string;
	projectId: string | null;
	name: string;
	/** Loaded from last turn's working set without a new search (tasker 153, phase B). */
	carried: string[] | null;
	/** Older hosts' "Pulled in N" row. New hosts render `ledger`, which never calls a summary read. */
	pulled: TurnCardPulled | null;
	/** Every record this card's turn touched and how far it got. Null when there are none. */
	ledger: TurnLedger | null;
	/** Ids of the step activities on this card, in turn order. */
	stepIds: string[];
};

export type TurnCards = {
	cards: TurnCard[];
	/** Global turns: "Checked 12 projects, picked 2". */
	picked: { checked: number; picked: number; names: string[]; capture: boolean } | null;
	/**
	 * Context the model got that has no record chip (a whole-project snapshot, notes carried
	 * from last turn), and the finder's own outcome when it found nothing or could not run.
	 */
	contextLines: string[];
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

/**
 * A `context_selection` payload ready to store on the turn (live event, or a stored turn
 * event): the shared parser's typed fields, including what each record was handed as
 * (`given`), and what went in without a chip (`snapshot`, `notes`). Null when malformed.
 */
export function normalizeContextSelection(value: unknown): ContextSelectionEventV1 | null {
	return parseContextSelectionEventV1(value);
}

/** Whether a stored selection has anything a turn card can show. */
export function contextSelectionIsShowable(selection: ContextSelectionEventV1 | null): boolean {
	if (!selection?.visible) return false;
	return selection.injected || selection.status === 'unavailable' || selection.status === 'empty';
}

/**
 * What the finder handed the model for a chip. Older events carry no `given`: a one-line tier
 * is a line, a carried record had its text reloaded, a document arrives as a card (tasker
 * 152), and any other record arrives as text.
 */
function chipGiven(item: ContextSelectionEventV1['items'][number]): LedgerGiven {
	if (item.given) return item.given;
	if (item.tier !== 'full') return 'line';
	if (item.carried) return 'text';
	return item.kind === 'document' ? 'card' : 'text';
}

const ACTION_NOTES: Record<StepAction, string> = {
	created: 'Created',
	updated: 'Updated',
	archived: 'Archived',
	deleted: 'Deleted',
	moved: 'Moved',
	linked: 'Linked'
};

const list = (values: string[]) => values.slice(0, 4).join(', ');

function handedNote(
	record: Pick<LedgerRecord, 'given' | 'carried' | 'sections'>,
	partial: boolean
) {
	if (record.given === 'line') return 'One-line summary only — not opened';
	if (record.given === 'card')
		return record.sections.length
			? `Summary and headings only — not opened. Flagged: ${list(record.sections)}`
			: 'Summary and headings only — not opened';
	const where = record.sections.length ? `: ${list(record.sections)}` : '';
	if (record.carried) return `Carried from last turn, text in view${where}`;
	return partial ? `Given in part (cut for length)${where}` : `Given in full${where}`;
}

/**
 * The ledger for one card. `items` are the finder's chips for this card; `steps` its step
 * activities. Rules, in order:
 *  - a chip starts as handed (card or line) or opened (its text was given);
 *  - a finished read that returned a record's text makes it opened, and lists its sections;
 *  - a finished write that is not held and was not undone makes each record it touched changed.
 * Failed, running, held and undone steps move nothing.
 */
export function deriveTurnLedger(input: {
	items: ContextSelectionEventV1['items'];
	checked: number;
	steps: ActivityEntry[];
	projectId: string | null;
	settled?: Readonly<Record<string, StepSettlement>>;
}): TurnLedger | null {
	const records = new Map<string, LedgerRecord>();
	const hadText = new Set<string>();

	for (const item of input.items) {
		const key = `${item.kind}:${item.id}`;
		if (records.has(key)) continue;
		const given = chipGiven(item);
		const projectId = item.project_id ?? input.projectId;
		const base = {
			given,
			carried: item.carried === true,
			sections: item.sections.slice(0, 8)
		};
		if (given === 'text') hadText.add(key);
		records.set(key, {
			key,
			kind: item.kind,
			id: item.id,
			title: item.label,
			projectId,
			href: buildEntityHref(item.kind as RecordLinkKind, item.id, projectId),
			state: given === 'text' ? 'opened' : 'handed',
			group: given === 'text' ? 'given' : given,
			...base,
			action: null,
			note: handedNote(base, item.partial === true)
		});
	}
	const inView = records.size;

	const touch = (entity: {
		kind: string;
		id: string;
		title: string;
		projectId: string | null;
		href: string | null;
	}): LedgerRecord => {
		const key = `${entity.kind}:${entity.id}`;
		let record = records.get(key);
		if (!record) {
			record = {
				key,
				kind: entity.kind,
				id: entity.id,
				title: entity.title,
				projectId: entity.projectId,
				href: entity.href,
				state: 'handed',
				group: 'card',
				given: null,
				carried: false,
				sections: [],
				action: null,
				note: ''
			};
			records.set(key, record);
		}
		return record;
	};

	for (const activity of input.steps) {
		if (activity.activityType !== 'tool_call' || activity.status !== 'completed') continue;
		const details = buildStepDetails(activity, { projectId: input.projectId });
		if (details.held) continue;
		if (details.action) {
			if (input.settled?.[activity.id]?.state === 'undone') continue;
			for (const entity of details.entities) {
				const record = touch(entity);
				record.state = 'changed';
				record.group = 'changed';
				record.action = details.action;
				record.note = ACTION_NOTES[details.action];
				if (details.action === 'deleted') record.href = null;
			}
			continue;
		}
		for (const entity of details.opened) {
			const record = touch(entity);
			hadText.add(record.key);
			if (record.state === 'changed') continue;
			const sections = [
				...new Set([
					...(record.state === 'opened' && record.group === 'opened'
						? record.sections
						: []),
					...details.openedSections
				])
			];
			record.state = 'opened';
			record.group = 'opened';
			record.sections = sections.slice(0, 8);
			record.note = sections.length ? `Opened: ${list(sections)}` : 'Opened';
		}
	}

	// A record the turn only met in a write that was then undone, or never resolved, is dropped.
	const kept = [...records.values()].filter((record) => record.given !== null || record.note);
	if (kept.length === 0) return null;
	return {
		records: kept,
		checked: input.checked > inView ? input.checked : 0,
		inView,
		opened: kept.filter((record) => hadText.has(record.key)).length,
		changed: kept.filter((record) => record.state === 'changed').length
	};
}

const GROUP_ORDER: LedgerGroup[] = ['changed', 'opened', 'given', 'card', 'line'];
const GROUP_TITLES: Record<LedgerGroup, string> = {
	changed: 'Changed',
	opened: 'Opened',
	given: 'Given in full',
	card: 'Summary and headings only',
	line: 'One-line summary only'
};

export type LedgerGroupView = {
	group: LedgerGroup;
	state: LedgerState;
	title: string;
	records: LedgerRecord[];
};

/**
 * "Looked through 24 · 14 in view · 3 opened", and the records grouped by how far each got.
 * The label never says "read" or "pulled in" for a record the model only had a summary of.
 */
export function describeLedger(ledger: TurnLedger): { label: string; groups: LedgerGroupView[] } {
	const parts = [
		ledger.checked ? `Looked through ${ledger.checked}` : '',
		ledger.inView ? `${ledger.inView} in view` : '',
		ledger.opened || ledger.inView ? `${ledger.opened} opened` : '',
		ledger.changed ? `${ledger.changed} changed` : ''
	].filter(Boolean);
	const groups = GROUP_ORDER.map((group) => ({
		group,
		state: (group === 'changed'
			? 'changed'
			: group === 'opened' || group === 'given'
				? 'opened'
				: 'handed') as LedgerState,
		title: GROUP_TITLES[group],
		records: ledger.records.filter((record) => record.group === group)
	})).filter((view) => view.records.length > 0);
	return { label: parts.join(' · '), groups };
}

/** Lines for context the model got without a chip, and for a finder that found or ran nothing. */
function contextLinesFrom(selection: ContextSelectionEventV1 | null): string[] {
	if (!selection?.visible) return [];
	const lines: string[] = [];
	if (selection.status === 'unavailable') {
		lines.push(
			selection.failure === 'deadline'
				? "Couldn't check project context this turn (it took too long)"
				: "Couldn't check project context this turn"
		);
		return lines;
	}
	if (selection.status === 'empty' && !selection.injected && selection.project_id) {
		lines.push(
			selection.counts.checked
				? `Looked through ${selection.counts.checked} records · nothing relevant found`
				: 'Nothing relevant found in this project'
		);
	}
	if (!selection.injected) return lines;
	if (selection.snapshot) lines.push('Also given: a snapshot of the whole project');
	const changed = selection.notes?.changed ?? 0;
	const notLoaded = selection.notes?.not_loaded ?? 0;
	if (changed > 0)
		lines.push(
			`Also told: ${changed} ${changed === 1 ? 'record' : 'records'} changed since last turn`
		);
	if (notLoaded > 0)
		lines.push(
			`Also told: ${notLoaded} earlier ${notLoaded === 1 ? 'record was' : 'records were'} not reloaded`
		);
	return lines;
}

export function deriveTurnCards(input: {
	activities: ActivityEntry[];
	/** The chat's own project (a project chat); null in global chat. */
	sessionProject: TurnCardProject | null;
	/** Changes the person undid, approved or declined after the turn, by step activity id. */
	settled?: Readonly<Record<string, StepSettlement>>;
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
				ledger: null,
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

	// The ledger: the finder's chips for the card plus what its steps opened and changed.
	const byId = new Map(activities.map((activity) => [activity.id, activity]));
	for (const card of cards.values()) {
		const items =
			!selection || !injected
				? []
				: selection.project_id
					? card.projectId === selection.project_id
						? selection.items
						: []
					: selection.items.filter((item) => item.project_id === card.projectId);
		card.ledger = deriveTurnLedger({
			items,
			checked:
				selection?.project_id && card.projectId === selection.project_id
					? selection.counts.checked
					: 0,
			steps: card.stepIds
				.map((id) => byId.get(id))
				.filter((activity): activity is ActivityEntry => activity !== undefined),
			projectId: card.projectId,
			...(input.settled ? { settled: input.settled } : {})
		});
	}

	const ordered = [...cards.values()].filter(
		(card) =>
			card.stepIds.length > 0 ||
			card.pulled !== null ||
			card.carried !== null ||
			card.ledger !== null
	);
	// The "Across projects" group always sits last.
	ordered.sort((a, b) => Number(a.key === ACROSS_KEY) - Number(b.key === ACROSS_KEY));

	const picked =
		selection && !selection.project_id && selection.workspace && selection.projects.length > 0
			? {
					checked: selection.workspace.checked,
					picked: selection.projects.length,
					names: selection.projects.map((project) => project.name),
					// A brain dump: the picked projects are where its pieces are being filed.
					capture: selection.workspace.capture === true
				}
			: null;

	return { cards: ordered, picked, contextLines: contextLinesFrom(selection) };
}

/**
 * "Pulled in 3 of 9 · Worklist, Griffin, Q4 plan". Kept for hosts that have not adopted the
 * ledger; it counts summaries as pulled in, so new hosts use `describeLedger`.
 */
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
