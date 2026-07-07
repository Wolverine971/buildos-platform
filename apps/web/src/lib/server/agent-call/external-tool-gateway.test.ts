// apps/web/src/lib/server/agent-call/external-tool-gateway.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';

const ensureActorIdMock = vi.fn();
const fetchProjectSummariesMock = vi.fn();
const logCreateAsyncMock = vi.fn();
const logUpdateAsyncMock = vi.fn();
const syncTaskEventsMock = vi.fn();
const resolveEntityMentionUserIdsMock = vi.fn();
const notifyEntityMentionsAddedMock = vi.fn();
const addDocumentToTreeMock = vi.fn();
const createOrMergeDocumentVersionMock = vi.fn();
const instantiateProjectMock = vi.fn();
const validateProjectSpecMock = vi.fn();
const calendarExecutorMocks = vi.hoisted(() => ({
	listCalendarEvents: vi.fn(),
	getCalendarEventDetails: vi.fn(),
	createCalendarEvent: vi.fn(),
	updateCalendarEvent: vi.fn(),
	deleteCalendarEvent: vi.fn(),
	getProjectCalendar: vi.fn(),
	setProjectCalendar: vi.fn()
}));

// NOTE: The op-execution core was carved into @buildos/shared-agent-ops
// (op-execution-gateway). vitest.config.ts aliases that gateway and the
// dependency modules below to package SOURCE, so these vi.mock calls target the
// canonical `@buildos/shared-agent-ops/...` specifiers (which dedupe with the
// gateway's relative imports). The calendar-executor + task-event-sync mocks
// stay on the $lib paths because those ports are wired from the web adapter.
vi.mock('@buildos/shared-agent-ops/ontology/ontology-projects.service', () => ({
	ensureActorId: ensureActorIdMock,
	fetchProjectSummaries: fetchProjectSummariesMock
}));

vi.mock('@buildos/shared-agent-ops/ops/async-activity-logger', () => ({
	logCreateAsync: logCreateAsyncMock,
	logUpdateAsync: logUpdateAsyncMock
}));

vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: class TaskEventSyncService {
		syncTaskEvents = syncTaskEventsMock;
	}
}));

vi.mock('@buildos/shared-agent-ops/ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: resolveEntityMentionUserIdsMock,
	notifyEntityMentionsAdded: notifyEntityMentionsAddedMock
}));

vi.mock('@buildos/shared-agent-ops/ontology/doc-structure.service', () => ({
	addDocumentToTree: addDocumentToTreeMock
}));

vi.mock('@buildos/shared-agent-ops/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: createOrMergeDocumentVersionMock,
	toDocumentSnapshot: (document: Record<string, unknown>) => ({
		title: typeof document.title === 'string' ? document.title : null,
		content: typeof document.content === 'string' ? document.content : null,
		description: typeof document.description === 'string' ? document.description : null,
		props:
			document.props && typeof document.props === 'object' && !Array.isArray(document.props)
				? (document.props as Record<string, unknown>)
				: {},
		state_key: typeof document.state_key === 'string' ? document.state_key : null,
		type_key: typeof document.type_key === 'string' ? document.type_key : null,
		project_id: typeof document.project_id === 'string' ? document.project_id : null
	})
}));

vi.mock('@buildos/shared-agent-ops/ontology/instantiation.service', () => ({
	instantiateProject: instantiateProjectMock,
	validateProjectSpec: validateProjectSpecMock,
	OntologyInstantiationError: class OntologyInstantiationError extends Error {
		constructor(message: string) {
			super(message);
			this.name = 'OntologyInstantiationError';
		}
	}
}));

vi.mock('$lib/services/agentic-chat/tools/core/executors/calendar-executor', () => ({
	CalendarExecutor: class CalendarExecutor {
		listCalendarEvents = calendarExecutorMocks.listCalendarEvents;
		getCalendarEventDetails = calendarExecutorMocks.getCalendarEventDetails;
		createCalendarEvent = calendarExecutorMocks.createCalendarEvent;
		updateCalendarEvent = calendarExecutorMocks.updateCalendarEvent;
		deleteCalendarEvent = calendarExecutorMocks.deleteCalendarEvent;
		getProjectCalendar = calendarExecutorMocks.getProjectCalendar;
		setProjectCalendar = calendarExecutorMocks.setProjectCalendar;
	}
}));

type DocumentRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	content: string | null;
	state_key: string;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	archived_at?: string | null;
	deleted_at: string | null;
	created_by?: string | null;
	children?: Record<string, unknown> | null;
	search_vector?: unknown;
};

type TaskRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	type_key: string;
	state_key: string;
	priority: number | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
	props: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
	archived_at?: string | null;
	deleted_at: string | null;
	created_by?: string | null;
};

type AssetRow = {
	id: string;
	project_id: string;
	kind: string;
	original_filename: string | null;
	content_type: string | null;
	file_size_bytes: number | string | null;
	width: number | null;
	height: number | null;
	checksum_sha256: string | null;
	alt_text: string | null;
	caption: string | null;
	ocr_status: string | null;
	extraction_summary: string | null;
	extracted_text: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	storage_bucket?: string | null;
	storage_path?: string | null;
};

type EventRow = {
	id: string;
	project_id: string | null;
	title: string;
	state_key: string;
	start_at: string;
	end_at: string | null;
	location: string | null;
	updated_at: string;
	deleted_at: string | null;
	owner_entity_type?: string;
	owner_entity_id?: string | null;
};

type ProjectRow = {
	id: string;
	name: string;
	description: string | null;
	type_key: string;
	state_key: string;
	props: Record<string, unknown> | null;
	start_at: string | null;
	end_at: string | null;
	created_at: string;
	updated_at: string;
	archived_at?: string | null;
	deleted_at: string | null;
	created_by?: string | null;
};

type ProjectMemberRow = {
	id: string;
	project_id: string;
	actor_id: string;
	role_key: string;
	access: string;
	role_name: string | null;
	role_description: string | null;
	created_at: string;
	removed_at: string | null;
	actor?: {
		id: string;
		user_id: string | null;
		name: string | null;
		email: string | null;
	} | null;
};

type State = {
	documents: DocumentRow[];
	tasks: TaskRow[];
	assets?: AssetRow[];
	events?: EventRow[];
	projects?: ProjectRow[];
	projectMembers?: ProjectMemberRow[];
	toolExecutions: Array<Record<string, unknown>>;
	securityEvents?: Array<Record<string, unknown>>;
	projectLogs?: Array<Record<string, unknown>>;
	callerPolicy?: Record<string, unknown> | null;
	nextTaskId: number;
	nextToolExecutionId: number;
};

class OntoDocumentsQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private deletedAtFilterApplied = false;
	private archivedAtFilter: 'active' | 'archived' | null = null;
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;

	constructor(private readonly state: State) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}

		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}
		if (field === 'archived_at' && value === null) {
			this.archivedAtFilter = 'active';
		}

		return this;
	}

	not(field: string, operator: string, value: unknown) {
		if (field === 'archived_at' && operator === 'is' && value === null) {
			this.archivedAtFilter = 'archived';
		}

		return this;
	}

	private matches(row: DocumentRow): boolean {
		if (this.idFilter !== null && row.id !== this.idFilter) {
			return false;
		}

		if (this.projectIdsFilter !== null && !this.projectIdsFilter.includes(row.project_id)) {
			return false;
		}

		if (this.deletedAtFilterApplied && row.deleted_at !== null) {
			return false;
		}
		if (this.archivedAtFilter === 'active' && row.archived_at != null) {
			return false;
		}
		if (this.archivedAtFilter === 'archived' && row.archived_at == null) {
			return false;
		}

		return true;
	}

	private serialize(row: DocumentRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			title: row.title,
			description: row.description,
			type_key: row.type_key,
			content: row.content,
			state_key: row.state_key,
			props: row.props,
			created_at: row.created_at,
			updated_at: row.updated_at,
			archived_at: row.archived_at ?? null,
			deleted_at: row.deleted_at,
			created_by: row.created_by ?? null,
			children: row.children ?? null,
			...(row.search_vector === undefined ? {} : { search_vector: row.search_vector })
		};
	}

	maybeSingle() {
		const row = this.state.documents.find((document) => this.matches(document)) ?? null;

		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: null
		});
	}

	single() {
		if (this.action === 'insert' && this.insertPayload) {
			const id = `66666666-6666-6666-6666-${String(this.state.documents.length + 1).padStart(12, '0')}`;
			const row: DocumentRow = {
				id,
				project_id: String(this.insertPayload.project_id),
				title: String(this.insertPayload.title),
				description:
					typeof this.insertPayload.description === 'string'
						? this.insertPayload.description
						: null,
				type_key: String(this.insertPayload.type_key),
				content:
					typeof this.insertPayload.content === 'string'
						? this.insertPayload.content
						: null,
				state_key: String(this.insertPayload.state_key),
				props:
					this.insertPayload.props &&
					typeof this.insertPayload.props === 'object' &&
					!Array.isArray(this.insertPayload.props)
						? (this.insertPayload.props as Record<string, unknown>)
						: {},
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				archived_at: null,
				deleted_at: null,
				created_by:
					typeof this.insertPayload.created_by === 'string'
						? this.insertPayload.created_by
						: null,
				children: null
			};
			this.state.documents.push(row);
			return Promise.resolve({ data: this.serialize(row), error: null });
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.documents.findIndex((document) => this.matches(document));
			if (index < 0) {
				return Promise.resolve({ data: null, error: new Error('Document not found') });
			}

			const current = this.state.documents[index]!;
			const updated: DocumentRow = {
				...current,
				...(this.updatePayload as Partial<DocumentRow>),
				updated_at: '2026-04-28T00:05:00.000Z'
			};
			this.state.documents[index] = updated;
			return Promise.resolve({ data: this.serialize(updated), error: null });
		}

		const row = this.state.documents.find((document) => this.matches(document)) ?? null;
		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: row ? null : new Error('Document not found')
		});
	}
}

class OntoTasksQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private deletedAtFilterApplied = false;
	private archivedAtFilter: 'active' | 'archived' | null = null;
	private dueAtLte: string | null = null;
	private dueAtGte: string | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rowLimit: number | null = null;
	private rangeBounds: { from: number; to: number } | null = null;
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;

	constructor(private readonly state: State) {}

	select() {
		if (!this.action) {
			this.action = 'select';
		}

		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}
		if (field === 'project_id' && typeof value === 'string') {
			this.projectIdsFilter = [value];
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}
		if (field === 'archived_at' && value === null) {
			this.archivedAtFilter = 'active';
		}

		return this;
	}

	not(field: string, operator: string, value: unknown) {
		if (field === 'archived_at' && operator === 'is' && value === null) {
			this.archivedAtFilter = 'archived';
		}

		return this;
	}

	lte(field: string, value: unknown) {
		if (field === 'due_at' && typeof value === 'string') {
			this.dueAtLte = value;
		}
		return this;
	}

	gte(field: string, value: unknown) {
		if (field === 'due_at' && typeof value === 'string') {
			this.dueAtGte = value;
		}
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	range(from: number, to: number) {
		this.rangeBounds = { from, to };
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown>[];
					error: any;
					count: number;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeList()).then(onfulfilled, onrejected);
	}

	private matches(row: TaskRow): boolean {
		if (this.idFilter !== null && row.id !== this.idFilter) {
			return false;
		}

		if (this.projectIdsFilter !== null && !this.projectIdsFilter.includes(row.project_id)) {
			return false;
		}

		if (this.deletedAtFilterApplied && row.deleted_at !== null) {
			return false;
		}
		if (this.archivedAtFilter === 'active' && row.archived_at != null) {
			return false;
		}
		if (this.archivedAtFilter === 'archived' && row.archived_at == null) {
			return false;
		}
		if (this.dueAtLte !== null) {
			if (row.due_at === null || row.due_at > this.dueAtLte) return false;
		}
		if (this.dueAtGte !== null) {
			if (row.due_at === null || row.due_at < this.dueAtGte) return false;
		}

		return true;
	}

	private filteredRows() {
		let rows = this.state.tasks.filter((task) => this.matches(task));
		if (this.orderBy) {
			const orderBy = this.orderBy;
			const field = orderBy.field as keyof TaskRow;
			rows = [...rows].sort((a, b) => {
				const left = String(a[field] ?? '');
				const right = String(b[field] ?? '');
				return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
			});
		}
		return rows;
	}

	private executeList() {
		const rows = this.filteredRows();
		let limited = rows;
		if (this.rangeBounds) {
			limited = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
		}
		if (this.rowLimit !== null) {
			limited = limited.slice(0, this.rowLimit);
		}
		return {
			data: limited,
			error: null,
			count: rows.length
		};
	}

	maybeSingle() {
		const row = this.filteredRows()[0] ?? null;
		return Promise.resolve({ data: row, error: null });
	}

	single() {
		if (this.action === 'insert' && this.insertPayload) {
			const id = `77777777-7777-7777-7777-${String(this.state.nextTaskId).padStart(12, '0')}`;
			this.state.nextTaskId += 1;
			const row: TaskRow = {
				id,
				project_id: String(this.insertPayload.project_id),
				title: String(this.insertPayload.title),
				description:
					typeof this.insertPayload.description === 'string'
						? this.insertPayload.description
						: null,
				type_key: String(this.insertPayload.type_key),
				state_key: String(this.insertPayload.state_key),
				priority:
					typeof this.insertPayload.priority === 'number'
						? this.insertPayload.priority
						: null,
				start_at:
					typeof this.insertPayload.start_at === 'string'
						? this.insertPayload.start_at
						: null,
				due_at:
					typeof this.insertPayload.due_at === 'string'
						? this.insertPayload.due_at
						: null,
				completed_at:
					typeof this.insertPayload.completed_at === 'string'
						? this.insertPayload.completed_at
						: null,
				props: ((this.insertPayload.props ?? {}) as Record<string, unknown>) ?? {},
				created_at: '2026-04-28T00:00:00.000Z',
				updated_at: '2026-04-28T00:00:00.000Z',
				archived_at: null,
				deleted_at: null,
				created_by:
					typeof this.insertPayload.created_by === 'string'
						? this.insertPayload.created_by
						: null
			};
			this.state.tasks.push(row);
			return Promise.resolve({ data: row, error: null });
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.tasks.findIndex((task) => this.matches(task));
			if (index < 0) {
				return Promise.resolve({ data: null, error: new Error('Task not found') });
			}

			const current = this.state.tasks[index]!;
			const updated: TaskRow = {
				...current,
				...(this.updatePayload as Partial<TaskRow>),
				updated_at: '2026-04-28T00:05:00.000Z'
			};
			this.state.tasks[index] = updated;
			return Promise.resolve({ data: updated, error: null });
		}

		const row = this.filteredRows()[0] ?? null;
		return Promise.resolve({
			data: row,
			error: row ? null : new Error('Task not found')
		});
	}
}

class OntoAssetsQueryBuilderMock {
	private idFilter: string | null = null;
	private projectIdsFilter: string[] | null = null;
	private kindFilter: string | null = null;
	private ocrStatusFilter: string | null = null;
	private deletedAtFilterApplied = false;
	private searchTerm: string | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rangeBounds: { from: number; to: number } | null = null;

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}
		if (field === 'kind' && typeof value === 'string') {
			this.kindFilter = value;
		}
		if (field === 'ocr_status' && typeof value === 'string') {
			this.ocrStatusFilter = value;
		}

		return this;
	}

	in(field: string, value: unknown) {
		if (field === 'project_id' && Array.isArray(value)) {
			this.projectIdsFilter = value.filter(
				(entry): entry is string => typeof entry === 'string'
			);
		}

		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}

		return this;
	}

	or(filter: string) {
		const match = filter.match(/%([^%]+)%/);
		this.searchTerm = match?.[1]?.toLowerCase() ?? null;
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	range(from: number, to: number) {
		this.rangeBounds = { from, to };
		return this;
	}

	maybeSingle() {
		const rows = this.filteredRows();
		return Promise.resolve({
			data: rows[0] ? this.serialize(rows[0]) : null,
			error: null
		});
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown>[];
					error: any;
					count: number;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeList()).then(onfulfilled, onrejected);
	}

	private matches(row: AssetRow): boolean {
		if (this.idFilter !== null && row.id !== this.idFilter) return false;
		if (this.projectIdsFilter !== null && !this.projectIdsFilter.includes(row.project_id)) {
			return false;
		}
		if (this.kindFilter !== null && row.kind !== this.kindFilter) return false;
		if (this.ocrStatusFilter !== null && row.ocr_status !== this.ocrStatusFilter) {
			return false;
		}
		if (this.deletedAtFilterApplied && row.deleted_at !== null) return false;
		if (this.searchTerm) {
			const haystack = [
				row.original_filename,
				row.caption,
				row.alt_text,
				row.extraction_summary,
				row.extracted_text
			]
				.filter((value): value is string => typeof value === 'string')
				.join(' ')
				.toLowerCase();
			if (!haystack.includes(this.searchTerm)) return false;
		}

		return true;
	}

	private filteredRows() {
		let rows = (this.state.assets ?? []).filter((asset) => this.matches(asset));
		if (this.orderBy) {
			const orderBy = this.orderBy;
			const field = orderBy.field as keyof AssetRow;
			rows = [...rows].sort((a, b) => {
				const left = String(a[field] ?? '');
				const right = String(b[field] ?? '');
				return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
			});
		}
		return rows;
	}

	private executeList() {
		const rows = this.filteredRows();
		const ranged = this.rangeBounds
			? rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1)
			: rows;
		return {
			data: ranged.map((row) => this.serialize(row)),
			error: null,
			count: rows.length
		};
	}

	private serialize(row: AssetRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			kind: row.kind,
			original_filename: row.original_filename,
			content_type: row.content_type,
			file_size_bytes: row.file_size_bytes,
			width: row.width,
			height: row.height,
			checksum_sha256: row.checksum_sha256,
			alt_text: row.alt_text,
			caption: row.caption,
			ocr_status: row.ocr_status,
			extraction_summary: row.extraction_summary,
			extracted_text: row.extracted_text,
			created_at: row.created_at,
			updated_at: row.updated_at,
			deleted_at: row.deleted_at,
			storage_bucket: row.storage_bucket ?? 'onto-assets',
			storage_path: row.storage_path ?? 'projects/p/assets/a/original.png'
		};
	}
}

class AgentCallToolExecutionsQueryBuilderMock {
	private action: 'select' | 'insert' | 'update' | null = null;
	private filters = new Map<string, unknown>();
	private insertPayload: Record<string, unknown> | null = null;
	private updatePayload: Record<string, unknown> | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rowLimit: number | null = null;
	private shouldReturnSelection = false;

	constructor(private readonly state: State) {}

	select() {
		this.shouldReturnSelection = true;
		if (!this.action) {
			this.action = 'select';
		}

		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return this;
	}

	update(payload: Record<string, unknown>) {
		this.action = 'update';
		this.updatePayload = payload;
		return this;
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	maybeSingle() {
		return Promise.resolve(this.executeSingle(false));
	}

	single() {
		return Promise.resolve(this.executeSingle(true));
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown> | null;
					error: any;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeSingle(false)).then(onfulfilled, onrejected);
	}

	private matches(row: Record<string, unknown>): boolean {
		return Array.from(this.filters.entries()).every(([field, value]) => row[field] === value);
	}

