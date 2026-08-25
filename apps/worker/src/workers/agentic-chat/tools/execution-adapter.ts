// apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type WebResearchPort, WebResearchPortError } from '@buildos/shared-agent-ops';
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME,
	TOOL_METADATA
} from '@buildos/agentic-chat-runtime/catalog';
import {
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1,
	changeChatContext,
	executeAgenticChatSharedReadToolV1,
	isAgenticChatSharedReadToolNameV1
} from '@buildos/agentic-chat-runtime/tools';
import {
	executeAgenticChatStandardControlToolV1,
	isAgenticChatStandardControlToolNameV1,
	searchTelemetryColumns
} from '@buildos/agentic-chat-runtime/loop';
import { runWithAbortableDeadline } from '../abortableDeadline';
import type { AgenticChatReadToolPortV1 } from '../turn-executor';
import { AgenticChatProviderExecutionError } from '../provider/contracts';
import { WorkerAgenticChatToolAccessAdapter } from '../workerAccessAdapter';

const PROJECT_OVERVIEW_TOOL_NAME = 'get_project_overview';
const CHANGE_CHAT_CONTEXT_TOOL_NAME = 'change_chat_context';
export const APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME = 'approve_turn_contract_review';
export const APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME = 'approve_read_only_turn_review';
export const APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME = 'approve_mutation_batch_review';
/**
 * Reviewer-only exit that returns a flawed proposal to the acting model instead
 * of the user. Before this existed, every defect a reviewer found in a model
 * artifact (lumped targets, a cardinality typo, an invented value, a partial
 * batch) had exactly one non-approving exit — ask the user — which is how
 * "over-clarification" was born.
 */
export const REQUEST_PROPOSAL_REVISION_TOOL_NAME = 'request_proposal_revision';
const WORKER_REVIEW_CONTROL_TOOL_NAMES_V1 = Object.freeze([
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME,
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
] as const);
export const AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1 = Object.freeze([
	...AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	...WORKER_REVIEW_CONTROL_TOOL_NAMES_V1
] as const);
const AGENTIC_CHAT_CONTROL_TOOL_NAME_SET_V1 = new Set<string>(AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1);

export function isAgenticChatControlToolNameV1(value: unknown): value is string {
	return typeof value === 'string' && AGENTIC_CHAT_CONTROL_TOOL_NAME_SET_V1.has(value);
}
const MAX_RESULT_BYTES = 480 * 1024;
export const AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS = 30_000;
export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type WorkerReviewControlToolNameV1 = (typeof WORKER_REVIEW_CONTROL_TOOL_NAMES_V1)[number];
type WorkerReviewControlToolRunnerV1 = (args: JsonObject) => Promise<Record<string, unknown>>;
const WORKER_REVIEW_CONTROL_TOOL_NAME_SET_V1 = new Set<string>(WORKER_REVIEW_CONTROL_TOOL_NAMES_V1);

function isWorkerReviewControlToolNameV1(value: unknown): value is WorkerReviewControlToolNameV1 {
	return typeof value === 'string' && WORKER_REVIEW_CONTROL_TOOL_NAME_SET_V1.has(value);
}

/**
 * These controls belong to the worker's independent-review protocol, not the
 * host-neutral runtime. Promote them only if a second host adopts that protocol.
 */
const WORKER_REVIEW_CONTROL_TOOL_RUNNERS_V1: Readonly<
	Record<WorkerReviewControlToolNameV1, WorkerReviewControlToolRunnerV1>
