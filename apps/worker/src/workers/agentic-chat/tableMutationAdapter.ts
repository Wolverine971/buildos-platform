// apps/worker/src/workers/agentic-chat/tableMutationAdapter.ts
//
// One adapter for every reviewed worker mutation.
//
// Each reviewed spec in `mutationToolCatalog.ts` carries an `execution` row
// saying how it runs: which runner, how the project fence resolves, which
// named normalizers rewrite its arguments, and how its receipt is proved. This
// class is the only thing that reads those rows, so adding a reviewed write —
// calendar, email, delete, contact — is a row plus, at most, a named function
// in `mutation-argument-normalizers.ts`.
//
// Every fail-closed property the per-tool adapters had is preserved: the
// immutable admitted-surface check, the effect-identity/idempotency contract,
// the project fence, and the known-vs-uncertain disposition split.

import { createWorkerTaskSyncPort } from '@buildos/shared-agent-ops/calendar/worker-task-event-mutation-port';
import {
	type TaskSyncPort,
	runGatewayWriteOp
} from '@buildos/shared-agent-ops/gateway/op-execution-gateway';
import {
	type AtomicTaskMoveInput,
	type TaskMoveResult,
	TaskMoveServiceError,
	moveOntoTaskAtomic
} from '@buildos/shared-agent-ops/ontology/task-move.service';
import {
	type EntityMentionPingInput,
	type EntityMentionPingResult,
	EntityMentionPingServiceError,
	pingOntoEntity
} from '@buildos/shared-agent-ops/ops/entity-mention-ping.service';
import { type BuildosAgentAllowedOp, type Database, type JsonObject } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1,
	AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1,
	AGENTIC_CHAT_MUTATION_RECEIPT_POST_PROCESSORS_V1,
	type AgenticChatMutationExecutionContextV1
} from './mutation-argument-normalizers';
import {
	type AgenticChatMutatingToolPortV1,
	AgenticChatMutationAdapterError
} from './mutation-executor';
import {
	type AgenticChatCalendarWritePortV1,
	createWorkerAgenticChatCalendarWritePort
} from './tools/calendar-write-port';
import {
	type MutationInput,
	assertMutationAdapterBoundary,
	assertMutationReceiptSize,
	canonicalGatewayError,
	canonicalMutationReceipt,
	canonicalUuid,
	isRecord,
	knownFailure,
	optionalUuid,
	requestProjectId,
	requiredUuid,
	throwGatewayResultFailure,
	uncertainFailure
} from './mutationAdapterBoundary';
import {
	AGENTIC_CHAT_TABLE_MUTATION_TOOL_NAMES_V1,
	type AgenticChatMutationExecutionSpecV1,
	type AgenticChatMutationScopeSpecV1,
	reviewedAgenticChatMutationSpecV1
} from './mutationToolCatalog';

type GatewayRunner = typeof runGatewayWriteOp;
type TaskMoveRunner = (input: AtomicTaskMoveInput) => Promise<TaskMoveResult>;
type EntityPingRunner = (input: EntityMentionPingInput) => Promise<EntityMentionPingResult>;

type TableExecutionSpec = Extract<AgenticChatMutationExecutionSpecV1, { executor: 'table' }>;

const KNOWN_TASK_MOVE_FAILURES = new Set([
	'access_denied',
	'not_found',
	'source_project_mismatch',
	'destination_archived',
	'impact_changed',
	'invalid_arguments'
]);

export { AGENTIC_CHAT_TABLE_MUTATION_TOOL_NAMES_V1 };

/**
 * Table-driven adapter for every reviewed mutation whose execution row says
 * `executor: 'table'`. One instance serves every enabled tool.
 */