	private executeSingle(requireRow: boolean) {
		if (this.action === 'insert' && this.insertPayload) {
			const idempotencyKey = this.insertPayload.idempotency_key;
			if (typeof idempotencyKey === 'string' && idempotencyKey.length > 0) {
				const duplicate = this.state.toolExecutions.find(
					(row) =>
						row.external_agent_caller_id ===
							this.insertPayload?.external_agent_caller_id &&
						row.op === this.insertPayload?.op &&
						row.idempotency_key === idempotencyKey &&
						(row.status === 'pending' || row.status === 'succeeded')
				);
				if (duplicate) {
					return {
						data: null,
						error: {
							code: '23505',
							message: 'duplicate key value violates unique constraint'
						}
					};
				}
			}

			const id = `99999999-9999-9999-9999-${String(this.state.nextToolExecutionId).padStart(12, '0')}`;
			this.state.nextToolExecutionId += 1;
			const now = '2026-04-28T00:00:00.000Z';
			const row = {
				id,
				agent_call_session_id: String(this.insertPayload.agent_call_session_id),
				external_agent_caller_id: String(this.insertPayload.external_agent_caller_id),
				user_id: String(this.insertPayload.user_id),
				op: String(this.insertPayload.op),
				idempotency_key:
					typeof this.insertPayload.idempotency_key === 'string'
						? this.insertPayload.idempotency_key
						: null,
				status:
					typeof this.insertPayload.status === 'string'
						? this.insertPayload.status
						: 'pending',
				args: ((this.insertPayload.args ?? {}) as Record<string, unknown>) ?? {},
				response_payload:
					this.insertPayload.response_payload &&
					typeof this.insertPayload.response_payload === 'object'
						? (this.insertPayload.response_payload as Record<string, unknown>)
						: null,
				error_payload:
					this.insertPayload.error_payload &&
					typeof this.insertPayload.error_payload === 'object'
						? (this.insertPayload.error_payload as Record<string, unknown>)
						: null,
				entity_kind:
					typeof this.insertPayload.entity_kind === 'string'
						? this.insertPayload.entity_kind
						: null,
				entity_id:
					typeof this.insertPayload.entity_id === 'string'
						? this.insertPayload.entity_id
						: null,
				started_at:
					typeof this.insertPayload.started_at === 'string'
						? this.insertPayload.started_at
						: now,
				completed_at:
					typeof this.insertPayload.completed_at === 'string'
						? this.insertPayload.completed_at
						: null,
				created_at: now,
				updated_at:
					typeof this.insertPayload.updated_at === 'string'
						? this.insertPayload.updated_at
						: now
			};
			this.state.toolExecutions.push(row);
			return { data: this.shouldReturnSelection ? row : null, error: null };
		}

		if (this.action === 'update' && this.updatePayload) {
			const index = this.state.toolExecutions.findIndex((row) => this.matches(row));
			if (index < 0) {
				return { data: null, error: requireRow ? new Error('Execution not found') : null };
			}

			const updated = {
				...this.state.toolExecutions[index],
				...this.updatePayload
			};
			this.state.toolExecutions[index] = updated;
			return { data: this.shouldReturnSelection ? updated : null, error: null };
		}

		let rows = this.state.toolExecutions.filter((row) => this.matches(row));
		if (this.orderBy) {
			rows = [...rows].sort((a, b) => {
				const left = String(a[this.orderBy?.field] ?? '');
				const right = String(b[this.orderBy?.field] ?? '');
				return this.orderBy?.ascending
					? left.localeCompare(right)
					: right.localeCompare(left);
			});
		}
		if (typeof this.rowLimit === 'number') {
			rows = rows.slice(0, this.rowLimit);
		}

		return {
			data: rows[0] ?? null,
			error: rows[0] || !requireRow ? null : new Error('Row not found')
		};
	}
}

class SecurityEventsQueryBuilderMock {
	constructor(private readonly state: State) {}

	insert(payload: Record<string, unknown>) {
		this.state.securityEvents ??= [];
		this.state.securityEvents.push(payload);
		return Promise.resolve({ data: null, error: null });
	}
}

class OntoProjectLogsQueryBuilderMock {
	private filters = new Map<string, unknown>();
	private inFilters = new Map<string, unknown[]>();
	private minCreatedAt: string | null = null;
	private rowLimit: number | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private insertPayload: Record<string, unknown> | null = null;
	private action: 'select' | 'insert' | null = null;

	constructor(private readonly state: State) {}

	select() {
		this.action = 'select';
		return this;
	}

	insert(payload: Record<string, unknown>) {
		this.action = 'insert';
		this.insertPayload = payload;
		return Promise.resolve({
			data: null,
			error: this.executeInsert()
		});
	}

	eq(field: string, value: unknown) {
		this.filters.set(field, value);
		return this;
	}

	in(field: string, values: unknown[]) {
		this.inFilters.set(field, values);
		return this;
	}

	gte(field: string, value: unknown) {
		if (field === 'created_at' && typeof value === 'string') {
			this.minCreatedAt = value;
		}
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown>[];
					error: any;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeSelect()).then(onfulfilled, onrejected);
	}

	private executeInsert() {
		if (this.action !== 'insert' || !this.insertPayload) return null;
		this.state.projectLogs ??= [];
		const id = `aaaaaaaa-0000-0000-0000-${String(this.state.projectLogs.length + 1).padStart(12, '0')}`;
		this.state.projectLogs.push({
			id,
			...this.insertPayload
		});
		return null;
	}

	private executeSelect() {
		let rows = (this.state.projectLogs ?? []).filter((row) => {
			for (const [field, value] of this.filters.entries()) {
				if (row[field] !== value) return false;
			}
			for (const [field, values] of this.inFilters.entries()) {
				if (!values.includes(row[field])) return false;
			}
			if (this.minCreatedAt && String(row.created_at ?? '') < this.minCreatedAt) {
				return false;
			}
			return true;
		});
		if (this.orderBy) {
			const orderBy = this.orderBy;
			rows = [...rows].sort((a, b) => {
				const left = String(a[orderBy.field] ?? '');
				const right = String(b[orderBy.field] ?? '');
				return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
			});
		}
		const limited = typeof this.rowLimit === 'number' ? rows.slice(0, this.rowLimit) : rows;
		return { data: limited, error: null };
	}
}

class OntoEventsQueryBuilderMock {
	private idFilter: string | null = null;
	private projectIdFilter: string | null = null;
	private deletedAtFilterApplied = false;
	private startAtGte: string | null = null;
	private startAtLte: string | null = null;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rowLimit: number | null = null;

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}
		if (field === 'project_id' && typeof value === 'string') {
			this.projectIdFilter = value;
		}
		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'deleted_at' && value === null) {
			this.deletedAtFilterApplied = true;
		}
		return this;
	}

	gte(field: string, value: unknown) {
		if (field === 'start_at' && typeof value === 'string') {
			this.startAtGte = value;
		}
		return this;
	}

	lte(field: string, value: unknown) {
		if (field === 'start_at' && typeof value === 'string') {
			this.startAtLte = value;
		}
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	maybeSingle() {
		const row = this.filteredRows()[0] ?? null;
		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: null
		});
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown>[];
					error: any;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeList()).then(onfulfilled, onrejected);
	}

	private matches(row: EventRow): boolean {
		if (this.idFilter !== null && row.id !== this.idFilter) return false;
		if (this.projectIdFilter !== null && row.project_id !== this.projectIdFilter) return false;
		if (this.deletedAtFilterApplied && row.deleted_at !== null) return false;
		if (this.startAtGte !== null && row.start_at < this.startAtGte) return false;
		if (this.startAtLte !== null && row.start_at > this.startAtLte) return false;
		return true;
	}

	private filteredRows() {
		let rows = (this.state.events ?? []).filter((event) => this.matches(event));
		if (this.orderBy) {
			const orderBy = this.orderBy;
			const field = orderBy.field as keyof EventRow;
			rows = [...rows].sort((a, b) => {
				const left = String(a[field] ?? '');
				const right = String(b[field] ?? '');
				return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
			});
		}
		return rows;
	}

	private executeList() {
		const rows = this.filteredRows();
		const limited = this.rowLimit !== null ? rows.slice(0, this.rowLimit) : rows;
		return {
			data: limited.map((row) => this.serialize(row)),
			error: null
		};
	}

	private serialize(row: EventRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			title: row.title,
			state_key: row.state_key,
			start_at: row.start_at,
			end_at: row.end_at,
			location: row.location,
			updated_at: row.updated_at,
			deleted_at: row.deleted_at,
			owner_entity_type: row.owner_entity_type ?? 'project',
			owner_entity_id: row.owner_entity_id ?? row.project_id
		};
	}
}

class OntoProjectsQueryBuilderMock {
	private idFilter: string | null = null;

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'id' && typeof value === 'string') {
			this.idFilter = value;
		}
		return this;
	}

	maybeSingle() {
		const row = (this.state.projects ?? []).find(
			(project) => this.idFilter === null || project.id === this.idFilter
		);

		return Promise.resolve({
			data: row ? this.serialize(row) : null,
			error: null
		});
	}

	private serialize(row: ProjectRow) {
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			type_key: row.type_key,
			state_key: row.state_key,
			props: row.props,
			start_at: row.start_at,
			end_at: row.end_at,
			created_at: row.created_at,
			updated_at: row.updated_at,
			archived_at: row.archived_at ?? null,
			deleted_at: row.deleted_at,
			created_by: row.created_by ?? null
		};
	}
}

class OntoProjectMembersQueryBuilderMock {
	private projectIdFilter: string | null = null;
	private removedAtFilterApplied = false;
	private orderBy: { field: string; ascending: boolean } | null = null;
	private rowLimit: number | null = null;

	constructor(private readonly state: State) {}

	select() {
		return this;
	}

	eq(field: string, value: unknown) {
		if (field === 'project_id' && typeof value === 'string') {
			this.projectIdFilter = value;
		}
		return this;
	}

	is(field: string, value: unknown) {
		if (field === 'removed_at' && value === null) {
			this.removedAtFilterApplied = true;
		}
		return this;
	}

	order(field: string, options?: { ascending?: boolean }) {
		this.orderBy = { field, ascending: options?.ascending !== false };
		return this;
	}

