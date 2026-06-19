// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/entity-index.ts

export type TurnSupervisorEntityIndexEntry = {
	id: string;
	kind: string;
	label?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	source?: string | null;
};

export type TurnSupervisorEntityIndexInput =
	| TurnSupervisorEntityIndexEntry[]
	| { entries?: TurnSupervisorEntityIndexEntry[] | null }
	| null
	| undefined;

const COLLECTION_KIND_BY_KEY: Record<string, string> = {
	project: 'project',
	projects: 'project',
	goal: 'goal',
	goals: 'goal',
	milestone: 'milestone',
	milestones: 'milestone',
	plan: 'plan',
	plans: 'plan',
	task: 'task',
	tasks: 'task',
	document: 'document',
	documents: 'document',
	event: 'event',
	events: 'event'
};

const PROJECT_BUNDLE_KEYS = ['goals', 'milestones', 'plans', 'tasks', 'documents', 'events'];
const PROJECT_INTELLIGENCE_KEYS = [
	'overdue_or_due_soon',
	'upcoming_work',
	'recent_changes',
	'project_summaries'
];

export function normalizeEntityKind(kind: string | null | undefined): string | null {
	if (!kind) return null;
	const normalized = kind
		.trim()
		.toLowerCase()
		.replace(/^onto[_:. -]/, '')
		.replace(/[_:. -]+/g, '_');
	if (!normalized) return null;
	if (normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
	if (normalized.endsWith('s') && normalized.length > 1) return normalized.slice(0, -1);
	return normalized;
}

export function normalizeTurnSupervisorEntityIndex(
	input: TurnSupervisorEntityIndexInput
): TurnSupervisorEntityIndexEntry[] {
	const entries = Array.isArray(input) ? input : (input?.entries ?? []);
	return entries
		.map((entry) => ({
			id: entry.id?.trim(),
			kind: normalizeEntityKind(entry.kind) ?? '',
			label: entry.label ?? null,
			projectId: entry.projectId ?? null,
			projectName: entry.projectName ?? null,
			source: entry.source ?? null
		}))
		.filter((entry) => entry.id && entry.kind);
}

export function buildTurnSupervisorEntityIndexFromContextData(
	data: unknown
): TurnSupervisorEntityIndexEntry[] {
	const root = asRecord(data);
	if (!root) return [];

	const entries: TurnSupervisorEntityIndexEntry[] = [];
	const seen = new Set<string>();

	const add = (
		kind: string | null | undefined,
		value: unknown,
		options: {
			projectId?: string | null;
			projectName?: string | null;
			source?: string | null;
			idKey?: string;
		} = {}
	): void => {
		const record = asRecord(value);
		const normalizedKind = normalizeEntityKind(kind);
		if (!record || !normalizedKind) return;
		const id = readString(record, options.idKey ?? 'id') ?? readString(record, 'entity_id');
		if (!id) return;
		const projectId =
			readString(record, 'project_id') ??
			readString(record, 'projectId') ??
			options.projectId ??
			null;
		const projectName =
			readString(record, 'project_name') ??
			readString(record, 'projectName') ??
			options.projectName ??
			null;
		const entry: TurnSupervisorEntityIndexEntry = {
			id,
			kind: normalizedKind,
			label: readString(record, 'title') ?? readString(record, 'name') ?? null,
			projectId,
			projectName,
			source: options.source ?? null
		};
		const key = `${entry.kind}:${entry.id}`;
		if (seen.has(key)) return;
		seen.add(key);
		entries.push(entry);
	};

	add('project', root.project, { source: 'context.project' });

	for (const [key, kind] of Object.entries(COLLECTION_KIND_BY_KEY)) {
		addArray(entriesFrom(root[key]), (item) => add(kind, item, { source: `context.${key}` }));
	}

	addArray(entriesFrom(root.projects), (bundle) => {
		const bundleRecord = asRecord(bundle);
		if (!bundleRecord) return;
		const projectRecord = asRecord(bundleRecord.project);
		const projectId = projectRecord ? readString(projectRecord, 'id') : null;
		const projectName = projectRecord ? readString(projectRecord, 'name') : null;
		add('project', projectRecord, { source: 'context.projects.project' });
		for (const key of PROJECT_BUNDLE_KEYS) {
			const kind = COLLECTION_KIND_BY_KEY[key];
			addArray(entriesFrom(bundleRecord[key]), (item) =>
				add(kind, item, {
					projectId,
					projectName,
					source: `context.projects.${key}`
				})
			);
		}
	});

	const focusEntityType =
		readString(root, 'focus_entity_type') ?? readString(root, 'focusEntityType');
	const focusEntityId = readString(root, 'focus_entity_id') ?? readString(root, 'focusEntityId');
	if (focusEntityType && focusEntityId) {
		add(
			focusEntityType,
			{ id: focusEntityId, ...(asRecord(root.focus_entity_full) ?? {}) },
			{
				source: 'context.focus_entity'
			}
		);
	}

	const linkedEntities = asRecord(root.linked_entities);
	if (linkedEntities) {
		for (const [kind, items] of Object.entries(linkedEntities)) {
			addArray(entriesFrom(items), (item) =>
				add(kind, item, { source: `context.linked_entities.${kind}` })
			);
		}
	}

	addArray(entriesFrom(root.mentioned_entities), (item) => {
		const record = asRecord(item);
		if (!record) return;
		add(readString(record, 'entity_kind'), record, {
			idKey: 'entity_id',
			source: 'context.mentioned_entities'
		});
	});

	const intelligence = asRecord(root.project_intelligence);
	if (intelligence) {
		for (const key of PROJECT_INTELLIGENCE_KEYS) {
			addArray(entriesFrom(intelligence[key]), (item) => {
				const record = asRecord(item);
				if (!record) return;
				add(
					readString(record, 'kind') ?? (key === 'project_summaries' ? 'project' : null),
					record,
					{
						idKey: key === 'project_summaries' ? 'project_id' : 'id',
						source: `context.project_intelligence.${key}`
					}
				);
			});
		}
	}

	return entries;
}

export function findEntityIndexEntry(
	entries: TurnSupervisorEntityIndexEntry[],
	id: string | null | undefined
): TurnSupervisorEntityIndexEntry | null {
	if (!id) return null;
	return entries.find((entry) => entry.id === id) ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function entriesFrom(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function addArray(items: unknown[], add: (item: unknown) => void): void {
	for (const item of items) add(item);
}

function readString(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