export class AgenticChatTableMutationAdapter implements AgenticChatMutatingToolPortV1 {
	private readonly runGateway: GatewayRunner;
	private readonly moveTask: TaskMoveRunner;
	private readonly pingEntity: EntityPingRunner;
	private readonly injectedTaskSync: TaskSyncPort | undefined;
	private memoizedTaskSync: TaskSyncPort | undefined;
	private readonly injectedCalendarWrites: AgenticChatCalendarWritePortV1 | undefined;
	private memoizedCalendarWrites: AgenticChatCalendarWritePortV1 | undefined;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			runGateway?: GatewayRunner;
			taskSync?: TaskSyncPort;
			moveTask?: TaskMoveRunner;
			pingEntity?: EntityPingRunner;
			calendarWrites?: AgenticChatCalendarWritePortV1;
		} = {}
	) {
		this.runGateway = options.runGateway ?? runGatewayWriteOp;
		this.moveTask = options.moveTask ?? moveOntoTaskAtomic;
		this.pingEntity = options.pingEntity ?? pingOntoEntity;
		this.injectedTaskSync = options.taskSync;
		this.injectedCalendarWrites = options.calendarWrites;
	}

	async execute(input: MutationInput): Promise<JsonObject> {
		const spec = reviewedAgenticChatMutationSpecV1(input.toolName);
		if (!spec || spec.execution.executor !== 'table') {
			throw knownFailure(
				'mutation_adapter_not_allowlisted',
				`No table mutation row is enabled for ${input.toolName}`
			);
		}
		const execution: TableExecutionSpec = spec.execution;

		assertMutationAdapterBoundary(input, {
			toolName: input.toolName,
			operationName: spec.operationName,
			downstreamIdempotencySupported: spec.downstreamIdempotencySupported,
			reviewedArgumentNames: new Set(spec.reviewedArgumentNames)
		});

		for (const argument of execution.requiredUuidArguments ?? []) {
			requiredUuid(input.arguments[argument], argument);
		}

		const context: AgenticChatMutationExecutionContextV1 = {
			toolName: input.toolName,
			input,
			args: { ...input.arguments },
			projectId: resolveProjectFence(input, execution.scope),
			expected: {}
		};

		for (const normalizerId of execution.argumentNormalizers ?? []) {
			AGENTIC_CHAT_MUTATION_ARGUMENT_NORMALIZERS_V1[normalizerId](context);
		}

		const data = await this.dispatch(execution, spec.operationName, context);
		const receipt =
			execution.receipt.kind === 'builder'
				? AGENTIC_CHAT_MUTATION_RECEIPT_BUILDERS_V1[execution.receipt.builder](
						data,
						context
					)
				: buildEntityReceipt(execution, data, context);
		assertMutationReceiptSize(receipt, input.toolName);
		return receipt;
	}

	private dispatch(
		execution: TableExecutionSpec,
		operationName: string,
		context: AgenticChatMutationExecutionContextV1
	): Promise<Record<string, unknown> | undefined> {
		switch (execution.runner) {
			case 'gateway':
				return this.runGatewayOp(execution, operationName, context);
			case 'task_move_service':
				return this.runTaskMove(context);
			case 'entity_ping_service':
				return this.runEntityPing(context);
			case 'calendar_service':
				return this.runCalendarWrite(context);
		}
	}

	/**
	 * Calendar writes reach Google directly from the worker. The port owns the
	 * provider composition and the explicit authorization the service-role client
	 * cannot provide; everything else on this row — the admitted-surface fence,
	 * the project fence, the normalizers, the receipt builder — is the same table
	 * machinery every other reviewed write runs through.
	 */
	private async runCalendarWrite(
		context: AgenticChatMutationExecutionContextV1
	): Promise<Record<string, unknown>> {
		const { input, toolName, args, projectId } = context;
		try {
			return await this.calendarWrites().execute({
				toolName,
				userId: input.executionInput.claim.userId,
				sessionId: input.executionInput.claim.sessionId ?? null,
				projectId,
				arguments: args
			});
		} catch (error) {
			if (error instanceof AgenticChatMutationAdapterError) throw error;
			throw uncertainFailure(
				`${toolName}_outcome_uncertain`,
				canonicalGatewayError(error, toolName)
			);
		}
	}

	private calendarWrites(): AgenticChatCalendarWritePortV1 {
		this.memoizedCalendarWrites ??=
			this.injectedCalendarWrites ??
			createWorkerAgenticChatCalendarWritePort({ client: this.client });
		return this.memoizedCalendarWrites;
	}

	private async runGatewayOp(
		execution: TableExecutionSpec,
		operationName: string,
		context: AgenticChatMutationExecutionContextV1
	): Promise<Record<string, unknown> | undefined> {
		const { input, toolName, projectId } = context;
		// Only rows whose runner is the shared gateway reach here, and the catalog
		// keeps their operationName inside the external allowed-op vocabulary.
		const op = operationName as BuildosAgentAllowedOp;
		let result: Awaited<ReturnType<GatewayRunner>>;
		try {
			result = await this.runGateway({
				admin: this.client,
				userId: input.executionInput.claim.userId,
				scope: {
					mode: 'read_write',
					allowed_ops: [op],
					...(projectId
						? { project_ids: [projectId], write_project_ids: [projectId] }
						: {})
				},
				op,
				args: context.args,
				chatSessionId: input.executionInput.claim.sessionId,
				...(execution.taskSync ? { taskSync: this.taskSync() } : {}),
				...(execution.forwardIdempotencyKey
					? { downstreamIdempotencyKey: input.downstreamIdempotencyKey }
					: {})
			});
		} catch (error) {
			throw uncertainFailure(
				`${toolName}_gateway_threw`,
				canonicalGatewayError(error, toolName)
			);
		}

		if (!result.ok) {
			if (
				execution.failureClassifier === 'document_tree_title_branch' &&
				context.expected.parentTitle !== undefined
			) {
				// The title branch may have created the parent document before the
				// move failed; the outcome is not provably unchanged.
				throw uncertainFailure(
					`${toolName}_title_branch_uncertain`,
					result.error?.message ?? `${toolName} failed after resolving a parent by title`
				);
			}
			throwGatewayResultFailure(toolName, result.error);
		}
		return result.data;
	}

	private async runTaskMove(
		context: AgenticChatMutationExecutionContextV1
	): Promise<Record<string, unknown>> {
		const { input, toolName, args } = context;
		try {
			return (await this.moveTask({
				client: this.client,
				taskId: String(args.task_id),
				expectedSourceProjectId: String(args.expected_source_project_id),
				destinationProjectId: String(args.destination_project_id),
				confirmationToken: (args.confirmation_token ?? null) as string | null,
				caller: { kind: 'worker', userId: input.executionInput.claim.userId },
				activity: {
					changedBy: input.executionInput.claim.userId,
					changeSource: 'chat',
					chatSessionId: input.executionInput.claim.sessionId
				}
			})) as unknown as Record<string, unknown>;
		} catch (error) {
			if (error instanceof TaskMoveServiceError && KNOWN_TASK_MOVE_FAILURES.has(error.code)) {
				throw knownFailure(`${toolName}_${error.code}`, error.message);
			}
			throw uncertainFailure(
				`${toolName}_outcome_uncertain`,
				canonicalGatewayError(error, toolName)
			);
		}
	}

	private async runEntityPing(
		context: AgenticChatMutationExecutionContextV1
	): Promise<Record<string, unknown>> {
		const { input, toolName, expected, projectId } = context;
		try {
			return (await this.pingEntity({
				client: this.client,
				projectId: String(projectId),
				entityType: expected.entityType as 'task' | 'goal' | 'document',
				entityId: expected.entityId as string,
				mentionedUserIds: expected.mentionedUserIds as string[],
				messageSuffix: expected.messageSuffix as string | null,
				source: 'agent_ping',
				caller: {
					kind: 'worker',
					userId: input.executionInput.claim.userId,
					actorDisplayName: 'BuildOS agent'
				}
			})) as unknown as Record<string, unknown>;
		} catch (error) {
			if (error instanceof EntityMentionPingServiceError) {
				if (error.disposition === 'known_failed') {
					throw knownFailure(`${toolName}_${error.code}`, error.message);
				}
				throw uncertainFailure(`${toolName}_${error.code}`, error.message);
			}
			throw uncertainFailure(
				`${toolName}_outcome_uncertain`,
				canonicalGatewayError(error, toolName)
			);
		}
	}

	private taskSync(): TaskSyncPort {
		this.memoizedTaskSync ??= this.injectedTaskSync ?? createWorkerTaskSyncPort(this.client);
		return this.memoizedTaskSync;
	}
}

