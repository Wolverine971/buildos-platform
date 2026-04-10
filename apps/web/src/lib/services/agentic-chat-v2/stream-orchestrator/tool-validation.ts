// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts
import type { ChatToolCall, ChatToolDefinition } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import {
	isGatewayExecToolName,
	readGatewayExecInput
} from '$lib/services/agentic-chat/tools/core/gateway-exec-utils';
import {
	normalizeProjectCreateArgs,
	validateProjectCreateArgs
} from '$lib/services/agentic-chat/tools/core/project-create-args';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { parseToolArguments } from './tool-arguments';

const UPDATE_TOOL_PREFIX = 'update_onto_';
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
	'supporting_milestone_id'
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
	'supporting_milestone_id'
]);

export type ToolValidationIssue = {
	toolCall: ChatToolCall;
	toolName: string;
	op?: string;
	errors: string[];
};

type GatewayValidationContext = {
	projectId?: string | null;
};

type ToolValidationRecord = {
	toolCall: ChatToolCall;
	toolName: string;
	args: Record<string, any>;
	op?: string;
	errors: string[];
};

export function validateToolCalls(
	toolCalls: ChatToolCall[],
	toolDefs: ChatToolDefinition[],
	validationContext: GatewayValidationContext = {}
): ToolValidationIssue[] {
	const records: ToolValidationRecord[] = [];
	const registry = getToolRegistry();
	const toolMap = new Map<string, ChatToolDefinition>();
	for (const tool of toolDefs) {
		const name = tool.function?.name;
		if (name) {
			toolMap.set(name, tool);
		}
	}

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim() ?? '';
		const errors: string[] = [];

		if (!toolName) {
			errors.push('Tool call did not include a function name.');
		}

		const { args, error } = parseToolArguments(toolCall.function?.arguments);
		if (error) {
			errors.push(error);
		}

		const toolDef = toolMap.get(toolName);
		const paramSchema =
			toolDef && (toolDef as any).function?.parameters
				? (toolDef as any).function.parameters
				: (toolDef as any)?.parameters;
		const requiredParams = Array.isArray(paramSchema?.required) ? paramSchema.required : [];
		for (const required of requiredParams) {
			const value = getValueByPath(args, required);
			if (value === undefined || value === null) {
				errors.push(`Missing required parameter: ${required}`);
				continue;
			}
			if (typeof value === 'string' && value.trim().length === 0) {
				errors.push(`Missing required parameter: ${required}`);
			}
		}

		const normalizedOp = isGatewayExecToolName(toolName)
			? validateGatewayExecArgs(args, errors, registry, validationContext)
			: registry.byToolName[toolName]?.op;

		validateUuidArgs(toolName, args, errors);

		if (toolName.startsWith(UPDATE_TOOL_PREFIX)) {
			validateUpdateToolArgs(toolName, args, errors, normalizedOp);
		}

		records.push({
			toolCall,
			toolName,
			args,
			op: normalizedOp,
			errors
		});
	}

	applyExactOpDiscoveryExecutionGuards(records, registry);

	return records
		.filter((record) => record.errors.length > 0)
		.map(({ toolCall, toolName, op, errors }) => ({
			toolCall,
			toolName,
			op,
			errors
		}));
}

function getValueByPath(value: Record<string, any>, path: string): unknown {
	const parts = path.split('.');
	let cursor: any = value;
	for (const part of parts) {
		if (!cursor || typeof cursor !== 'object') {
			return undefined;
		}
		cursor = cursor[part];
	}
	return cursor;
}

function validateUpdateToolArgs(
	toolName: string,
	args: Record<string, any>,
	errors: string[],
	opLabel?: string
): void {
	const entity = toolName.slice(UPDATE_TOOL_PREFIX.length);
	if (!entity) return;

	const idKey = `${entity}_id`;
	const rawId = args[idKey];
	const trimmedId = typeof rawId === 'string' ? rawId.trim() : rawId;
	if (!trimmedId || typeof trimmedId !== 'string') {
		errors.push(`Missing required parameter: ${idKey}`);
	} else if (!isValidUUID(trimmedId)) {
		errors.push(`Invalid ${idKey}: expected UUID`);
	}

	const ignoredKeys = new Set<string>([idKey, 'update_strategy', 'merge_instructions']);
	const hasUpdateField = Object.entries(args).some(([key, value]) => {
		if (ignoredKeys.has(key)) return false;
		if (value === undefined) return false;
		if (typeof value === 'string') {
			return value.trim().length > 0;
		}
		return true;
	});

	if (!hasUpdateField) {
		errors.push(
			`No update fields provided for ${opLabel || toolName}. Include at least one field to change.`
		);
	}
}

