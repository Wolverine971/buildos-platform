// apps/web/src/lib/utils/activity-log-summary.ts
type JsonRecord = Record<string, unknown>;

export type ActivityLogSummaryInput = {
	action: string;
	entity_type?: string | null;
	entity_name?: string | null;
	entity_id?: string | null;
	before_data?: unknown;
	after_data?: unknown;
};

export type ActivityLogFieldChange = {
	path: string;
	label: string;
	beforeValue: string;
	afterValue: string;
};

export type ActivityLogSummary = {
	title: string;
	description: string;
	changes: ActivityLogFieldChange[];
	hasFieldData: boolean;
	eventLabel: string | null;
};

const MAX_VALUE_LENGTH = 96;
const MAX_DESCRIPTION_CHANGES = 3;

const EVENT_LABELS: Record<string, string> = {
	invite_created: 'invite created',
	invite_resent: 'invite resent',
	invite_revoked: 'invite revoked',
	member_role_updated: 'member role updated',
	member_removed: 'member removed',
	member_role_profile_admin_updated: 'member role profile updated'
};

const FIELD_LABELS: Record<string, string> = {
	title: 'Title',
	name: 'Name',
	state_key: 'State',
	type_key: 'Type',
	priority: 'Priority',
	description: 'Description',
	content: 'Content',
	content_changed: 'Content',
	due_at: 'Due date',
	start_at: 'Start date',
	end_at: 'End date',
	target_date: 'Target date',
	completed_at: 'Completed date',
	next_step_short: 'Next step',
	next_step_long: 'Next step details',
	role_key: 'Role',
	role_name: 'Role name',
	role_description: 'Role description',
	access: 'Access',
	invitee_email: 'Invitee',
	rel: 'Relationship',
	src_kind: 'Source type',
	dst_kind: 'Destination type',
	'props.priority': 'Priority',
	'props.target_date': 'Target date',
	'props.facets.context': 'Context',
	'props.facets.scale': 'Scale',
	'props.facets.stage': 'Stage'
};

const TOP_LEVEL_FIELD_ORDER = [
	'title',
	'name',
	'state_key',
	'type_key',
	'priority',
	'description',
	'content_changed',
	'due_at',
	'start_at',
	'end_at',
	'target_date',
	'completed_at',
	'next_step_short',
	'next_step_long',
	'role_key',
	'role_name',
	'role_description',
	'access',
	'invitee_email',
	'rel',
	'src_kind',
	'dst_kind'
];

const IGNORED_FIELD_PATHS = new Set([
	'id',
	'project_id',
	'entity_id',
	'created_at',
	'updated_at',
	'deleted_at',
	'changed_by',
	'changed_by_actor_id',
	'chat_session_id',
	'event',
	'changed_fields'
]);

export function buildActivityLogSummary(log: ActivityLogSummaryInput): ActivityLogSummary {
	const action = log.action || 'updated';
	const entityLabel = formatEntityType(log.entity_type);
	const before = asRecord(log.before_data);
	const after = asRecord(log.after_data);
	const event = readString(after?.event) ?? readString(before?.event);

	if (event) {
		return buildEventSummary(log, event, after ?? before ?? {});
	}

	if (action === 'created') {
		return buildCreatedSummary(log, after ?? before, entityLabel);
	}

	if (action === 'deleted') {
		return buildDeletedSummary(log, before ?? after, entityLabel);
	}

	const changes = collectFieldChanges(before, after);

	if (changes.length > 0) {
		return {
			title: buildChangedTitle(changes),
			description: buildChangedDescription(changes),
			changes,
			hasFieldData: true,
			eventLabel: null
		};
	}

	return {
		title: sentenceCase(action),
		description: buildNoDiffDescription(action, entityLabel, before, after),
		changes: [],
		hasFieldData: Boolean(before || after),
		eventLabel: null
	};
}

function buildEventSummary(
	log: ActivityLogSummaryInput,
	event: string,
	data: JsonRecord
): ActivityLogSummary {
	const eventLabel = formatEventLabel(event);
	const title = sentenceCase(eventLabel);
	const changes = collectEventFields(data);

	return {
		title,
		description: buildEventDescription(event, data, log.entity_type),
		changes,
		hasFieldData: changes.length > 0,
		eventLabel
	};
}

