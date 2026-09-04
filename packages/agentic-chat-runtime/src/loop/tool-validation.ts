// packages/agentic-chat-runtime/src/loop/tool-validation.ts
import type {
	ChatToolCall,
	ChatToolDefinition,
	ToolJsonObjectSchema,
	ToolJsonValue
} from '@buildos/shared-types';
import { normalizeGatewayOpName } from '@buildos/shared-agent-ops/ops/gateway-op-aliases';
import { getAgenticChatLoopToolCatalog, type AgenticChatLoopToolCatalogV1 } from './tool-catalog';
import { normalizeProjectCreateArgs, validateProjectCreateArgs } from './project-create-args';
import { isValidUUID } from '@buildos/shared-agent-ops/utils/validation-utils';
import {
	getDocumentUpdateContentCandidate,
	hasMeaningfulUpdateValue,
	isAppendOrMergeUpdateStrategy
} from '@buildos/shared-agent-ops/ops/update-value-validation';
import {
	findDurableTextViolations,
	formatDurableTextViolations,
	isOntologyDurableWriteTool
} from './durable-text-validation';
import { parseToolArguments } from './tool-arguments';
import {
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME,
	describeDeclaredTurnContractIssues,
	executeAgenticChatStandardControlToolV1
} from './turn-contract';

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
	/**
	 * The user's own words asked for a task to be re-dated and no call this
	 * turn has carried a scheduling field yet (caller computes both halves).
	 * While set, an `update_onto_task` without `start_at`/`due_at` fails
	 * validation with a repair message naming the missing field — the 2026-07-31
	 * reschedule incident showed the executor otherwise reports an unchanged
	 * title/type echo as a successful update and the model loops on it.
	 */
	taskScheduleFieldRequired?: boolean;
	/**
	 * Persisted scheduling values for the tasks this turn actually loaded, keyed
	 * by task id. Re-sending a task's current date changes nothing, yet the
	 * update executes, the receipt echoes the row back, and the model reports the
	 * reschedule as done — the same failure as the no-field echo above, one step
	 * later. Comparing against loaded evidence rejects the no-op before execution
	 * and names the field, so the bounded repair loop can ask for a real date.
	 */
	loadedTaskSchedules?: ReadonlyMap<string, LoadedTaskSchedule>;
};

/** Scheduling fields of one task exactly as a read in this turn returned them. */
export type LoadedTaskSchedule = {
	due_at?: string | null;
	start_at?: string | null;
};

const TASK_SCHEDULE_FIELD_KEYS = ['due_at', 'start_at'] as const;

export function toolCallProvidesTaskScheduleField(
	toolName: string,
	args: Record<string, any>
): boolean {
	if (toolName !== 'update_onto_task') return false;
	return TASK_SCHEDULE_FIELD_KEYS.some((key) => hasMeaningfulUpdateValue(args[key]));
}

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
	const registry = getAgenticChatLoopToolCatalog();
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

		const { args: parsedArgs, error } = parseToolArguments(toolCall.function?.arguments);
		if (error) {
			errors.push(error);
		}

		const toolDef = toolMap.get(toolName);
		const paramSchema = toolDef?.function.parameters;
		const normalizedParsedArgs =
			toolName === 'create_onto_project'
				? normalizeProjectCreateArgs(parsedArgs)
				: parsedArgs;
		const args = applySchemaDefaults(normalizedParsedArgs, paramSchema);
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

		// Generic validation intentionally does not interpret every nested JSON
		// Schema keyword. The turn-contract parser is the authoritative semantic
		// validator, so run it before execution as well. Otherwise a model-emitted
		// value such as minimum_successful_effects: 0 reaches the adapter, throws,
		// and terminates the whole turn instead of entering the existing durable
		// validation-repair loop.
		if (toolName === DECLARE_TURN_CONTRACT_TOOL_NAME) {
			// Name the exact rejected outcome and property. A single catch-all
			// sentence listing every rule gave the bounded repair loop nothing to
			// act on, so the 2026-08-20 `task-multi-update` turn resent the same
			// invalid contract until repair rounds were exhausted.
			for (const issue of describeDeclaredTurnContractIssues(args)) {
				errors.push(`Invalid turn contract: ${issue}`);
			}
		}
		if (toolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME) {
			// This is pure control semantics: checkpoint persistence happens only
			// in the host adapter. Share its candidate/question validation so an
			// invalid question enters bounded repair before reaching that adapter.
			const validation = executeAgenticChatStandardControlToolV1({
				toolName,
				arguments: args
			});
			if (!validation.success) errors.push(validation.error);
		}

		const normalizedOp = registry.byToolName[toolName]?.op;
		if (normalizedOp) {
			validateDirectOpArgs(normalizedOp, args, errors, validationContext);
		}

		validateUuidArgs(toolName, args, errors);

		if (isOntologyDurableWriteTool(toolName)) {
			for (const error of formatDurableTextViolations(findDurableTextViolations(args))) {
				if (!errors.includes(error)) {
					errors.push(error);
				}
			}
		}

		if (toolName.startsWith(UPDATE_TOOL_PREFIX)) {
			validateUpdateToolArgs(toolName, args, errors, normalizedOp);
		}

		if (
			validationContext.taskScheduleFieldRequired === true &&
			toolName === 'update_onto_task' &&
			!toolCallProvidesTaskScheduleField(toolName, args)
		) {
			const taskId = typeof args.task_id === 'string' ? args.task_id.trim() : '';
			errors.push(
				`This turn is a scheduling request, but this update_onto_task call sets neither due_at nor start_at — resending a task's current title/type changes nothing. ` +
					`Re-send update_onto_task${taskId ? ` for task_id ${taskId}` : ' with the same task_id'} including due_at (ISO 8601 datetime, e.g. 2026-08-07T15:00:00Z) for the requested day.`
			);
		}

		const scheduleNoOp = describeTaskScheduleNoOp(toolName, args, validationContext);
		if (scheduleNoOp) errors.push(scheduleNoOp);

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