/**
 * Resolve the project fence a row declares. The turn context and any project
 * argument must agree; a write can never widen past the admitted context.
 */
function resolveProjectFence(
	input: MutationInput,
	scope: AgenticChatMutationScopeSpecV1
): string | null {
	if (scope.mode === 'unscoped') return null;
	const contextProjectId = requestProjectId(input);
	if (scope.mode === 'context_project') {
		if (scope.required && contextProjectId === null) {
			throw knownFailure(
				'mutation_context_invalid',
				`${input.toolName} requires an admitted project context`
			);
		}
		return contextProjectId;
	}
	const argumentProjectId = scope.required
		? requiredUuid(input.arguments[scope.argument], scope.argument)
		: optionalUuid(input.arguments[scope.argument], scope.argument);
	if (
		contextProjectId !== null &&
		argumentProjectId !== null &&
		contextProjectId !== argumentProjectId
	) {
		throw knownFailure(
			'mutation_project_scope_mismatch',
			`${input.toolName} ${scope.argument} is outside the admitted turn context`
		);
	}
	return contextProjectId ?? argumentProjectId;
}

/**
 * The single-entity receipt: prove the committed row, drop gateway-only
 * enrichment, run the row's named post-processors, then carry any declared
 * runner passthrough (task calendar sync) onto the public receipt.
 */