function buildCreatedSummary(
	log: ActivityLogSummaryInput,
	data: JsonRecord | null,
	entityLabel: string
): ActivityLogSummary {
	const changes = collectCreatedFields(data);
	const name = getDisplayName(log, data);
	const description = name
		? `Created ${withArticle(entityLabel)} named ${quoteValue(name)}.`
		: `Created ${withArticle(entityLabel)}.`;

	return {
		title: 'Created',
		description: appendInitialFields(description, changes),
		changes,
		hasFieldData: changes.length > 0,
		eventLabel: null
	};
}

function buildDeletedSummary(
	log: ActivityLogSummaryInput,
	data: JsonRecord | null,
	entityLabel: string
): ActivityLogSummary {
	const changes = collectCreatedFields(data);
	const name = getDisplayName(log, data);
	const description = name
		? `Deleted ${withArticle(entityLabel)} named ${quoteValue(name)}.`
		: `Deleted ${withArticle(entityLabel)}.`;

	return {
		title: 'Deleted',
		description,
		changes,
		hasFieldData: changes.length > 0,
		eventLabel: null
	};
}

function buildEventDescription(
	event: string,
	data: JsonRecord,
	entityType: string | null | undefined
): string {
	const invitee = readString(data.invitee_email);
	const role = readString(data.role_key);
	const access = readString(data.access);
	const roleName = readString(data.role_name);

	switch (event) {
		case 'invite_created':
			return compactSentence([
				`Invite sent${invitee ? ` to ${invitee}` : ''}`,
				role ? `as ${formatScalarValue(role, 'role_key')}` : null,
				access ? `with ${formatScalarValue(access, 'access')} access` : null
			]);
		case 'invite_resent':
			return compactSentence([
				`Invite resent${invitee ? ` to ${invitee}` : ''}`,
				role ? `as ${formatScalarValue(role, 'role_key')}` : null,
				access ? `with ${formatScalarValue(access, 'access')} access` : null
			]);
		case 'invite_revoked':
			return invitee ? `Invite revoked for ${invitee}.` : 'Invite revoked.';
		case 'member_role_updated':
			return compactSentence([
				'Member access changed',
				role ? `to ${formatScalarValue(role, 'role_key')}` : null,
				access ? `with ${formatScalarValue(access, 'access')} access` : null
			]);
		case 'member_removed':
			return 'Member removed from the project.';
		case 'member_role_profile_admin_updated':
			return roleName
				? `Member role profile changed to ${quoteValue(roleName)}.`
				: 'Member role profile changed.';
		default:
			return `${sentenceCase(formatEventLabel(event))}${entityType ? ` on ${formatEntityType(entityType)}` : ''}.`;
	}
}

function collectEventFields(data: JsonRecord): ActivityLogFieldChange[] {
	return ['invitee_email', 'role_key', 'access', 'role_name', 'role_description']
		.filter((field) => data[field] !== undefined && data[field] !== null && data[field] !== '')
		.map((field) => ({
			path: field,
			label: getFieldLabel(field),
			beforeValue: 'empty',
			afterValue: formatScalarValue(data[field], field)
		}));
}

function collectCreatedFields(data: JsonRecord | null): ActivityLogFieldChange[] {
	if (!data) {
		return [];
	}

	return orderPaths(Object.keys(data))
		.filter((path) => !IGNORED_FIELD_PATHS.has(path))
		.filter((path) => isMeaningfulInitialValue(data[path]))
		.slice(0, 6)
		.map((path) => ({
			path,
			label: getFieldLabel(path),
			beforeValue: 'empty',
			afterValue: formatScalarValue(data[path], path)
		}));
}

function collectFieldChanges(
	before: JsonRecord | null,
	after: JsonRecord | null
): ActivityLogFieldChange[] {
	if (!before || !after) {
		return [];
	}

	const changes: ActivityLogFieldChange[] = [];
	const topLevelPaths = orderPaths([...new Set([...Object.keys(before), ...Object.keys(after)])]);

	for (const path of topLevelPaths) {
		if (path === 'props' || IGNORED_FIELD_PATHS.has(path)) {
			continue;
		}

		pushChangeIfDifferent(changes, path, before[path], after[path]);
	}

	const beforeProps = asRecord(before.props);
	const afterProps = asRecord(after.props);
	if (beforeProps || afterProps) {
		const nestedPaths = collectNestedPaths(beforeProps ?? {}, afterProps ?? {}, 'props', 2);
		for (const path of nestedPaths) {
			const beforeValue = readPath(before, path);
			const afterValue = readPath(after, path);
			pushChangeIfDifferent(changes, path, beforeValue, afterValue);
		}
	}

	return dedupeChanges(changes);
}