function shouldValidateUuidArgs(toolName: string): boolean {
	if (!toolName) return false;
	return toolName.includes('_onto_') || UUID_VALIDATED_TOOL_NAMES.has(toolName);
}

function validateUuidArgs(toolName: string, args: Record<string, any>, errors: string[]): void {
	if (!shouldValidateUuidArgs(toolName)) return;

	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	for (const [key, value] of Object.entries(args)) {
		if (!UUID_ARG_KEYS.has(key)) continue;
		if (value === undefined || value === null) continue;
		if (typeof value !== 'string') continue;

		const trimmed = value.trim();
		if (!trimmed) continue;
		const looksTruncated = trimmed.includes('...') || /^[0-9a-f]{8}$/i.test(trimmed);
		const requiresStrictUuid = STRICT_UUID_ARG_KEYS.has(key);
		if (looksTruncated || (requiresStrictUuid && !isValidUUID(trimmed))) {
			addErrorOnce(`Invalid ${key}: expected UUID`);
		}
	}
}

function applyExactOpDiscoveryExecutionGuards(
	records: ToolValidationRecord[],
	registry: ReturnType<typeof getToolRegistry>
): void {
	const discoveryToolsByOp = new Map<string, Set<string>>();

	for (const record of records) {
		const exactOp = extractExactGatewayDiscoveryOp(record.toolName, record.args, registry);
		if (!exactOp) continue;
		const existing = discoveryToolsByOp.get(exactOp) ?? new Set<string>();
		existing.add(record.toolName);
		discoveryToolsByOp.set(exactOp, existing);
	}

	if (discoveryToolsByOp.size === 0) {
		return;
	}

	for (const record of records) {
		if (!record.op) continue;
		const entry = registry.ops[record.op];
		if (!entry || entry.kind !== 'write') continue;
		const discoveryTools = discoveryToolsByOp.get(record.op);
		if (!discoveryTools || discoveryTools.size === 0) continue;

		const discoveryLabel = Array.from(discoveryTools).sort().join(' and ');
		const message = `Do not call ${record.toolName} for ${record.op} in the same response as ${discoveryLabel} for that exact op. Wait for the discovery result, then retry ${record.toolName} in the next response.`;
		if (!record.errors.includes(message)) {
			record.errors.push(message);
		}
	}
}

function extractExactGatewayDiscoveryOp(
	toolName: string,
	args: Record<string, any>,
	registry: ReturnType<typeof getToolRegistry>
): string | null {
	if (toolName !== 'tool_schema' && toolName !== 'tool_help') {
		return null;
	}

	const rawReference =
		toolName === 'tool_schema'
			? typeof args.op === 'string'
				? args.op
				: typeof args.path === 'string'
					? args.path
					: ''
			: typeof args.path === 'string'
				? args.path
				: typeof args.op === 'string'
					? args.op
					: '';
	if (!rawReference.trim()) {
		return null;
	}

	const normalized = normalizeGatewayOpName(rawReference.trim());
	return registry.ops[normalized] ? normalized : null;
}

function validateGatewayExecArgs(
	args: Record<string, any>,
	errors: string[],
	registry: ReturnType<typeof getToolRegistry>,
	validationContext: GatewayValidationContext
): string | undefined {
	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	const rawOp = typeof args.op === 'string' ? args.op.trim() : '';
	if (!rawOp) {
		return undefined;
	}

	const normalizedOp = normalizeGatewayOpName(rawOp);
	const registryOp = registry.ops[normalizedOp];
	if (!registryOp) {
		addErrorOnce(`Unknown canonical op: ${normalizedOp}`);
		return normalizedOp;
	}

	const rawOpArgs = readGatewayExecInput(args);
	let opArgs = applyGatewayValidationContext(normalizedOp, rawOpArgs, validationContext);
	if (normalizedOp === 'onto.project.create') {
		opArgs = normalizeProjectCreateArgs(opArgs);
	}
	const paramSchema =
		registryOp.parameters_schema && typeof registryOp.parameters_schema === 'object'
			? registryOp.parameters_schema
			: {};
	const requiredParams = Array.isArray((paramSchema as Record<string, any>).required)
		? ((paramSchema as Record<string, any>).required as string[])
		: [];

	for (const required of requiredParams) {
		const value = getValueByPath(opArgs, required);
		if (value === undefined || value === null) {
			addErrorOnce(`Missing required parameter: ${required}`);
			continue;
		}
		if (typeof value === 'string' && value.trim().length === 0) {
			addErrorOnce(`Missing required parameter: ${required}`);
		}
	}

	for (const [key, value] of Object.entries(opArgs)) {
		if (!UUID_ARG_KEYS.has(key)) continue;
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!trimmed) continue;
		const requiresStrictUuid = STRICT_UUID_ARG_KEYS.has(key);
		const looksTruncated = trimmed.includes('...') || /^[0-9a-f]{8}$/i.test(trimmed);
		if (looksTruncated || (requiresStrictUuid && !isValidUUID(trimmed))) {
			addErrorOnce(`Invalid ${key}: expected UUID`);
		}
	}

	if (/^onto\.[a-z_]+\.update$/.test(normalizedOp)) {
		const entity = normalizedOp.split('.')[1];
		if (entity) {
			validateCanonicalUpdateArgs(normalizedOp, entity, opArgs, errors);
		}
	}

	if (normalizedOp === 'util.project.overview') {
		const hasProjectId =
			typeof opArgs.project_id === 'string' && opArgs.project_id.trim().length > 0;
		const hasQuery = typeof opArgs.query === 'string' && opArgs.query.trim().length > 0;
		if (!hasProjectId && !hasQuery) {
			addErrorOnce('Missing required parameter: project_id or query');
		}
	}

	if (normalizedOp === 'cal.event.update') {
		validateCanonicalCalendarUpdateArgs(opArgs, errors);
	}

	if (normalizedOp === 'onto.project.create') {
		for (const error of validateProjectCreateArgs(opArgs)) {
			addErrorOnce(error);
		}
	}

	return normalizedOp;
}

