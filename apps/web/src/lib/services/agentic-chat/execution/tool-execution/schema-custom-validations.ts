// apps/web/src/lib/services/agentic-chat/execution/tool-execution/schema-custom-validations.ts
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	getDocumentUpdateContentCandidate,
	hasMeaningfulUpdateValue,
	isAppendOrMergeUpdateStrategy
} from '../../shared/update-value-validation';
import { validateProjectCreateArgs } from '../../tools/core/project-create-args';
import { isToolArgumentRecord, type ToolArguments } from './argument-values';

export const ONTOLOGY_UPDATE_TOOL_PREFIX = 'update_onto_';

const UPDATE_TOOL_DISPLAY_KEYS: Readonly<Record<string, string>> = {
	project: 'project_name',
	task: 'task_title',
	goal: 'goal_name',
	plan: 'plan_name',
	document: 'document_title',
	milestone: 'milestone_title',
	risk: 'risk_title'
};

const UUID_VALIDATED_TOOL_NAMES = new Set([
	'list_task_documents',
	'create_task_document',
	'get_entity_relationships',
	'get_linked_entities',
	'link_onto_entities',
	'unlink_onto_edge',
	'get_document_tree',
	'get_document_path',
	'move_document_in_tree',
	'reorganize_onto_project_graph'
]);

const UUID_ARG_KEYS = new Set([
	'project_id',
	'task_id',
	'goal_id',
	'plan_id',
	'document_id',
	'milestone_id',
	'risk_id',
	'entity_id',
	'src_id',
	'dst_id',
	'edge_id',
	'parent_id',
	'parent_document_id',
	'new_parent_id',
	'supporting_milestone_id',
	'expected_source_project_id',
	'destination_project_id'
]);

const STRICT_UUID_ARG_KEYS = new Set([
	'task_id',
	'goal_id',
	'plan_id',
	'document_id',
	'milestone_id',
	'risk_id',
	'entity_id',
	'src_id',
	'dst_id',
	'edge_id',
	'parent_id',
	'parent_document_id',
	'new_parent_id',
	'supporting_milestone_id',
	'expected_source_project_id',
	'destination_project_id'
]);

export function validateUuidIdArguments({
	toolName,
	args,
	parameterSchema,
	errors,
	allowsNull
}: {
	toolName: string;
	args: ToolArguments;
	parameterSchema: ToolArguments | undefined;
	errors: string[];
	allowsNull: (schema: unknown) => boolean;
}): void {
	if (!shouldValidateUuidArguments(toolName)) return;
	const properties = isToolArgumentRecord(parameterSchema?.properties)
		? parameterSchema.properties
		: {};

	for (const [key, value] of Object.entries(args)) {
		if (!UUID_ARG_KEYS.has(key) || value === undefined) continue;
		if (value === null) {
			if (!allowsNull(properties[key])) addErrorOnce(errors, `Invalid ${key}: expected UUID`);
			continue;
		}
		if (typeof value !== 'string') continue;

		const trimmed = value.trim();
		if (!trimmed) continue;
		const looksTruncated = trimmed.includes('...') || /^[0-9a-f]{8}$/i.test(trimmed);
		if (looksTruncated || (STRICT_UUID_ARG_KEYS.has(key) && !isValidUUID(trimmed))) {
			addErrorOnce(errors, `Invalid ${key}: expected UUID`);
		}
	}
}

export function applyCustomToolValidation(
	toolName: string,
	args: ToolArguments,
	errors: string[]
): void {
	if (toolName.startsWith(ONTOLOGY_UPDATE_TOOL_PREFIX)) {
		validateOntologyUpdateArguments(toolName, args, errors);
	}

	switch (toolName) {
		case 'list_calendar_events':
		case 'get_calendar_event_details':
		case 'create_calendar_event':
		case 'update_calendar_event':
		case 'delete_calendar_event':
		case 'get_project_calendar':
		case 'set_project_calendar':
			validateCalendarToolArguments(toolName, args, errors);
			break;
		case 'reorganize_onto_project_graph':
			validateReorganizeProjectGraphArguments(args, errors);
			break;
		case 'create_onto_project':
			for (const error of validateProjectCreateArgs(args)) addErrorOnce(errors, error);
			break;
		default:
			break;
	}
}

function shouldValidateUuidArguments(toolName: string): boolean {
	return Boolean(
		toolName && (toolName.includes('_onto_') || UUID_VALIDATED_TOOL_NAMES.has(toolName))
	);
}

function validateOntologyUpdateArguments(
	toolName: string,
	args: ToolArguments,
	errors: string[]
): void {
	const entity = toolName.slice(ONTOLOGY_UPDATE_TOOL_PREFIX.length);
	if (!entity) return;

	const idKey = `${entity}_id`;
	const rawId = args[idKey];
	const trimmedId = typeof rawId === 'string' ? rawId.trim() : rawId;
	if (!trimmedId || typeof trimmedId !== 'string') {
		addErrorOnce(errors, `Missing required parameter: ${idKey}`);
	} else if (!isValidUUID(trimmedId)) {
		addErrorOnce(errors, `Invalid ${idKey}: expected UUID`);
	}

	const ignoredKeys = new Set<string>([idKey, 'update_strategy', 'merge_instructions']);
	const displayKey = UPDATE_TOOL_DISPLAY_KEYS[entity];
	if (displayKey) ignoredKeys.add(displayKey);
	const hasUpdateField = Object.entries(args).some(
		([key, value]) => !ignoredKeys.has(key) && hasMeaningfulUpdateValue(value)
	);
	if (!hasUpdateField) {
		addErrorOnce(
			errors,
			`No update fields provided for ${toolName}. Include at least one field to change.`
		);
	}

	if (
		toolName === 'update_onto_document' &&
		isAppendOrMergeUpdateStrategy(args.update_strategy) &&
		!getDocumentUpdateContentCandidate(args)
	) {
		addErrorOnce(
			errors,
			`update_onto_document ${args.update_strategy} requires non-empty content.`
		);
	}
}