function pushChangeIfDifferent(
	changes: ActivityLogFieldChange[],
	path: string,
	beforeValue: unknown,
	afterValue: unknown
) {
	if (valuesEqual(beforeValue, afterValue)) {
		return;
	}

	if (path === 'content_changed' && beforeValue === false && afterValue === true) {
		changes.push({
			path,
			label: getFieldLabel(path),
			beforeValue: 'unchanged',
			afterValue: 'changed'
		});
		return;
	}

	if (!isDisplayableValue(beforeValue) && !isDisplayableValue(afterValue)) {
		return;
	}

	changes.push({
		path,
		label: getFieldLabel(path),
		beforeValue: formatScalarValue(beforeValue, path),
		afterValue: formatScalarValue(afterValue, path)
	});
}

function collectNestedPaths(
	before: JsonRecord,
	after: JsonRecord,
	prefix: string,
	depth: number
): string[] {
	if (depth <= 0) {
		return [];
	}

	const paths: string[] = [];
	const keys = orderPaths([...new Set([...Object.keys(before), ...Object.keys(after)])]);

	for (const key of keys) {
		const path = `${prefix}.${key}`;
		if (IGNORED_FIELD_PATHS.has(key) || IGNORED_FIELD_PATHS.has(path)) {
			continue;
		}

		const beforeValue = before[key];
		const afterValue = after[key];
		const beforeRecord = asRecord(beforeValue);
		const afterRecord = asRecord(afterValue);

		if (beforeRecord || afterRecord) {
			paths.push(
				...collectNestedPaths(beforeRecord ?? {}, afterRecord ?? {}, path, depth - 1)
			);
			continue;
		}

		paths.push(path);
	}

	return paths;
}

function orderPaths(paths: string[]): string[] {
	const order = new Map(TOP_LEVEL_FIELD_ORDER.map((field, index) => [field, index]));
	return [...paths].sort((a, b) => {
		const aKey = a.split('.').at(-1) ?? a;
		const bKey = b.split('.').at(-1) ?? b;
		const aOrder = order.get(a) ?? order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
		const bOrder = order.get(b) ?? order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
		if (aOrder !== bOrder) {
			return aOrder - bOrder;
		}
		return a.localeCompare(b);
	});
}

function dedupeChanges(changes: ActivityLogFieldChange[]): ActivityLogFieldChange[] {
	const seen = new Set<string>();
	const deduped: ActivityLogFieldChange[] = [];

	for (const change of changes) {
		if (seen.has(change.path)) {
			continue;
		}
		seen.add(change.path);
		deduped.push(change);
	}

	return deduped;
}

function buildChangedTitle(changes: ActivityLogFieldChange[]): string {
	const first = changes[0];
	if (!first) {
		return 'Updated';
	}

	if (changes.length === 1) {
		return `${first.label} changed`;
	}

	const second = changes[1];
	if (changes.length === 2) {
		return second
			? `${first.label} and ${lowerFirst(second.label)} changed`
			: `${first.label} changed`;
	}

	return `${changes.length} fields changed`;
}

function buildChangedDescription(changes: ActivityLogFieldChange[]): string {
	const sentences = changes.slice(0, MAX_DESCRIPTION_CHANGES).map(formatChangeSentence);
	const remaining = changes.length - sentences.length;

	if (remaining > 0) {
		sentences.push(`${remaining} more ${remaining === 1 ? 'field' : 'fields'} changed.`);
	}

	return sentences.join(' ');
}

function formatChangeSentence(change: ActivityLogFieldChange): string {
	if (change.path === 'content_changed' && change.afterValue === 'changed') {
		return 'Content changed.';
	}

	if (change.beforeValue === 'empty' && change.afterValue !== 'empty') {
		return `${change.label} set to ${quoteValue(change.afterValue)}.`;
	}

	if (change.afterValue === 'empty') {
		return `${change.label} cleared.`;
	}

	return `${change.label} changed from ${quoteValue(change.beforeValue)} to ${quoteValue(change.afterValue)}.`;
}