function applyGatewayValidationContext(
	op: string,
	args: Record<string, any>,
	validationContext: GatewayValidationContext
): Record<string, any> {
	const effectiveProjectId =
		typeof validationContext.projectId === 'string' &&
		validationContext.projectId.trim().length > 0
			? validationContext.projectId.trim()
			: null;
	if (!effectiveProjectId) {
		return op === 'onto.project.create' ? normalizeProjectCreateArgs(args) : args;
	}

	if ('project_id' in args) {
		return op === 'onto.project.create' ? normalizeProjectCreateArgs(args) : args;
	}

	if (op === 'util.project.overview') {
		const withProjectId = {
			...args,
			project_id: effectiveProjectId
		};
		return withProjectId;
	}

	const schema = getToolRegistry().ops[op]?.parameters_schema;
	const requiresProjectId =
		Array.isArray((schema as Record<string, any> | undefined)?.required) &&
		((schema as Record<string, any>).required as string[]).includes('project_id');
	if (!requiresProjectId) {
		return op === 'onto.project.create' ? normalizeProjectCreateArgs(args) : args;
	}

	const withProjectId = {
		...args,
		project_id: effectiveProjectId
	};
	return op === 'onto.project.create' ? normalizeProjectCreateArgs(withProjectId) : withProjectId;
}

function validateCanonicalUpdateArgs(
	op: string,
	entity: string,
	args: Record<string, any>,
	errors: string[]
): void {
	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	const idKey = `${entity}_id`;
	const rawId = args[idKey];
	const trimmedId = typeof rawId === 'string' ? rawId.trim() : rawId;
	if (!trimmedId || typeof trimmedId !== 'string') {
		addErrorOnce(`Missing required parameter: ${idKey}`);
	} else if (!isValidUUID(trimmedId)) {
		addErrorOnce(`Invalid ${idKey}: expected UUID`);
	}

	const ignoredKeys = new Set<string>([idKey, 'update_strategy', 'merge_instructions']);
	const hasUpdateField = Object.entries(args).some(([key, value]) => {
		if (ignoredKeys.has(key)) return false;
		if (value === undefined) return false;
		if (typeof value === 'string') {
			return value.trim().length > 0;
		}
		return true;
	});

	if (!hasUpdateField) {
		addErrorOnce(`No update fields provided for ${op}. Include at least one field to change.`);
	}
}

function validateCanonicalCalendarUpdateArgs(args: Record<string, any>, errors: string[]): void {
	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	const hasOntoEventId =
		typeof args.onto_event_id === 'string' && args.onto_event_id.trim().length > 0;
	const hasEventId = typeof args.event_id === 'string' && args.event_id.trim().length > 0;
	if (!hasOntoEventId && !hasEventId) {
		addErrorOnce('Missing required parameter: onto_event_id or event_id');
	}

	const ignoredKeys = new Set<string>(['onto_event_id', 'event_id']);
	const hasUpdateField = Object.entries(args).some(([key, value]) => {
		if (ignoredKeys.has(key)) return false;
		if (value === undefined) return false;
		if (typeof value === 'string') {
			return value.trim().length > 0;
		}
		return true;
	});

	if (!hasUpdateField) {
		addErrorOnce(
			'No update fields provided for cal.event.update. Include at least one field to change.'
		);
	}
}