	limit(value: number) {
		this.rowLimit = value;
		return this;
	}

	then<TResult1 = any, TResult2 = never>(
		onfulfilled?:
			| ((value: {
					data: Record<string, unknown>[];
					error: any;
					count: number;
			  }) => TResult1 | PromiseLike<TResult1>)
			| null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
	) {
		return Promise.resolve(this.executeList()).then(onfulfilled, onrejected);
	}

	private matches(row: ProjectMemberRow): boolean {
		if (this.projectIdFilter !== null && row.project_id !== this.projectIdFilter) return false;
		if (this.removedAtFilterApplied && row.removed_at !== null) return false;
		return true;
	}

	private filteredRows() {
		let rows = (this.state.projectMembers ?? []).filter((member) => this.matches(member));
		if (this.orderBy) {
			const orderBy = this.orderBy;
			const field = orderBy.field as keyof ProjectMemberRow;
			rows = [...rows].sort((a, b) => {
				const left = String(a[field] ?? '');
				const right = String(b[field] ?? '');
				return orderBy.ascending ? left.localeCompare(right) : right.localeCompare(left);
			});
		}
		return rows;
	}

	private executeList() {
		const rows = this.filteredRows();
		const limited = this.rowLimit !== null ? rows.slice(0, this.rowLimit) : rows;
		return {
			data: limited.map((row) => ({
				id: row.id,
				project_id: row.project_id,
				actor_id: row.actor_id,
				role_key: row.role_key,
				access: row.access,
				role_name: row.role_name,
				role_description: row.role_description,
				created_at: row.created_at,
				removed_at: row.removed_at,
				actor: row.actor ?? null
			})),
			error: null,
			count: rows.length
		};
	}
}

function createAdminMock(state: State) {
	return {
		from: vi.fn((table: string) => {
			if (table === 'onto_projects') {
				return new OntoProjectsQueryBuilderMock(state);
			}

			if (table === 'onto_documents') {
				return new OntoDocumentsQueryBuilderMock(state);
			}

			if (table === 'onto_tasks') {
				return new OntoTasksQueryBuilderMock(state);
			}

			if (table === 'onto_assets') {
				return new OntoAssetsQueryBuilderMock(state);
			}

			if (table === 'agent_call_tool_executions') {
				return new AgentCallToolExecutionsQueryBuilderMock(state);
			}

			if (table === 'security_events') {
				return new SecurityEventsQueryBuilderMock(state);
			}

			if (table === 'onto_project_logs') {
				return new OntoProjectLogsQueryBuilderMock(state);
			}

			if (table === 'onto_events') {
				return new OntoEventsQueryBuilderMock(state);
			}

			if (table === 'onto_project_members') {
				return new OntoProjectMembersQueryBuilderMock(state);
			}

			if (table === 'external_agent_callers') {
				// Minimal builder for the auto-scope persistence in grantCallerProjectAccess.
				const record = { policy: state.callerPolicy ?? null };
				const builder: any = {
					select: () => builder,
					eq: () => builder,
					maybeSingle: async () => ({ data: record, error: null }),
					update: (patch: { policy?: unknown }) => {
						if (patch && 'policy' in patch) {
							state.callerPolicy = patch.policy as Record<string, unknown>;
						}
						return builder;
					},
					then: (resolve: (value: unknown) => unknown) =>
						resolve({ data: null, error: null })
				};
				return builder;
			}

			throw new Error(`Unexpected table ${table}`);
		}),
		rpc: vi.fn()
	};
}