function buildNoDiffDescription(
	action: string,
	entityLabel: string,
	before: JsonRecord | null,
	after: JsonRecord | null
): string {
	if (!before && !after) {
		return `This log only recorded that ${withArticle(entityLabel)} was ${action}. No field-level before/after data was stored.`;
	}

	return `This log includes stored payload data, but no summarized field changed between before and after.`;
}

function appendInitialFields(description: string, changes: ActivityLogFieldChange[]): string {
	const initialFields = changes
		.filter((change) => change.path !== 'title' && change.path !== 'name')
		.slice(0, MAX_DESCRIPTION_CHANGES)
		.map((change) => `${lowerFirst(change.label)} ${quoteValue(change.afterValue)}`);

	if (initialFields.length === 0) {
		return description;
	}

	return `${description} Initial ${initialFields.join(', ')}.`;
}

function getDisplayName(
	log: ActivityLogSummaryInput,
	data: JsonRecord | null | undefined
): string | null {
	return (
		readString(log.entity_name) ??
		readString(data?.title) ??
		readString(data?.name) ??
		readString(data?.rel) ??
		null
	);
}

function formatEventLabel(event: string): string {
	return EVENT_LABELS[event] ?? event.replace(/_/g, ' ');
}

function formatEntityType(type: string | null | undefined): string {
	if (!type) {
		return 'item';
	}

	return type.replace(/_/g, ' ');
}

function getFieldLabel(path: string): string {
	if (FIELD_LABELS[path]) {
		return FIELD_LABELS[path];
	}

	const key = path.split('.').at(-1) ?? path;
	return FIELD_LABELS[key] ?? humanizeKey(key);
}

function humanizeKey(key: string): string {
	return sentenceCase(key.replace(/_/g, ' ').replace(/\./g, ' '));
}

function formatScalarValue(value: unknown, path: string): string {
	if (value === null || value === undefined || value === '') {
		return 'empty';
	}

	if (typeof value === 'string') {
		return truncateValue(formatStringValue(value, path));
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value.length === 0
			? 'empty list'
			: `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
	}

	return 'changed';
}

function formatStringValue(value: string, path: string): string {
	if (isDatePath(path)) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return new Intl.DateTimeFormat(undefined, {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
				hour: value.includes('T') ? 'numeric' : undefined,
				minute: value.includes('T') ? '2-digit' : undefined
			}).format(date);
		}
	}

	if (path.endsWith('type_key')) {
		return value.replace(/\./g, ' ').replace(/_/g, ' ');
	}

	if (path.endsWith('state_key') || path.endsWith('role_key') || path.endsWith('access')) {
		return value.replace(/_/g, ' ');
	}

	return value;
}

function isDatePath(path: string): boolean {
	return path.endsWith('_at') || path.endsWith('_date') || path.includes('date');
}

function isDisplayableValue(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		(Array.isArray(value) && value.every((item) => !asRecord(item)))
	);
}

function isMeaningfulInitialValue(value: unknown): boolean {
	if (value === null || value === undefined || value === '') {
		return false;
	}

	if (Array.isArray(value) && value.length === 0) {
		return false;
	}

	return isDisplayableValue(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
	return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}

	if (asRecord(value)) {
		const record = value as JsonRecord;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(',')}}`;
	}

	return JSON.stringify(value);
}

function readPath(record: JsonRecord, path: string): unknown {
	return path.split('.').reduce<unknown>((current, key) => {
		const currentRecord = asRecord(current);
		if (!currentRecord) {
			return undefined;
		}
		return currentRecord[key];
	}, record);
}

function asRecord(value: unknown): JsonRecord | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	return value as JsonRecord;
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function quoteValue(value: string): string {
	if (value === 'empty' || value === 'changed' || value === 'unchanged') {
		return value;
	}

	return `"${value}"`;
}

function truncateValue(value: string): string {
	if (value.length <= MAX_VALUE_LENGTH) {
		return value;
	}

	return `${value.slice(0, MAX_VALUE_LENGTH - 1)}...`;
}

function sentenceCase(value: string): string {
	if (!value) {
		return value;
	}

	return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function lowerFirst(value: string): string {
	if (!value) {
		return value;
	}

	return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function withArticle(noun: string): string {
	return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function compactSentence(parts: Array<string | null>): string {
	return `${parts.filter(Boolean).join(' ')}.`;
}