> = Object.freeze({
	[APPROVE_READ_ONLY_TURN_REVIEW_TOOL_NAME]: (args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const dispositionSha256 =
			typeof args.disposition_sha256 === 'string' ? args.disposition_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(dispositionSha256)) {
			throw new Error(
				'Read-only turn review approval failed: provide a reason and the exact reviewed disposition SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'read_only_turn_review_approved',
			reason,
			disposition_sha256: dispositionSha256,
			instruction:
				'The independently reviewed read-only disposition may proceed without durable mutations.'
		});
	},
	[APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME]: (args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const batchSha256 = typeof args.batch_sha256 === 'string' ? args.batch_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(batchSha256)) {
			throw new Error(
				'Mutation batch review approval failed: provide a reason and the exact reviewed batch SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'mutation_batch_review_approved',
			reason,
			batch_sha256: batchSha256,
			instruction:
				'The independently reviewed mutation batch may proceed exactly as proposed.'
		});
	},
	[APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME]: (args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 500) : '';
		const contractSha256 =
			typeof args.contract_sha256 === 'string' ? args.contract_sha256.trim() : '';
		if (!reason || !/^[0-9a-f]{64}$/.test(contractSha256)) {
			throw new Error(
				'Turn contract review approval failed: provide a reason and the exact reviewed contract SHA-256.'
			);
		}
		return Promise.resolve({
			status: 'turn_contract_review_approved',
			reason,
			contract_sha256: contractSha256,
			instruction:
				'The independently reviewed contract may proceed. Execute only its approved semantic outcomes.'
		});
	},
	[REQUEST_PROPOSAL_REVISION_TOOL_NAME]: (args) => {
		const reason = typeof args.reason === 'string' ? args.reason.trim().slice(0, 400) : '';
		const requiredCorrection =
			typeof args.required_correction === 'string'
				? args.required_correction.trim().slice(0, 400)
				: '';
		if (!reason || !requiredCorrection) {
			throw new Error(
				'Proposal revision failed: state what is wrong with the proposal and the exact correction required.'
			);
		}
		return Promise.resolve({
			status: 'revision_required',
			reason,
			required_correction: requiredCorrection,
			instruction:
				'Independent review returned this proposal to the acting model for correction. Correct it; do not ask the user.'
		});
	}
});

export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1 = Object.freeze([
	'web_search',
	'web_visit'
] as const);

export const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 = Object.freeze([
	...AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	...AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	CHANGE_CHAT_CONTEXT_TOOL_NAME,
	...WORKER_REVIEW_CONTROL_TOOL_NAMES_V1,
	...AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1
]);

/**
 * Keep the provider and executor on the same reviewed name catalog. The actual
 * schemas remain the immutable admission artifact's definitions so execution
 * preserves the exact context-specific surface selected at admission.
 */
const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAME_SET_V1 = new Set(
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 as readonly string[]
);

type AgenticChatProductionReadToolNameV1 =
	(typeof AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1)[number];

export function isAgenticChatProductionReadToolNameV1(
	value: unknown
): value is AgenticChatProductionReadToolNameV1 {
	return typeof value === 'string' && AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAME_SET_V1.has(value);
}

/**
 * Shared-allowlist production read adapter. Dispatches every allowlisted read
 * to the shared implementations in `@buildos/agentic-chat-runtime/tools` over
 * the worker access adapter. No mutation capability is present.
 */