describe('external tool gateway', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		ensureActorIdMock.mockResolvedValue('actor-1');
		addDocumentToTreeMock.mockResolvedValue({ version: 2, root: [] });
		createOrMergeDocumentVersionMock.mockResolvedValue({
			status: 'created',
			versionNumber: 1,
			versionId: 'version-1'
		});
		validateProjectSpecMock.mockReturnValue({ valid: true, errors: [] });
		instantiateProjectMock.mockResolvedValue({
			project_id: '88888888-8888-8888-8888-888888888888',
			counts: {}
		});
		resolveEntityMentionUserIdsMock.mockResolvedValue([]);
		notifyEntityMentionsAddedMock.mockResolvedValue({ notifiedUserIds: [] });
		syncTaskEventsMock.mockResolvedValue(undefined);
		fetchProjectSummariesMock.mockResolvedValue([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Allowed Project',
				description: 'Main workspace',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 7,
				goal_count: 1,
				plan_count: 2,
				document_count: 4,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			}
		]);
	});

	it('returns discovery tools plus scoped direct tools for external callers', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
		});

		expect(tools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining([
				'skill_load',
				'tool_search',
				'tool_schema',
				'list_onto_projects',
				'search_onto_projects',
				'get_onto_project_details',
				'get_onto_project_status',
				'list_onto_tasks',
				'search_onto_tasks',
				'get_onto_task_details',
				'list_onto_documents',
				'search_onto_documents',
				'get_onto_document_details',
				'search_onto_assets',
				'get_onto_asset',
				'search_ontology',
				'list_calendar_events',
				'get_calendar_event_details',
				'get_project_calendar',
				'create_onto_task'
			])
		);
		expect(tools.map((tool) => tool.name)).not.toContain('update_onto_task');
	});

	it('filters internal skill reference handles from external skill loads', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'skill_load',
			arguments: {
				skill: 'cold_email_engagement_first_outreach',
				format: 'short'
			}
		});

		expect(result).toMatchObject({
			type: 'skill',
			id: 'cold_email_engagement_first_outreach'
		});
		expect(result.reference_modules).toEqual([
			expect.objectContaining({
				id: 'cold_email_engagement_first_outreach.public_mode_router',
				visibility: 'public'
			})
		]);
		expect(result.reference_modules).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					visibility: 'internal'
				})
			])
		);
	});

	it('returns a compact project status packet for first-time external agent context', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const now = Date.now();
		const overdueAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
		const dueSoonAt = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
		const upcomingAt = new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
		const staleFutureAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
		const state: State = {
			documents: [],
			tasks: [
				{
					id: '77777777-7777-7777-7777-777777777777',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Overdue launch checklist',
					description: null,
					type_key: 'task.default',
					state_key: 'todo',
					priority: 4,
					start_at: null,
					due_at: overdueAt,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-29T00:00:00.000Z',
					archived_at: null,
					deleted_at: null
				},
				{
					id: '77777777-7777-7777-7777-777777777778',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Due soon launch memo',
					description: null,
					type_key: 'task.default',
					state_key: 'in_progress',
					priority: 5,
					start_at: null,
					due_at: dueSoonAt,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-30T00:00:00.000Z',
					archived_at: null,
					deleted_at: null
				},
				{
					id: '77777777-7777-7777-7777-777777777779',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Completed task should not appear',
					description: null,
					type_key: 'task.default',
					state_key: 'done',
					priority: 1,
					start_at: null,
					due_at: overdueAt,
					completed_at: overdueAt,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-30T00:00:00.000Z',
					archived_at: null,
					deleted_at: null
				},
				{
					id: '77777777-7777-7777-7777-777777777780',
					project_id: '66666666-6666-6666-6666-666666666666',
					title: 'Hidden project task',
					description: null,
					type_key: 'task.default',
					state_key: 'todo',
					priority: 1,
					start_at: null,
					due_at: dueSoonAt,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-30T00:00:00.000Z',
					archived_at: null,
					deleted_at: null
				}
			],
			events: [
				{
					id: '88888888-8888-8888-8888-888888888888',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Launch review',
					state_key: 'confirmed',
					start_at: upcomingAt,
					end_at: null,
					location: 'Zoom',
					updated_at: '2026-04-30T00:00:00.000Z',
					deleted_at: null
				},
				{
					id: '88888888-8888-8888-8888-888888888889',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Future out of window',
					state_key: 'confirmed',
					start_at: staleFutureAt,
					end_at: null,
					location: null,
					updated_at: '2026-04-30T00:00:00.000Z',
					deleted_at: null
				}
			],
			projectLogs: [
				{
					project_id: '44444444-4444-4444-4444-444444444444',
					entity_type: 'document',
					entity_id: '66666666-6666-6666-6666-666666666666',
					action: 'updated',
					created_at: '2026-05-02T00:00:00.000Z',
					before_data: { title: 'Old brief' },
					after_data: { title: 'Launch brief' },
					change_source: 'agent_call'
				},
				{
					project_id: '44444444-4444-4444-4444-444444444444',
					entity_type: 'task',
					entity_id: '77777777-7777-7777-7777-777777777777',
					action: 'created',
					created_at: '2026-05-01T00:00:00.000Z',
					before_data: null,
					after_data: { title: 'Overdue launch checklist' },
					change_source: 'user'
				},
				{
					project_id: '66666666-6666-6666-6666-666666666666',
					entity_type: 'task',
					entity_id: '99999999-9999-9999-9999-999999999999',
					action: 'updated',
					created_at: '2026-05-03T00:00:00.000Z',
					before_data: null,
					after_data: { title: 'Hidden change' },
					change_source: 'user'
				}
			],
			projectMembers: [
				{
					id: 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
					project_id: '44444444-4444-4444-4444-444444444444',
					actor_id: 'actor-1',
					role_key: 'owner',
					access: 'admin',
					role_name: 'Project Owner',
					role_description: 'Owns direction and final decisions.',
					created_at: '2026-04-01T00:00:00.000Z',
					removed_at: null,
					actor: {
						id: 'actor-1',
						user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
						name: 'Dana Owner',
						email: 'dana@example.com'
					}
				},
				{
					id: 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa',
					project_id: '44444444-4444-4444-4444-444444444444',
					actor_id: 'actor-collab-1',
					role_key: 'editor',
					access: 'write',
					role_name: 'Launch Lead',
					role_description: 'Coordinates launch work and dependencies.',
					created_at: '2026-04-02T00:00:00.000Z',
					removed_at: null,
					actor: {
						id: 'actor-collab-1',
						user_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
						name: 'Lee Collaborator',
						email: 'lee@example.com'
					}
				},
				{
					id: 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',
					project_id: '44444444-4444-4444-4444-444444444444',
					actor_id: 'actor-removed-1',
					role_key: 'viewer',
					access: 'read',
					role_name: null,
					role_description: null,
					created_at: '2026-04-03T00:00:00.000Z',
					removed_at: '2026-04-04T00:00:00.000Z',
					actor: {
						id: 'actor-removed-1',
						user_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
						name: 'Removed Member',
						email: 'removed@example.com'
					}
				},
				{
					id: 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa',
					project_id: '66666666-6666-6666-6666-666666666666',
					actor_id: 'actor-hidden-1',
					role_key: 'owner',
					access: 'admin',
					role_name: 'Hidden Owner',
					role_description: null,
					created_at: '2026-04-01T00:00:00.000Z',
					removed_at: null,
					actor: {
						id: 'actor-hidden-1',
						user_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
						name: 'Hidden Member',
						email: 'hidden@example.com'
					}
				}
			],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'get_onto_project_status',
			arguments: {
				task_limit: 4,
				event_limit: 4
			}
		});

		expect(result).toMatchObject({
			op: 'onto.project.status.get',
			ok: true,
			result: {
				project: {
					id: '44444444-4444-4444-4444-444444444444',
					name: 'Allowed Project'
				},
				overview: {
					counts: {
						tasks: 7,
						documents: 4,
						plans: 2,
						goals: 1,
						collaborators: 2
					},
					count_summary:
						'Allowed Project has 7 tasks, 4 documents, 2 plans, 1 goal, 2 collaborators.'
				},
				collaborators: {
					count: 2,
					shown: 2,
					truncated: false,
					members: [
						expect.objectContaining({
							actor_id: 'actor-1',
							display_name: 'Dana Owner',
							email: 'dana@example.com',
							role_key: 'owner',
							role_name: 'Project Owner',
							access: 'admin',
							is_current_user: true
						}),
						expect.objectContaining({
							actor_id: 'actor-collab-1',
							display_name: 'Lee Collaborator',
							email: 'lee@example.com',
							role_key: 'editor',
							role_name: 'Launch Lead',
							access: 'write',
							is_current_user: false
						})
					]
				},
				recent_changes: [
					expect.objectContaining({
						entity_type: 'document',
						action: 'updated',
						title: 'Launch brief'
					}),
					expect.objectContaining({
						entity_type: 'task',
						action: 'created',
						title: 'Overdue launch checklist'
					})
				],
				upcoming: {
					overdue_tasks: [
						expect.objectContaining({
							title: 'Overdue launch checklist',
							due_at: overdueAt
						})
					],
					due_soon_tasks: [
						expect.objectContaining({
							title: 'Due soon launch memo',
							due_at: dueSoonAt
						})
					],
					upcoming_events: [
						expect.objectContaining({
							title: 'Launch review',
							start_at: upcomingAt
						})
					]
				}
			}
		});
		expect(JSON.stringify(result.result)).not.toContain('Hidden project task');
		expect(JSON.stringify(result.result)).not.toContain('Hidden change');
		expect(JSON.stringify(result.result)).not.toContain('Hidden Member');
		expect(JSON.stringify(result.result)).not.toContain('Removed Member');
		expect(JSON.stringify(result.result)).not.toContain('Completed task should not appear');
		expect(JSON.stringify(result.result)).not.toContain('Future out of window');
		expect(state.toolExecutions[0]).toMatchObject({
			op: 'onto.project.status.get',
			status: 'succeeded',
			entity_kind: 'project',
			entity_id: '44444444-4444-4444-4444-444444444444'
		});
	});

	it('exposes project creation for any read_write caller that whitelists the op, scoped or not', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');
		const allowedOps = [
			...BUILDOS_AGENT_READ_OPS,
			'onto.project.create',
			'onto.project.update'
		] as const;

		const unscopedTools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...allowedOps]
		});
		const scopedTools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			project_ids: ['44444444-4444-4444-4444-444444444444'],
			allowed_ops: [...allowedOps]
		});

		// Project creation is no longer tied to all-project scope: a project-scoped
		// key that whitelists onto.project.create still gets the create tool.
		expect(unscopedTools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining(['create_onto_project', 'update_onto_project'])
		);
		expect(scopedTools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining(['create_onto_project', 'update_onto_project'])
		);
	});

	it('omits project creation when the op is not whitelisted', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');
		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			project_ids: ['44444444-4444-4444-4444-444444444444'],
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.project.update']
		});

		expect(tools.map((tool) => tool.name)).toContain('update_onto_project');
		expect(tools.map((tool) => tool.name)).not.toContain('create_onto_project');
	});

	it('exposes schemas for every supported external op in the granted scope', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const scope = {
			mode: 'read_write' as const,
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, ...BUILDOS_AGENT_WRITE_OPS]
		};

		for (const op of scope.allowed_ops) {
			const result = await executeBuildosAgentGatewayTool({
				admin: createAdminMock({
					documents: [],
					tasks: [],
					toolExecutions: [],
					nextTaskId: 1,
					nextToolExecutionId: 1
				}),
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				scope,
				toolName: 'tool_schema',
				arguments: { op, include_schema: true }
			});

			expect(result, `missing external gateway schema for ${op}`).toMatchObject({
				type: 'tool_schema',
				op
			});
		}
	});

	it('hides write tools for read-only external callers even when write ops are present', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_only',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, ...BUILDOS_AGENT_WRITE_OPS]
		});
		const toolNames = tools.map((tool) => tool.name);

		expect(toolNames).toEqual(
			expect.arrayContaining([
				'list_onto_goals',
				'search_onto_goals',
				'search_onto_plans',
				'search_onto_milestones',
				'search_onto_risks',
				'get_onto_project_graph',
				'get_document_tree',
				'list_task_documents',
				'search_onto_assets',
				'get_onto_asset',
				'get_linked_entities',
				'list_calendar_events'
			])
		);
		expect(toolNames).not.toEqual(
			expect.arrayContaining([
				'create_onto_goal',
				'update_onto_plan',
				'create_task_document',
				'move_document_in_tree',
				'link_onto_entities',
				'unlink_onto_edge',
				'create_calendar_event'
			])
		);
	});

	it('returns newly exposed ontology tools through scoped tool_search', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const scope = {
			mode: 'read_write' as const,
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, ...BUILDOS_AGENT_WRITE_OPS]
		};
		const admin = createAdminMock({
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		});

		const writeResult = await executeBuildosAgentGatewayTool({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope,
			toolName: 'tool_search',
			arguments: { query: 'link entities', group: 'onto', kind: 'write', limit: 8 }
		});
		const readResult = await executeBuildosAgentGatewayTool({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope,
			toolName: 'tool_search',
			arguments: {
				query: 'document tree task documents',
				group: 'onto',
				kind: 'read',
				limit: 8
			}
		});

		expect(writeResult).toMatchObject({
			type: 'tool_search_results',
			matches: expect.arrayContaining([
				expect.objectContaining({
					op: 'onto.edge.link',
					tool_name: 'link_onto_entities'
				})
			])
		});
		expect(readResult).toMatchObject({
			type: 'tool_search_results',
			matches: expect.arrayContaining([
				expect.objectContaining({
					op: 'onto.document.tree.get',
					tool_name: 'get_document_tree'
				}),
				expect.objectContaining({
					op: 'onto.task.docs.list',
					tool_name: 'list_task_documents'
				})
			])
		});
	});

	it('keeps legacy ontology search tools discoverable for scoped external callers', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const scope = {
			mode: 'read_only' as const,
			allowed_ops: [...BUILDOS_AGENT_READ_OPS]
		};
		const admin = createAdminMock({
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		});
		const legacySearchTools = [
			{ op: 'onto.goal.search', toolName: 'search_onto_goals' },
			{ op: 'onto.plan.search', toolName: 'search_onto_plans' },
			{ op: 'onto.milestone.search', toolName: 'search_onto_milestones' },
			{ op: 'onto.risk.search', toolName: 'search_onto_risks' }
		] as const;

		for (const { op, toolName } of legacySearchTools) {
			const result = await executeBuildosAgentGatewayTool({
				admin,
				userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				scope,
				toolName: 'tool_search',
				arguments: { query: toolName, group: 'onto', kind: 'read', limit: 8 }
			});

			expect(result).toMatchObject({
				type: 'tool_search_results',
				matches: expect.arrayContaining([
					expect.objectContaining({
						op,
						tool_name: toolName
					})
				])
			});
		}
	});

	it('records telemetry when a legacy gateway op alias is used', async () => {
		const { executeGatewayOp } = await import(
			'@buildos/shared-agent-ops/gateway/op-execution-gateway'
		);
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeGatewayOp({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_only',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			arguments: {
				op: 'reorganize_onto_project_graph',
				args: {}
			},
			registryOps: {},
			registryVersion: 'test',
			securityEventOptions: { delivery: 'blocking' }
		});

		expect(result).toMatchObject({
			ok: false,
			error: { code: 'NOT_FOUND' }
		});
		expect(state.securityEvents).toContainEqual(
			expect.objectContaining({
				event_type: 'agent.tool.alias_used',
				category: 'agent',
				outcome: 'info',
				severity: 'low',
				metadata: expect.objectContaining({
					requestedOp: 'reorganize_onto_project_graph',
					canonicalOp: 'onto.project.graph.reorganize',
					opAliasUsed: true,
					argAliasesUsed: []
				})
			})
		);
	});

	it('exposes image asset tools through scoped discovery without granting media URLs', async () => {
		const { executeBuildosAgentGatewayTool, getBuildosAgentGatewayTools } = await import(
			'./external-tool-gateway'
		);
		const scope = {
			mode: 'read_only' as const,
			allowed_ops: [...BUILDOS_AGENT_READ_OPS]
		};
		const admin = createAdminMock({
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		});

		const tools = getBuildosAgentGatewayTools(scope);
		const searchResult = await executeBuildosAgentGatewayTool({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope,
			toolName: 'tool_search',
			arguments: { query: 'image asset OCR', group: 'onto', kind: 'read', limit: 8 }
		});
		const schemaResult = await executeBuildosAgentGatewayTool({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope,
			toolName: 'tool_schema',
			arguments: { op: 'onto.asset.search', include_schema: true }
		});

		expect(tools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining(['search_onto_assets', 'get_onto_asset'])
		);
		expect(searchResult).toMatchObject({
			type: 'tool_search_results',
			matches: expect.arrayContaining([
				expect.objectContaining({
					op: 'onto.asset.search',
					tool_name: 'search_onto_assets',
					entity: 'asset'
				})
			])
		});
		expect(schemaResult).toMatchObject({
			type: 'tool_schema',
			op: 'onto.asset.search',
			callable_tool: 'search_onto_assets',
			schema: {
				properties: {
					include_text_preview: expect.objectContaining({ type: 'boolean' })
				}
			}
		});
		const schemaJson = JSON.stringify(schemaResult.schema).toLowerCase();
		expect(schemaJson).not.toContain('signed_url');
		expect(schemaJson).not.toContain('storage_path');
		expect(schemaJson).not.toContain('storage_bucket');
	});

	it('searches existing image assets as bounded metadata for external callers', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			assets: [
				{
					id: '88888888-8888-8888-8888-888888888888',
					project_id: '44444444-4444-4444-4444-444444444444',
					kind: 'image',
					original_filename: 'invoice-screenshot.png',
					content_type: 'image/png',
					file_size_bytes: '2048',
					width: 1200,
					height: 900,
					checksum_sha256:
						'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					alt_text: 'Invoice screenshot',
					caption: 'April invoice',
					ocr_status: 'complete',
					extraction_summary: 'Invoice total and due date are visible.',
					extracted_text: 'Invoice total $42.00 due May 30.',
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:10:00.000Z',
					deleted_at: null,
					storage_bucket: 'onto-assets',
					storage_path: 'projects/hidden/raw.png'
				},
				{
					id: '99999999-9999-9999-9999-999999999999',
					project_id: '66666666-6666-6666-6666-666666666666',
					kind: 'image',
					original_filename: 'hidden.png',
					content_type: 'image/png',
					file_size_bytes: 512,
					width: null,
					height: null,
					checksum_sha256:
						'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					alt_text: null,
					caption: null,
					ocr_status: 'complete',
					extraction_summary: 'Hidden',
					extracted_text: 'Hidden text',
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:20:00.000Z',
					deleted_at: null
				}
			],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'search_onto_assets',
			arguments: {
				query: 'invoice',
				include_text_preview: true
			}
		});

		expect(result).toMatchObject({
			op: 'onto.asset.search',
			ok: true,
			result: {
				total: 1,
				assets: [
					expect.objectContaining({
						id: '88888888-8888-8888-8888-888888888888',
						project_name: 'Allowed Project',
						file_size_bytes: 2048,
						checksum_sha256_suffix: 'aaaaaaaaaaaa',
						extracted_text_preview: 'Invoice total $42.00 due May 30.'
					})
				],
				access: {
					raw_pixels: false,
					signed_urls: false
				}
			}
		});
		expect(JSON.stringify(result.result)).not.toContain('storage_path');
		expect(JSON.stringify(result.result)).not.toContain('storage_bucket');
	});

	it('does not reveal scoped-out image assets through direct get', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				assets: [
					{
						id: '99999999-9999-9999-9999-999999999999',
						project_id: '66666666-6666-6666-6666-666666666666',
						kind: 'image',
						original_filename: 'hidden.png',
						content_type: 'image/png',
						file_size_bytes: 512,
						width: null,
						height: null,
						checksum_sha256:
							'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
						alt_text: null,
						caption: null,
						ocr_status: 'complete',
						extraction_summary: 'Hidden',
						extracted_text: 'Hidden text',
						created_at: '2026-04-28T00:00:00.000Z',
						updated_at: '2026-04-28T00:20:00.000Z',
						deleted_at: null
					}
				],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'get_onto_asset',
			arguments: {
				asset_id: '99999999-9999-9999-9999-999999999999'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.asset.get',
			ok: false,
			error: {
				code: 'NOT_FOUND',
				message: 'Asset not found'
			}
		});
	});

	it('exposes scoped calendar write tools with external write safeguards', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'cal.event.create']
		});
		const createEventTool = tools.find((tool) => tool.name === 'create_calendar_event');

		expect(tools.map((tool) => tool.name)).toEqual(
			expect.arrayContaining(['create_calendar_event'])
		);
		expect(createEventTool?.inputSchema).toMatchObject({
			properties: {
				idempotency_key: expect.any(Object),
				dry_run: expect.any(Object)
			}
		});
	});

	it('requires external calendar event reads to be project scoped', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'list_calendar_events',
			arguments: {
				timeMin: '2026-05-01T00:00:00.000Z',
				timeMax: '2026-05-02T00:00:00.000Z'
			}
		});

		expect(result).toMatchObject({
			op: 'cal.event.list',
			ok: false,
			error: {
				code: 'FORBIDDEN',
				message: 'External calendar access must include project_id'
			}
		});
		expect(calendarExecutorMocks.listCalendarEvents).not.toHaveBeenCalled();
	});

	it('creates a project-scoped calendar event through a direct tool', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		calendarExecutorMocks.createCalendarEvent.mockResolvedValueOnce({
			event: {
				id: '88888888-8888-8888-8888-888888888888',
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Launch review'
			},
			sync: { success: true }
		});

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'cal.event.create']
			},
			toolName: 'create_calendar_event',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Launch review',
				start_at: '2026-05-01T18:00:00.000Z',
				idempotency_key: 'event-create-1'
			}
		});

		expect(result).toMatchObject({
			op: 'cal.event.create',
			ok: true,
			result: {
				event: {
					id: '88888888-8888-8888-8888-888888888888',
					title: 'Launch review'
				}
			}
		});
		expect(calendarExecutorMocks.createCalendarEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				project_id: '44444444-4444-4444-4444-444444444444',
				calendar_scope: 'project',
				title: 'Launch review'
			})
		);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]).toMatchObject({
			op: 'cal.event.create',
			status: 'succeeded',
			entity_kind: 'event',
			entity_id: '88888888-8888-8888-8888-888888888888'
		});
	});

	it('returns only discovery helpers when no scoped direct ops are available', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: []
		});

		expect(tools.map((tool) => tool.name)).toEqual([
			'skill_load',
			'tool_search',
			'tool_schema'
		]);
	});

	it('returns direct tool metadata from tool_schema', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'tool_schema',
			arguments: { op: 'onto.task.list', include_schema: true }
		});

		expect(result).toMatchObject({
			type: 'tool_schema',
			op: 'onto.task.list',
			tool_name: 'list_onto_tasks',
			callable_tool: 'list_onto_tasks',
			example_tool_call: {
				name: 'list_onto_tasks'
			}
		});
	});

	it('archives and restores tasks through the update operation', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [
				{
					id: '77777777-7777-7777-7777-777777777777',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Archive me',
					description: null,
					type_key: 'task.default',
					state_key: 'todo',
					priority: 3,
					start_at: null,
					due_at: null,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					archived_at: null,
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const admin = createAdminMock(state);
		const baseParams = {
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write' as const,
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.update' as const]
			},
			toolName: 'update_onto_task'
		};

		const archiveResult = await executeBuildosAgentGatewayTool({
			...baseParams,
			arguments: {
				task_id: '77777777-7777-7777-7777-777777777777',
				archived: true
			}
		});

		expect(archiveResult).toMatchObject({
			op: 'onto.task.update',
			ok: true,
			result: {
				task: {
					id: '77777777-7777-7777-7777-777777777777',
					archived_at: expect.any(String)
				}
			}
		});
		expect(state.tasks[0]?.archived_at).toEqual(expect.any(String));

		const restoreResult = await executeBuildosAgentGatewayTool({
			...baseParams,
			arguments: {
				task_id: '77777777-7777-7777-7777-777777777777',
				archived: false
			}
		});

		expect(restoreResult).toMatchObject({
			op: 'onto.task.update',
			ok: true,
			result: {
				task: {
					id: '77777777-7777-7777-7777-777777777777',
					archived_at: null
				}
			}
		});
		expect(state.tasks[0]?.archived_at).toBeNull();
		expect(state.toolExecutions.map((row) => row.status)).toEqual(['succeeded', 'succeeded']);
	});

	it('returns real project totals with pagination metadata', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		fetchProjectSummariesMock.mockResolvedValueOnce([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Alpha Project',
				description: 'Main workspace',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 7,
				goal_count: 1,
				plan_count: 2,
				document_count: 4,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			},
			{
				id: '55555555-5555-5555-5555-555555555555',
				name: 'Beta Project',
				description: 'Second workspace',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-29T00:00:00.000Z',
				task_count: 1,
				goal_count: 0,
				plan_count: 0,
				document_count: 0,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			},
			{
				id: '66666666-6666-6666-6666-666666666666',
				name: 'Gamma Project',
				description: 'Third workspace',
				type_key: 'project.internal',
				state_key: 'planning',
				updated_at: '2026-04-30T00:00:00.000Z',
				task_count: 0,
				goal_count: 0,
				plan_count: 0,
				document_count: 0,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			}
		]);

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'list_onto_projects',
			arguments: { limit: 1, offset: 1 }
		});

		expect(result).toMatchObject({
			op: 'onto.project.list',
			ok: true,
			result: {
				projects: [{ name: 'Beta Project' }],
				total: 3,
				pagination: {
					offset: 1,
					limit: 1,
					returned: 1,
					total_available: 3,
					has_more: true,
					next_offset: 2
				}
			}
		});
	});

	it('uses canonical search response shape and project filters', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		fetchProjectSummariesMock.mockResolvedValueOnce([
			{
				id: '44444444-4444-4444-4444-444444444444',
				name: 'Launch Project',
				description: 'Active launch',
				type_key: 'project.internal',
				state_key: 'active',
				updated_at: '2026-04-28T00:00:00.000Z',
				task_count: 7,
				goal_count: 1,
				plan_count: 2,
				document_count: 4,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			},
			{
				id: '55555555-5555-5555-5555-555555555555',
				name: 'Launch Archive',
				description: 'Completed launch',
				type_key: 'project.internal',
				state_key: 'completed',
				updated_at: '2026-04-29T00:00:00.000Z',
				task_count: 1,
				goal_count: 0,
				plan_count: 0,
				document_count: 0,
				owner_actor_id: 'actor-owner-1',
				access_role: 'owner',
				access_level: 'write'
			}
		]);

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'search_onto_projects',
			arguments: { query: 'launch', state_key: 'active' }
		});

		expect(result).toMatchObject({
			op: 'onto.project.search',
			ok: true,
			result: {
				query: 'launch',
				total: 1,
				projects: [{ name: 'Launch Project' }],
				results: [{ type: 'project', title: 'Launch Project' }],
				pagination: {
					offset: 0,
					returned: 1,
					total_available: 1,
					has_more: false,
					next_offset: null
				}
			}
		});
	});

	it('rejects invalid task state filters before querying enum columns', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const admin = createAdminMock({
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		});

		const result = await executeBuildosAgentGatewayTool({
			admin,
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'list_onto_tasks',
			arguments: { state_key: 'bogus_state' }
		});

		expect(result).toMatchObject({
			op: 'onto.task.list',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'state_key must be one of: todo, in_progress, blocked, done'
			}
		});
		expect(admin.from).not.toHaveBeenCalledWith('onto_tasks');
	});

	it('rejects invalid relationship direction values', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'get_entity_relationships',
			arguments: {
				entity_id: '44444444-4444-4444-4444-444444444444',
				direction: 'invalid'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.entity.relationships.get',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'direction must be one of: outgoing, incoming, both'
			}
		});
	});

	it('returns calendar nulls as a named calendar field', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		calendarExecutorMocks.getProjectCalendar.mockResolvedValueOnce(null);

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'get_project_calendar',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444'
			}
		});

		expect(result).toMatchObject({
			op: 'cal.project.get',
			ok: true,
			result: {
				calendar: null
			}
		});
	});

	it('returns FORBIDDEN for direct write tools outside the granted scope', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: { mode: 'read_only', allowed_ops: [...BUILDOS_AGENT_READ_OPS] },
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Write something'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: false,
			error: {
				code: 'FORBIDDEN',
				details: {
					granted_scope_mode: 'read_only',
					required_scope_mode: 'read_write'
				}
			}
		});
	});

	it('creates a project through a direct tool for unscoped read_write callers', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			projects: [
				{
					id: '88888888-8888-8888-8888-888888888888',
					name: 'Agent Project',
					description: 'Created from an external agent',
					type_key: 'project.business.product_launch',
					state_key: 'planning',
					props: {},
					start_at: null,
					end_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					archived_at: null,
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		instantiateProjectMock.mockResolvedValueOnce({
			project_id: '88888888-8888-8888-8888-888888888888',
			counts: { tasks: 1, documents: 0 }
		});

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.project.create']
			},
			toolName: 'create_onto_project',
			arguments: {
				idempotency_key: 'project-create-agent-project',
				project: {
					name: 'Agent Project',
					type_key: 'project.business.product_launch',
					description: 'Created from an external agent'
				},
				entities: [
					{
						temp_id: 'task-1',
						kind: 'task',
						title: 'Draft the launch brief'
					}
				],
				relationships: []
			}
		});

		expect(validateProjectSpecMock).toHaveBeenCalledWith(
			expect.objectContaining({
				project: expect.objectContaining({
					name: 'Agent Project',
					type_key: 'project.business.product_launch'
				}),
				entities: expect.arrayContaining([
					expect.objectContaining({ temp_id: 'task-1', kind: 'task' })
				]),
				relationships: []
			})
		);
		expect(instantiateProjectMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				project: expect.objectContaining({ name: 'Agent Project' })
			}),
			'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			expect.objectContaining({
				activityLog: expect.objectContaining({ changeSource: 'agent_call' })
			})
		);
		expect(result).toMatchObject({
			op: 'onto.project.create',
			ok: true,
			result: {
				project_id: '88888888-8888-8888-8888-888888888888',
				project: {
					id: '88888888-8888-8888-8888-888888888888',
					name: 'Agent Project'
				},
				counts: { tasks: 1, documents: 0 }
			}
		});
		expect(state.toolExecutions[0]).toMatchObject({
			op: 'onto.project.create',
			status: 'succeeded',
			entity_kind: 'project',
			entity_id: '88888888-8888-8888-8888-888888888888'
		});
	});

	it('lets a project-scoped read_write caller create a project and auto-adds it to scope', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const newProjectId = '88888888-8888-8888-8888-888888888888';
		const state: State = {
			projects: [
				{
					id: newProjectId,
					name: 'Scoped Project',
					description: null,
					type_key: 'project.business.product_launch',
					state_key: 'planning',
					props: {},
					start_at: null,
					end_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					archived_at: null,
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			documents: [],
			tasks: [],
			toolExecutions: [],
			// Caller is scoped to one existing project.
			callerPolicy: {
				scope_mode: 'read_write',
				allowed_project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.project.create']
			},
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		instantiateProjectMock.mockResolvedValueOnce({
			project_id: newProjectId,
			counts: { tasks: 0, documents: 0 }
		});

		// Same scope object the gateway threads into the handler context, so the
		// in-session scope expansion is observable here.
		const scope = {
			mode: 'read_write' as const,
			project_ids: ['44444444-4444-4444-4444-444444444444'],
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.project.create']
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope,
			toolName: 'create_onto_project',
			arguments: {
				project: {
					name: 'Scoped Project',
					type_key: 'project.business.product_launch'
				},
				entities: [],
				relationships: []
			}
		});

		expect(result).toMatchObject({
			op: 'onto.project.create',
			ok: true,
			result: { project_id: newProjectId }
		});
		expect(instantiateProjectMock).toHaveBeenCalled();
		// New project is usable immediately this session...
		expect(scope.project_ids).toContain(newProjectId);
		// ...and persisted to the caller policy for future sessions.
		expect(state.callerPolicy?.allowed_project_ids).toContain(newProjectId);
		expect(state.toolExecutions[0]).toMatchObject({
			op: 'onto.project.create',
			status: 'succeeded',
			entity_id: newProjectId
		});
	});

	it('creates a task through a direct tool when read_write access is granted', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Draft launch checklist',
				state_key: 'todo'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: true,
			result: {
				task: {
					title: 'Draft launch checklist',
					project_name: 'Allowed Project'
				}
			}
		});
		expect(state.tasks).toHaveLength(1);
		expect(state.tasks[0]?.created_by).toBe('actor-1');
		expect(state.tasks[0]?.type_key).toBe('task.default');
		expect(syncTaskEventsMock).toHaveBeenCalledTimes(1);
		expect(syncTaskEventsMock).toHaveBeenCalledWith(
			'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			'actor-1',
			expect.objectContaining({ id: state.tasks[0]?.id }),
			{
				activityLog: {
					changeSource: 'agent_call',
					actorContext: {
						externalAgentCallerId: '11111111-1111-1111-1111-111111111111',
						agentCallSessionId: '22222222-2222-2222-2222-222222222222'
					}
				}
			}
		);
		expect(logCreateAsyncMock).toHaveBeenCalledTimes(1);
		expect(logCreateAsyncMock).toHaveBeenCalledWith(
			expect.anything(),
			'44444444-4444-4444-4444-444444444444',
			'task',
			state.tasks[0]?.id,
			expect.objectContaining({ title: 'Draft launch checklist' }),
			'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			'agent_call',
			undefined,
			{
				externalAgentCallerId: '11111111-1111-1111-1111-111111111111',
				agentCallSessionId: '22222222-2222-2222-2222-222222222222'
			}
		);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
		expect(state.projectLogs).toHaveLength(1);
		expect(state.projectLogs?.[0]).toMatchObject({
			project_id: '44444444-4444-4444-4444-444444444444',
			entity_type: 'task',
			entity_id: state.tasks[0]?.id,
			action: 'created',
			changed_by: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			change_source: 'agent_call',
			external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
			agent_call_session_id: '22222222-2222-2222-2222-222222222222'
		});
	});

	it('exposes canonical placement and content fields on external document create tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
		});
		const createDocumentTool = tools.find((tool) => tool.name === 'create_onto_document');

		expect(createDocumentTool?.inputSchema).toMatchObject({
			properties: {
				parent_document_id: expect.any(Object),
				content: expect.any(Object),
				position: expect.any(Object)
			}
		});
		expect(createDocumentTool?.inputSchema.properties).not.toHaveProperty('body_markdown');
		expect(createDocumentTool?.inputSchema.properties).not.toHaveProperty('parent_id');
	});

	it('exposes canonical content strategy fields on external document update tools', async () => {
		const { getBuildosAgentGatewayTools } = await import('./external-tool-gateway');

		const tools = getBuildosAgentGatewayTools({
			mode: 'read_write',
			allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
		});
		const updateDocumentTool = tools.find((tool) => tool.name === 'update_onto_document');

		expect(updateDocumentTool?.inputSchema).toMatchObject({
			properties: {
				content: expect.any(Object),
				update_strategy: expect.any(Object),
				merge_instructions: expect.any(Object)
			}
		});
		expect(updateDocumentTool?.inputSchema.properties).not.toHaveProperty('body_markdown');
	});

	it('creates a document through a direct tool and places it in the doc tree', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			securityEvents: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const parentDocumentId = '99999999-9999-9999-9999-999999999999';

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
			},
			toolName: 'create_onto_document',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Launch brief',
				description: 'External agent brief',
				content: '# Brief',
				parent_document_id: parentDocumentId,
				position: 2
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.create',
			ok: true,
			result: {
				document: {
					title: 'Launch brief',
					project_name: 'Allowed Project'
				},
				structure: {
					version: 2,
					root: []
				},
				structure_error: null
			}
		});
		expect(state.documents).toHaveLength(1);
		expect(state.documents[0]?.props).toMatchObject({
			origin: 'external_agent',
			body_markdown: '# Brief'
		});
		expect(createOrMergeDocumentVersionMock).toHaveBeenCalledTimes(1);
		expect(addDocumentToTreeMock).toHaveBeenCalledWith(
			expect.anything(),
			'44444444-4444-4444-4444-444444444444',
			state.documents[0]?.id,
			{
				parentId: parentDocumentId,
				position: 2,
				title: 'Launch brief',
				description: 'External agent brief'
			},
			'actor-1'
		);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('rejects body_markdown legacy alias for external document creates and records telemetry', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			securityEvents: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
			},
			toolName: 'create_onto_document',
			securityEventOptions: { delivery: 'blocking' },
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Alias test',
				description: 'Uses body_markdown',
				body_markdown: '# Alias'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.create',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Unsupported compatibility parameter: body_markdown'
			}
		});
		expect(state.documents).toHaveLength(0);
		expect(state.securityEvents).toContainEqual(
			expect.objectContaining({
				event_type: 'agent.tool.alias_used',
				category: 'agent',
				outcome: 'info',
				severity: 'low',
				metadata: expect.objectContaining({
					requestedOp: 'onto.document.create',
					canonicalOp: 'onto.document.create',
					opAliasUsed: false,
					argAliasesUsed: [{ alias: 'body_markdown', target: 'content' }]
				})
			})
		);
	});

	it('rejects parent_id legacy alias for external document creates and records telemetry', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			securityEvents: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.create']
			},
			toolName: 'create_onto_document',
			securityEventOptions: { delivery: 'blocking' },
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Alias test',
				description: 'Uses parent_id',
				parent_id: 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.create',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Unsupported compatibility parameter: parent_id'
			}
		});
		expect(state.documents).toHaveLength(0);
		expect(state.securityEvents).toContainEqual(
			expect.objectContaining({
				event_type: 'agent.tool.alias_used',
				category: 'agent',
				outcome: 'info',
				severity: 'low',
				metadata: expect.objectContaining({
					requestedOp: 'onto.document.create',
					canonicalOp: 'onto.document.create',
					opAliasUsed: false,
					argAliasesUsed: [{ alias: 'parent_id', target: 'parent_document_id' }]
				})
			})
		);
	});

	it('appends content through external document updates and keeps body_markdown in props', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing doc',
					description: 'Doc summary',
					type_key: 'document.context.project',
					content: '# Existing',
					state_key: 'draft',
					props: { body_markdown: '# Existing', origin: 'external_agent' },
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
			},
			toolName: 'update_onto_document',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555',
				content: '## Update',
				update_strategy: 'append'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.update',
			ok: true,
			result: {
				document: {
					id: '55555555-5555-5555-5555-555555555555',
					content: '# Existing\n\n## Update'
				}
			}
		});
		expect(state.documents[0]?.content).toBe('# Existing\n\n## Update');
		expect(state.documents[0]?.props).toMatchObject({
			body_markdown: '# Existing\n\n## Update',
			origin: 'external_agent'
		});
		expect(createOrMergeDocumentVersionMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('strips internal search vectors and normalizes document children in write responses', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing doc',
					description: 'Doc summary',
					type_key: 'document.context.project',
					content: '# Existing',
					state_key: 'draft',
					props: { body_markdown: '# Existing', origin: 'external_agent' },
					children: { children: [] },
					search_vector: "'exist':1A",
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
			},
			toolName: 'update_onto_document',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555',
				title: 'Existing doc updated'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.update',
			ok: true,
			result: {
				document: {
					id: '55555555-5555-5555-5555-555555555555',
					title: 'Existing doc updated',
					children: []
				}
			}
		});
		expect((result.result as any).document).not.toHaveProperty('search_vector');
	});

	it('rejects append document updates without content on the external gateway', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing doc',
					description: 'Doc summary',
					type_key: 'document.context.project',
					content: '# Existing',
					state_key: 'draft',
					props: { body_markdown: '# Existing', origin: 'external_agent' },
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null,
					created_by: 'actor-1'
				}
			],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.document.update']
			},
			toolName: 'update_onto_document',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555',
				update_strategy: 'append',
				merge_instructions: 'Append under progress.'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.update',
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'update_onto_document append requires non-empty content.'
			}
		});
		expect(state.documents[0]?.content).toBe('# Existing');
	});

	it('updates a task through a direct tool when read_write access is granted', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [
				{
					id: '55555555-5555-5555-5555-555555555555',
					project_id: '44444444-4444-4444-4444-444444444444',
					title: 'Existing task',
					description: 'Old description',
					type_key: 'task.execute',
					state_key: 'todo',
					priority: 3,
					start_at: null,
					due_at: null,
					completed_at: null,
					props: {},
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z',
					deleted_at: null
				}
			],
			toolExecutions: [],
			nextTaskId: 2,
			nextToolExecutionId: 1
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.update']
			},
			toolName: 'update_onto_task',
			arguments: {
				task_id: '55555555-5555-5555-5555-555555555555',
				state_key: 'done',
				title: 'Existing task (done)'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.update',
			ok: true,
			result: {
				task: {
					id: '55555555-5555-5555-5555-555555555555',
					state_key: 'done',
					title: 'Existing task (done)'
				}
			}
		});
		expect(state.tasks[0]?.state_key).toBe('done');
		expect(state.tasks[0]?.completed_at).toBeTruthy();
		expect(syncTaskEventsMock).toHaveBeenCalledTimes(1);
		expect(logUpdateAsyncMock).toHaveBeenCalledTimes(1);
		expect(notifyEntityMentionsAddedMock).toHaveBeenCalledTimes(1);
		expect(state.toolExecutions).toHaveLength(1);
		expect(state.toolExecutions[0]?.status).toBe('succeeded');
	});

	it('normalizes blank task descriptions to null on external writes', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};

		await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Whitespace description',
				description: '   '
			}
		});

		expect(state.tasks[0]?.description).toBeNull();
	});

	it('replays a prior idempotent write response instead of duplicating the task', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [],
			nextTaskId: 1,
			nextToolExecutionId: 1
		};
		const request = {
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write' as const,
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task' as const,
			arguments: {
				idempotency_key: 'task-create-1',
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Idempotent task'
			}
		};

		const first = await executeBuildosAgentGatewayTool(request);
		const second = await executeBuildosAgentGatewayTool(request);

		expect(first).toMatchObject({ ok: true });
		expect(second).toMatchObject({
			ok: true,
			meta: {
				replayed: true
			}
		});
		expect(state.tasks).toHaveLength(1);
		expect(state.toolExecutions).toHaveLength(1);
	});

	it('returns CONFLICT when a matching idempotent write is still pending', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');
		const state: State = {
			documents: [],
			tasks: [],
			toolExecutions: [
				{
					id: '99999999-9999-9999-9999-000000000001',
					agent_call_session_id: '22222222-2222-2222-2222-222222222222',
					external_agent_caller_id: '11111111-1111-1111-1111-111111111111',
					user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
					op: 'onto.task.create',
					idempotency_key: 'task-create-pending',
					status: 'pending',
					args: {},
					response_payload: null,
					error_payload: null,
					entity_kind: null,
					entity_id: null,
					started_at: '2026-04-28T00:00:00.000Z',
					completed_at: null,
					created_at: '2026-04-28T00:00:00.000Z',
					updated_at: '2026-04-28T00:00:00.000Z'
				}
			],
			nextTaskId: 1,
			nextToolExecutionId: 2
		};

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock(state),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			callerId: '11111111-1111-1111-1111-111111111111',
			callSessionId: '22222222-2222-2222-2222-222222222222',
			scope: {
				mode: 'read_write',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS, 'onto.task.create']
			},
			toolName: 'create_onto_task',
			arguments: {
				idempotency_key: 'task-create-pending',
				project_id: '44444444-4444-4444-4444-444444444444',
				title: 'Pending task'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.task.create',
			ok: false,
			error: {
				code: 'CONFLICT'
			}
		});
		expect(state.tasks).toHaveLength(0);
	});

	it('does not reveal the existence of scoped-out documents through canonical ops', async () => {
		const { executeBuildosAgentGatewayTool } = await import('./external-tool-gateway');

		const result = await executeBuildosAgentGatewayTool({
			admin: createAdminMock({
				documents: [
					{
						id: '55555555-5555-5555-5555-555555555555',
						project_id: '66666666-6666-6666-6666-666666666666',
						title: 'Hidden Doc',
						description: null,
						type_key: 'document.context.project',
						content: 'Top secret',
						state_key: 'active',
						created_at: '2026-04-28T00:00:00.000Z',
						updated_at: '2026-04-28T00:00:00.000Z',
						deleted_at: null
					}
				],
				tasks: [],
				toolExecutions: [],
				nextTaskId: 1,
				nextToolExecutionId: 1
			}),
			userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
			scope: {
				mode: 'read_only',
				project_ids: ['44444444-4444-4444-4444-444444444444'],
				allowed_ops: [...BUILDOS_AGENT_READ_OPS]
			},
			toolName: 'get_onto_document_details',
			arguments: {
				document_id: '55555555-5555-5555-5555-555555555555'
			}
		});

		expect(result).toMatchObject({
			op: 'onto.document.get',
			ok: false,
			error: {
				code: 'NOT_FOUND',
				message: 'Document not found'
			}
		});
	});
});
