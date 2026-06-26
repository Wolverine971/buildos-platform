// packages/shared-agent-ops/src/proposal-context/decode-operations.ts
import type { LoopOperation } from '@buildos/shared-types';

export type LoopOperationAction =
	| 'create'
	| 'update'
	| 'delete'
	| 'move'
	| 'link'
	| 'unlink'
	| 'other';

export type DecodedLoopOperationFieldChange = { label: string; value: string };

export type DecodedLoopOperation = {
	action: LoopOperationAction;
	actionLabel: string;
	entityLabel: string;
	target: string | null;
	summary: string | null;
	changes: DecodedLoopOperationFieldChange[];
};

const actionLabel: Record<LoopOperationAction, string> = {
	create: 'Create',
	update: 'Update',
	delete: 'Delete',
	move: 'Move',
	link: 'Link',
	unlink: 'Unlink',
	other: 'Change'
};

const entityNameLabel: Record<string, string> = {
	task: 'task',
	document: 'document',
	project: 'project',
	goal: 'goal',
	milestone: 'milestone',
	plan: 'plan',
	risk: 'risk',
	entities: 'link',
	asset: 'asset'
};

// Friendly labels for known prop keys produced by the project-loop generators.
const fieldLabel: Record<string, string> = {
	loop_flagged_outdated: 'Outdated flag',
	loop_outdated_reason: 'Outdated reason',
	loop_flagged_conflict: 'Conflict flag',
	loop_conflict_kind: 'Conflict type',
	loop_conflict_with_task_id: 'Conflicts with',
	loop_conflict_reason: 'Conflict reason',
	state_key: 'Status',
	status: 'Status',
	type_key: 'Type',
	title: 'Title',
	name: 'Name',
	description: 'Description',
	priority: 'Priority',
	start_date: 'Start date',
	due_date: 'Due date'
};

export function humanizeLoopOperationKey(key: string): string {
	if (fieldLabel[key]) return fieldLabel[key];
	return key
		.replace(/_/g, ' ')
		.replace(/\bid\b/i, 'ID')
		.replace(/^\w/, (c) => c.toUpperCase());
}

export function formatLoopOperationValue(value: unknown, maxLength = 80): string {
	if (value === null || value === undefined || value === '') return '-';
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '-';
		return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
	}
	try {
		const json = JSON.stringify(value);
		return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
	} catch {
		return String(value);
	}
}

function parseTool(tool: string): { action: LoopOperationAction; entity: string } {
	const cleaned = tool.toLowerCase().replace(/_in_tree$/, '');
	const parts = cleaned.split('_').filter((part) => part !== 'onto');
	const verb = parts[0] ?? '';
	const action: LoopOperationAction =
		verb === 'create'
			? 'create'
			: verb === 'update'
				? 'update'
				: verb === 'delete' || verb === 'remove'
					? 'delete'
					: verb === 'move'
						? 'move'
						: verb === 'link'
							? 'link'
							: verb === 'unlink'
								? 'unlink'
								: 'other';
	const entity = parts[1] ?? '';
	return { action, entity };
}

export function decodeLoopOperation(op: LoopOperation): DecodedLoopOperation {
	const { action, entity } = parseTool(op.tool ?? '');
	const args = (op.args ?? {}) as Record<string, unknown>;
	const entityLabel = entityNameLabel[entity] ?? (entity || 'item');

	const changes: DecodedLoopOperationFieldChange[] = [];

	// Field-level changes live in `props` for update_* operations.
	const props = args.props;
	if (props && typeof props === 'object' && !Array.isArray(props)) {
		for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
			changes.push({
				label: humanizeLoopOperationKey(key),
				value: formatLoopOperationValue(value)
			});
		}
	}

	// Notable top-level args worth surfacing per action.
	if (action === 'move') {
		if ('new_parent_id' in args) {
			const parent = args.new_parent_id;
			changes.push({
				label: 'New location',
				value: parent ? formatLoopOperationValue(parent) : 'Top level'
			});
		}
		if (typeof args.new_position === 'number') {
			changes.push({ label: 'Position', value: String(args.new_position) });
		}
	}

	if (action === 'create') {
		for (const key of ['title', 'name', 'description', 'priority', 'start_date'] as const) {
			if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
				changes.push({
					label: humanizeLoopOperationKey(key),
					value: formatLoopOperationValue(args[key])
				});
			}
		}
	}

	if (action === 'link' || action === 'unlink') {
		for (const key of ['relationship', 'relation', 'to_entity_id', 'from_entity_id'] as const) {
			if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
				changes.push({
					label: humanizeLoopOperationKey(key),
					value: formatLoopOperationValue(args[key])
				});
			}
		}
	}

	const target =
		(typeof args.title === 'string' && args.title.trim()) ||
		(typeof args.name === 'string' && args.name.trim()) ||
		null;

	return {
		action,
		actionLabel: actionLabel[action],
		entityLabel,
		target,
		summary: typeof op.label === 'string' && op.label.trim() ? op.label.trim() : null,
		changes
	};
}

export function decodeLoopOperations(operations: LoopOperation[]): DecodedLoopOperation[] {
	return operations.map((operation) => decodeLoopOperation(operation));
}