export class AgenticChatToolExecutionAdapter implements AgenticChatReadToolPortV1 {
	private readonly now: () => number;
	private readonly timeoutMs: number;
	private readonly webResearchTimeoutMs: number;
	private readonly createAccessAdapter: (userId: string) => AgenticChatToolAccessPortV1;
	/**
	 * Access adapters are cached per user so the actorId RPC amortizes across
	 * the many tool calls of one turn. Bounded: the worker process is
	 * long-lived, so the cache is cleared once it holds 256 users rather than
	 * growing without limit.
	 */
	private readonly accessAdapters = new Map<string, AgenticChatToolAccessPortV1>();

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			now?: () => number;
			timeoutMs?: number;
			webResearchTimeoutMs?: number;
			webResearch?: WebResearchPort;
			createAccessAdapter?: (userId: string) => AgenticChatToolAccessPortV1;
		} = {}
	) {
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS;
		this.webResearchTimeoutMs =
			options.webResearchTimeoutMs ?? AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS;
		this.webResearch = options.webResearch;
		this.createAccessAdapter =
			options.createAccessAdapter ??
			((userId) => new WorkerAgenticChatToolAccessAdapter({ client: this.client, userId }));
	}

	async execute(
		input: Parameters<AgenticChatReadToolPortV1['execute']>[0]
	): ReturnType<AgenticChatReadToolPortV1['execute']> {
		const toolName = input.toolName;
		if (!isAgenticChatProductionReadToolNameV1(toolName)) {
			throw providerError('read_tool_not_allowlisted', 'permanent');
		}
		const webResearchTool = AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1.includes(
			toolName as (typeof AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1)[number]
		);
		const standardControlTool = isAgenticChatStandardControlToolNameV1(toolName);
		const sharedReadTool = isAgenticChatSharedReadToolNameV1(toolName);
		const contextChangeTool = toolName === CHANGE_CHAT_CONTEXT_TOOL_NAME;
		const reviewControlTool = isWorkerReviewControlToolNameV1(toolName);
		throwIfAborted(input.signal);
		if (input.toolName === PROJECT_OVERVIEW_TOOL_NAME) {
			// Pre-swap context guard, kept exactly where it observably applied
			// before: only get_project_overview ever reached it (every other
			// name threw read_tool_not_allowlisted first). The shared tools
			// take explicit arguments and never read the session context, so
			// the guard stays validation-only.
			const context = requireRecord(input.executionInput.requestPayload.context);
			const contextProjectId = canonicalUuidOrNull(context.projectId);
			if (
				(context.type === 'project' || context.type === 'ontology') &&
				contextProjectId === null
			) {
				throw providerError('read_tool_context_invalid', 'permanent');
			}
		}
		const sharedContext: AgenticChatSharedReadContextV1 | null =
			sharedReadTool || contextChangeTool
				? {
						client: this.client,
						access: this.accessAdapterFor(input.executionInput.claim.userId)
					}
				: null;
		const startedAt = this.now();
		let rawResult: Record<string, unknown>;
		try {
			rawResult = await runWithAbortableDeadline({
				parentSignal: input.signal,
				timeoutMs: webResearchTool ? this.webResearchTimeoutMs : this.timeoutMs,
				createTimeoutError: () =>
					new AgenticChatProviderExecutionError(
						'read_tool_timeout',
						'transient_infra',
						`Agentic Chat read tool exceeded its ${
							webResearchTool ? this.webResearchTimeoutMs : this.timeoutMs
						}ms deadline`
					),
				run: async () => {
					if (standardControlTool) {
						const execution = executeAgenticChatStandardControlToolV1({
							toolName,
							arguments: input.arguments
						});
						if (!execution.success) throw new Error(execution.error);
						return execution.result;
					}
					if (sharedReadTool) {
						return executeAgenticChatSharedReadToolV1({
							toolName,
							context: sharedContext!,
							arguments: input.arguments
						});
					}
					if (contextChangeTool) {
						return changeChatContext(sharedContext!, input.arguments as never, {
							// The provider surface is immutable for this turn. The client
							// applies the context shift, and the following turn materializes
							// the direct tools for its new context.
							resolveDirectToolNames: () => []
						});
					}
					if (reviewControlTool) {
						return WORKER_REVIEW_CONTROL_TOOL_RUNNERS_V1[toolName](input.arguments);
					}
					const executeWebResearch =
						input.toolName === 'web_search'
							? this.webResearch?.search
							: this.webResearch?.visit;
					if (!executeWebResearch) {
						throw new AgenticChatProviderExecutionError(
							'read_tool_execution_failed',
							'transient_infra',
							`Agentic Chat ${input.toolName} is not configured`
						);
					}
					return requireResultRecord(await executeWebResearch(input.arguments));
				}
			});
		} catch (error) {
			// Deadline and envelope errors pass through untouched, as do parent
			// abort reasons; everything the shared implementations throw
			// (argument validation, access denial, database failures) maps to
			// the read_tool_execution_failed vocabulary the envelope always had.
			if (error instanceof AgenticChatProviderExecutionError) throw error;
			if (input.signal.aborted) throw error;
			throw new AgenticChatProviderExecutionError(
				'read_tool_execution_failed',
				readToolFailureClass(error, webResearchTool),
				canonicalError(error)
			);
		}
		throwIfAborted(input.signal);

		const canonical = canonicalizeAgenticChatJson(rawResult as JsonValue);
		if (Buffer.byteLength(canonical, 'utf8') > MAX_RESULT_BYTES) {
			throw providerError('read_tool_result_too_large', 'permanent');
		}
		const parsed = JSON.parse(canonical) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw providerError('read_tool_result_invalid', 'unknown');
		}
		const payload = parsed as JsonObject;
		// Control decisions record their author on the durable row so a reviewer
		// veto is never mistaken for acting-model hesitation after the fact.
		if (input.decidedBy && isAgenticChatControlToolNameV1(input.toolName)) {
			payload.decided_by = input.decidedBy;
		}

		const affectedEntities: JsonObject[] = [];
		if (input.toolName === PROJECT_OVERVIEW_TOOL_NAME) {
			// The project payload still needs an identity fence, but legacy read
			// persistence does not infer affected entities from read results and
			// search telemetry intentionally ignores non-search overview tools.
			const project = requireOptionalRecord(payload.project);
			if (project !== null) {
				const affectedProjectId = canonicalUuidOrNull(project.id);
				const expectedProjectId = canonicalUuidOrNull(input.arguments.project_id);
				if (
					affectedProjectId === null ||
					(expectedProjectId !== null && affectedProjectId !== expectedProjectId)
				) {
					throw providerError('read_tool_result_invalid', 'unknown');
				}
			}
		}
		// Same derivation the legacy web SSE path persists
		// (turn-persistence.ts -> searchTelemetryColumns): search tools count
		// their primary result array, everything else records no evidence.
		const telemetry = searchTelemetryColumns({
			toolName: input.toolName,
			success: true,
			result: payload
		});
		const duration = Math.min(2_147_483_647, Math.max(0, Math.floor(this.now() - startedAt)));

		return {
			result: payload,
			executionTimeMs: duration,
			tokensConsumed: null,
			affectedEntities,
			// Per-tool category from the shared TOOL_METADATA ('search' for the
			// list/search reads, 'read' for detail/overview reads, 'utility' for
			// get_field_info). The hosted chat_tool_executions constraint was widened
			// and verified before the worker catalog admitted these categories.
			toolCategory: TOOL_METADATA[input.toolName]?.category ?? null,
			resultCount: telemetry.result_count,
			zeroResult: telemetry.zero_result,
			requiresUserAction: input.toolName === REQUEST_TURN_CLARIFICATION_TOOL_NAME
		};
	}

	private accessAdapterFor(userId: string): AgenticChatToolAccessPortV1 {
		const cached = this.accessAdapters.get(userId);
		if (cached) return cached;
		if (this.accessAdapters.size >= 256) {
			this.accessAdapters.clear();
		}
		const created = this.createAccessAdapter(userId);
		this.accessAdapters.set(userId, created);
		return created;
	}

	private readonly webResearch: WebResearchPort | undefined;
}