/**
 * An `update_onto_task` whose scheduling fields all repeat what this turn's
 * reads already loaded. The call would execute, succeed, and change nothing, so
 * it is rejected before execution with the field and its current value named.
 * Only refused when the whole call is a no-op reschedule, or when the turn is a
 * scheduling request whose one scheduling field did not move: an update that
 * also changes a real field is still a real update.
 */
function describeTaskScheduleNoOp(
	toolName: string,
	args: Record<string, any>,
	validationContext: GatewayValidationContext
): string | null {
	if (toolName !== 'update_onto_task') return null;
	const taskId = typeof args.task_id === 'string' ? args.task_id.trim().toLowerCase() : '';
	const loaded = taskId ? validationContext.loadedTaskSchedules?.get(taskId) : undefined;
	if (!loaded) return null;

	const provided = TASK_SCHEDULE_FIELD_KEYS.filter((key) => hasMeaningfulUpdateValue(args[key]));
	if (provided.length === 0) return null;
	const unchanged = provided.filter((key) => sameScheduleInstant(args[key], loaded[key] ?? null));
	if (unchanged.length !== provided.length) return null;

	const ignoredKeys = new Set<string>([
		'task_id',
		'update_strategy',
		'merge_instructions',
		...provided
	]);
	const changesSomethingElse = Object.entries(args).some(
		([key, value]) => !ignoredKeys.has(key) && hasMeaningfulUpdateValue(value)
	);
	if (changesSomethingElse && validationContext.taskScheduleFieldRequired !== true) return null;

	const described = unchanged
		.map((key) => `${key} is already ${String(loaded[key]).trim()}`)
		.join(' and ');
	return (
		`This update_onto_task would change nothing: ${described} on task_id ${taskId} in the context loaded this turn. ` +
		`Re-send update_onto_task with the ${unchanged.join('/')} the user actually asked for (ISO 8601 datetime, e.g. 2026-08-07T15:00:00Z), ` +
		`or, if the task already sits on that date, do not call a write tool and say so in your answer instead.`
	);
}

function sameScheduleInstant(proposed: unknown, current: string | null | undefined): boolean {
	if (typeof proposed !== 'string' || typeof current !== 'string') return false;
	const left = proposed.trim();
	const right = current.trim();
	if (!left || !right) return false;
	if (left === right) return true;
	const leftMs = Date.parse(left);
	const rightMs = Date.parse(right);
	return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

function applySchemaDefaults(
	args: Record<string, any>,
	paramSchema: ToolJsonObjectSchema | undefined
): Record<string, any> {
	if (!paramSchema) return args;

	let resolved = args;

	for (const [key, definition] of Object.entries(paramSchema.properties)) {
		if (args[key] !== undefined && args[key] !== null) continue;
		const defaultValue = definition.default;
		if (defaultValue === undefined) continue;
		if (resolved === args) resolved = { ...args };
		resolved[key] = cloneToolJsonValue(defaultValue);
	}

	return resolved;
}

function cloneToolJsonValue(value: ToolJsonValue): ToolJsonValue {
	if (Array.isArray(value)) return value.map(cloneToolJsonValue);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, cloneToolJsonValue(entry)])
		);
	}
	return value;
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
		return hasMeaningfulUpdateValue(value);
	});

	if (!hasUpdateField) {
		errors.push(
			`No update fields provided for ${opLabel || toolName}. Include at least one field to change.`
		);
	}

	if (
		toolName === 'update_onto_document' &&
		isAppendOrMergeUpdateStrategy(args.update_strategy) &&
		!getDocumentUpdateContentCandidate(args)
	) {
		errors.push(`update_onto_document ${args.update_strategy} requires non-empty content.`);
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
	registry: AgenticChatLoopToolCatalogV1
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
		const kind = entry?.kind;
		if (kind !== 'write') continue;
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
	registry: AgenticChatLoopToolCatalogV1
): string | null {
	if (toolName !== 'tool_schema') {
		return null;
	}

	const rawReference =
		typeof args.op === 'string' ? args.op : typeof args.path === 'string' ? args.path : '';
	if (!rawReference.trim()) {
		return null;
	}

	// One name space, resolved through the catalog itself (one-engine stage S9).
	// `tool_schema` takes an op, but models routinely pass the tool name, and the
	// deleted alias table hand-listed nine of those. The registry already carries
	// both directions for all 90 tools, so a name resolves generically or not at
	// all — no alias list to fall behind the catalog.
	const reference = normalizeGatewayOpName(rawReference.trim());
	return registry.ops[reference]?.op ?? registry.byToolName[reference]?.op ?? null;
}

function validateDirectOpArgs(
	normalizedOp: string,
	args: Record<string, any>,
	errors: string[],
	validationContext: GatewayValidationContext
): void {
	const addErrorOnce = (message: string) => {
		if (!errors.includes(message)) {
			errors.push(message);
		}
	};

	let opArgs = applyGatewayValidationContext(normalizedOp, args, validationContext);
	if (normalizedOp === 'onto.project.create') {
		opArgs = normalizeProjectCreateArgs(opArgs);
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

	const schema = getAgenticChatLoopToolCatalog().ops[op]?.parameters_schema;
	const requiresProjectId = schema?.required?.includes('project_id') ?? false;
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