function buildEntityReceipt(
	execution: TableExecutionSpec,
	data: Record<string, unknown> | undefined,
	context: AgenticChatMutationExecutionContextV1
): JsonObject {
	if (execution.receipt.kind !== 'entity') {
		throw uncertainFailure(
			`${context.toolName}_receipt_invalid`,
			`${context.toolName} has no entity receipt row`
		);
	}
	const receiptSpec = execution.receipt;
	const { toolName, projectId } = context;
	const candidate = isRecord(data) ? data[receiptSpec.rootKey] : undefined;
	if (!isRecord(candidate)) {
		throw uncertainFailure(
			`${toolName}_receipt_invalid`,
			`${toolName} returned no ${receiptSpec.rootKey} receipt`
		);
	}
	const expectedId =
		receiptSpec.expectedIdArgument === null
			? null
			: context.input.arguments[receiptSpec.expectedIdArgument];
	if (
		(receiptSpec.requireCanonicalEntityId && !canonicalUuid(candidate.id)) ||
		(receiptSpec.requireCanonicalProjectId && !canonicalUuid(candidate.project_id)) ||
		(expectedId !== null && (typeof expectedId !== 'string' || candidate.id !== expectedId)) ||
		(receiptSpec.requireProjectMatch &&
			projectId !== null &&
			candidate.project_id !== projectId)
	) {
		throw uncertainFailure(
			`${toolName}_receipt_invalid`,
			`${toolName} returned a mismatched ${receiptSpec.rootKey} receipt`
		);
	}

	let entity: Record<string, unknown> = { ...candidate };
	for (const field of receiptSpec.strippedFields) delete entity[field];
	for (const postProcessorId of execution.receiptPostProcessors ?? []) {
		entity = AGENTIC_CHAT_MUTATION_RECEIPT_POST_PROCESSORS_V1[postProcessorId](entity, context);
	}
	const canonicalEntity = canonicalMutationReceipt(entity, toolName);
	const display = resolveReceiptDisplay(receiptSpec, canonicalEntity, expectedId);
	return canonicalMutationReceipt(
		{
			[receiptSpec.rootKey]: canonicalEntity,
			...passthroughReceiptFields(data, execution.passthroughReceiptFields ?? []),
			message: receiptSpec.message.replace('{display}', display),
			...(receiptSpec.staticFields ?? {})
		},
		toolName
	);
}

function resolveReceiptDisplay(
	receiptSpec: Extract<TableExecutionSpec['receipt'], { kind: 'entity' }>,
	entity: JsonObject,
	expectedId: unknown
): string {
	if (receiptSpec.displayField === null) return '';
	const declared = entity[receiptSpec.displayField];
	if (typeof declared === 'string') return declared;
	if (typeof expectedId === 'string') return expectedId;
	return receiptSpec.fallbackLabel ?? '';
}

/**
 * The gateway reports what task calendar sync actually did. Carrying it into
 * the receipt is the difference between the chat saying "no event was created"
 * and it being true. The first declared field gates the group.
 */
function passthroughReceiptFields(
	data: Record<string, unknown> | undefined,
	fields: readonly string[]
): Record<string, unknown> {
	const [gate, ...rest] = fields;
	if (gate === undefined || !isRecord(data) || typeof data[gate] !== 'string') return {};
	const carried: Record<string, unknown> = { [gate]: data[gate] };
	for (const field of rest) {
		const value = data[field];
		if (value === undefined || value === null) continue;
		if (
			Array.isArray(value) ||
			typeof value === 'number' ||
			typeof value === 'string' ||
			typeof value === 'boolean' ||
			isRecord(value)
		) {
			carried[field] = value;
		}
	}
	return carried;
}