function validateCalendarToolArguments(
	toolName: string,
	args: ToolArguments,
	errors: string[]
): void {
	for (const key of ['project_id', 'task_id', 'onto_event_id', 'calendar_source_id']) {
		const raw = args[key];
		if (typeof raw !== 'string' || !raw.trim()) continue;
		if (!isValidUUID(raw.trim())) addErrorOnce(errors, `Invalid ${key}: expected UUID`);
	}

	const calendarScope = typeof args.calendar_scope === 'string' ? args.calendar_scope.trim() : '';
	if (calendarScope === 'project' && !readNonEmptyString(args.project_id)) {
		addErrorOnce(errors, 'Missing required parameter: project_id');
	}
	if (
		(toolName === 'get_project_calendar' || toolName === 'set_project_calendar') &&
		!readNonEmptyString(args.project_id)
	) {
		addErrorOnce(errors, 'Missing required parameter: project_id');
	}
	if (
		(toolName === 'get_calendar_event_details' ||
			toolName === 'update_calendar_event' ||
			toolName === 'delete_calendar_event') &&
		!readNonEmptyString(args.onto_event_id) &&
		!readNonEmptyString(args.event_id) &&
		!readNonEmptyString(args.external_event_id)
	) {
		addErrorOnce(errors, 'Missing required parameter: onto_event_id or event_id');
	}
	if (
		toolName === 'update_calendar_event' &&
		![
			'title',
			'start_at',
			'end_at',
			'timezone',
			'description',
			'location',
			'sync_to_calendar'
		].some((key) => Object.prototype.hasOwnProperty.call(args, key))
	) {
		addErrorOnce(errors, 'No update fields provided for update_calendar_event');
	}
}

function validateReorganizeProjectGraphArguments(args: ToolArguments, errors: string[]): void {
	const projectId = readNonEmptyString(args.project_id);
	if (!projectId || !isValidUUID(projectId)) errors.push('Invalid project_id: expected UUID');

	const nodes = Array.isArray(args.nodes) ? args.nodes : [];
	let needsGraphLookupHint = false;
	for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
		const node = nodes[nodeIndex];
		if (!node || typeof node !== 'object') {
			errors.push(`Invalid nodes[${nodeIndex}] entry`);
			continue;
		}

		const kind = readNonEmptyString(Reflect.get(node, 'kind'));
		const id = readNonEmptyString(Reflect.get(node, 'id'));
		if (kind && isDocumentKind(kind)) {
			errors.push(
				`Document nodes are not allowed in reorganize_onto_project_graph (nodes[${nodeIndex}]). Documents are organized only via onto_projects.doc_structure.`
			);
		}
		if (!id) {
			errors.push(`Missing id for node at nodes[${nodeIndex}]`);
		} else if (!isValidUUID(id)) {
			needsGraphLookupHint = true;
			errors.push(`Invalid ${kind || 'node'} id at nodes[${nodeIndex}]: expected UUID`);
		}

		const nodeConnections: unknown = Reflect.get(node, 'connections');
		const connections = Array.isArray(nodeConnections) ? nodeConnections : [];
		for (let connectionIndex = 0; connectionIndex < connections.length; connectionIndex += 1) {
			const connection = connections[connectionIndex];
			const path = `nodes[${nodeIndex}].connections[${connectionIndex}]`;
			if (!connection || typeof connection !== 'object') {
				errors.push(`Invalid connection at ${path}`);
				continue;
			}

			const connectionKind = readNonEmptyString(Reflect.get(connection, 'kind'));
			const connectionId = readNonEmptyString(Reflect.get(connection, 'id'));
			if (connectionKind && isDocumentKind(connectionKind)) {
				errors.push(
					`Document connections are not allowed in reorganize_onto_project_graph (${path}). Documents are organized only via onto_projects.doc_structure.`
				);
			}
			if (!connectionKind || !connectionId) {
				errors.push(`Invalid connection at ${path}: requires kind and id`);
				continue;
			}
			if (connectionKind === 'project') {
				if (!isValidUUID(connectionId)) {
					errors.push(`Invalid connection project id at ${path}: expected UUID`);
				} else if (projectId && isValidUUID(projectId) && connectionId !== projectId) {
					errors.push(`Connection project id must match project_id at ${path}`);
				}
			} else if (!isValidUUID(connectionId)) {
				needsGraphLookupHint = true;
				errors.push(
					`Invalid connection id for ${connectionKind} at ${path}: expected UUID`
				);
			}
		}
	}

	if (needsGraphLookupHint) {
		errors.push(
			'Use get_onto_project_graph to fetch entity UUIDs before calling reorganize_onto_project_graph.'
		);
	}
}

function addErrorOnce(errors: string[], message: string): void {
	if (!errors.includes(message)) errors.push(message);
}

function readNonEmptyString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function isDocumentKind(value: string): boolean {
	const normalized = value.trim().toLowerCase();
	return normalized === 'document' || normalized.startsWith('document.');
}