/**
 * Failure-class mapping for errors thrown by the shared read implementations.
 * Database/PostgREST failures carry a string `code` and map to 'unknown' (the
 * legacy gateway surfaced them as INTERNAL -> 'unknown'); plain Errors are the
 * shared logic's own argument validation and access denials -> 'permanent'.
 */
function sharedToolFailureClass(error: unknown): 'permanent' | 'unknown' {
	if (
		error &&
		typeof error === 'object' &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return 'unknown';
	}
	return 'permanent';
}

function readToolFailureClass(
	error: unknown,
	webResearchTool: boolean
): 'permanent' | 'transient_infra' | 'unknown' {
	if (!webResearchTool) return sharedToolFailureClass(error);
	if (error instanceof WebResearchPortError) {
		return error.code === 'VALIDATION_ERROR' ? 'permanent' : 'transient_infra';
	}
	return 'transient_infra';
}

function requireResultRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new WebResearchPortError('Web research result is not an object');
	}
	return value as Record<string, unknown>;
}

function canonicalUuidOrNull(value: unknown): string | null {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase()
		? value
		: null;
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw providerError('read_tool_context_invalid', 'permanent');
	}
	return value as Record<string, unknown>;
}

function requireOptionalRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function throwIfAborted(signal: AbortSignal): void {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error('Execution aborted');
}

function canonicalError(value: unknown): string {
	const message =
		value instanceof Error
			? value.message
			: value &&
				  typeof value === 'object' &&
				  typeof (value as { message?: unknown }).message === 'string'
				? (value as { message: string }).message
				: String(value ?? '');
	return message.trim().slice(0, 2_000) || 'Agentic Chat read tool failed';
}

function providerError(
	code: string,
	failureClass: 'permanent' | 'unknown'
): AgenticChatProviderExecutionError {
	return new AgenticChatProviderExecutionError(code, failureClass, code.replaceAll('_', ' '));
}
