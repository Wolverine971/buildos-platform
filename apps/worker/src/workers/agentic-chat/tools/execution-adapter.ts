// apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts
import {
	type Database,
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	type WebResearchPort,
	WebResearchPortError,
	resolveUserCivilTimezone
} from '@buildos/shared-agent-ops';
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME,
	TOOL_METADATA
} from '@buildos/agentic-chat-runtime/catalog';
import {
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	type AgenticChatCalendarReadPortV1,
	type AgenticChatEmailReadPortV1,
	type AgenticChatEmbeddingsPortV1,
	type AgenticChatSharedReadContextV1,
	type AgenticChatToolAccessPortV1,
	executeAgenticChatSharedReadToolV1,
	isAgenticChatSharedReadToolNameV1
} from '@buildos/agentic-chat-runtime/tools';
import { createEmbeddingsClientFromEnv } from '@buildos/shared-agent-ops/embeddings/openai-embeddings';
import {
	evaluateAgenticChatWebEgressProvenance,
	executeAgenticChatStandardControlToolV1,
	isAgenticChatContentFreeEmailToolNameV1,
	isAgenticChatStandardControlToolNameV1,
	isAgenticChatWebEgressToolName,
	searchTelemetryColumns
} from '@buildos/agentic-chat-runtime/loop';
import { runWithAbortableDeadline } from '../abortableDeadline';
import type { AgenticChatReadToolPortV1 } from '../turn-executor';
import { AgenticChatProviderExecutionError } from '../provider/contracts';
import { WorkerAgenticChatToolAccessAdapter } from '../workerAccessAdapter';
import { createWorkerAgenticChatCalendarReadPort } from './calendar-read-port';
import { createWorkerAgenticChatEmailReadPort } from './email-read-port';

const PROJECT_OVERVIEW_TOOL_NAME = 'get_project_overview';
export const APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME = 'approve_turn_contract_review';
export const APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME = 'approve_mutation_batch_review';
/**
 * Reviewer-only exit that returns a flawed proposal to the acting model instead
 * of the user. Before this existed, every defect a reviewer found in a model
 * artifact (lumped targets, a cardinality typo, an invented value, a partial
 * batch) had exactly one non-approving exit — ask the user — which is how
 * "over-clarification" was born.
 */
export const REQUEST_PROPOSAL_REVISION_TOOL_NAME = 'request_proposal_revision';
/**
 * The reviewer-only control vocabulary the worker recognizes.
 * `approve_mutation_batch_review` belongs to the retired mutation-batch review
 * lane: no request builder offers it (`review/controls.ts` builds only the
 * contract approval and the revision), so it can never be allowlisted, and
 * `buildReviewerMimicryRepairRequest` intercepts an acting model that imitates
 * it before any execution path is reached. The name stays here because that
 * repair still has to recognize it; the executor below does not, because it
 * cannot be reached.
 */
const WORKER_REVIEW_CONTROL_TOOL_NAMES_V1 = Object.freeze([
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
] as const);
const WORKER_EXECUTABLE_REVIEW_CONTROL_TOOL_NAMES_V1 = Object.freeze([
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
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
/**
 * Semantic discovery (explore_project) embeds the query text via OpenRouter's
 * embeddings endpoint (same underlying text-embedding-3-small; direct OpenAI
 * is the fallback route). Without any key the port stays unset and
 * explore_project reports itself unavailable instead of failing the turn.
 */
function createWorkerEmbeddingsPortFromEnv(): AgenticChatEmbeddingsPortV1 | undefined {
	const client = createEmbeddingsClientFromEnv(process.env);
	if (!client) return undefined;
	return { embedQuery: (text) => client.embedOne(text) };
}

const MAX_RESULT_BYTES = 480 * 1024;
const MAX_TURN_SECURITY_STATES = 1_024;
const TURN_SECURITY_STATE_TTL_MS = 20 * 60_000;
export const AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS = 30_000;
export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS = 60_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type WorkerExecutableReviewControlToolNameV1 =
	(typeof WORKER_EXECUTABLE_REVIEW_CONTROL_TOOL_NAMES_V1)[number];
type WorkerReviewControlToolRunnerV1 = (args: JsonObject) => Promise<Record<string, unknown>>;
const WORKER_EXECUTABLE_REVIEW_CONTROL_TOOL_NAME_SET_V1 = new Set<string>(
	WORKER_EXECUTABLE_REVIEW_CONTROL_TOOL_NAMES_V1
);

type TurnSecurityState = {
	userId: string;
	privateContentRead: boolean;
	expiresAt: number;
};

function isWorkerReviewControlToolNameV1(
	value: unknown
): value is WorkerExecutableReviewControlToolNameV1 {
	return (
		typeof value === 'string' && WORKER_EXECUTABLE_REVIEW_CONTROL_TOOL_NAME_SET_V1.has(value)
	);
}

/**
 * These controls belong to the worker's independent-review protocol, not the
 * host-neutral runtime. Promote them only if a second host adopts that protocol.
 */
const WORKER_REVIEW_CONTROL_TOOL_RUNNERS_V1: Readonly<
	Record<WorkerExecutableReviewControlToolNameV1, WorkerReviewControlToolRunnerV1>
> = Object.freeze({
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
			...(args.corrected_contract && typeof args.corrected_contract === 'object'
				? { corrected_contract: args.corrected_contract }
				: {}),
			instruction:
				'Independent review returned this proposal to the acting model for correction. Correct it; do not ask the user.'
		});
	}
});

export const AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1 = Object.freeze([
	'web_search',
	'web_visit'
] as const);

/**
 * Does executing this tool taint the turn for outbound egress? Every shared
 * read reaches user-scoped workspace or mailbox content except the three email
 * account tools, whose payloads carry connection plumbing and no content.
 * Excluding them is load-bearing, not a relaxation: `search_email_messages`
 * cannot run without the connection ids `list_email_accounts` returns, so
 * tainting that prerequisite would make Gmail search permanently unreachable.
 */
function contributesPrivateContentTaint(toolName: string): boolean {
	return (
		isAgenticChatSharedReadToolNameV1(toolName) &&
		!isAgenticChatContentFreeEmailToolNameV1(toolName)
	);
}

export const AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 = Object.freeze([
	...AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	...AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
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
	 * Built per (user, turn) on first calendar read, never at boot: composing the
	 * Google services is cheap and env-free here, but keeping it lazy means a
	 * worker deployed without the Calendar OAuth variables still starts, and the
	 * missing credentials surface as `coverage: 'unavailable'` on the one tool
	 * call that needed them.
	 */
	private readonly createCalendarPort: (userId: string) => AgenticChatCalendarReadPortV1;
	private readonly turnCalendarPorts = new Map<
		string,
		{ expiresAt: number; port: AgenticChatCalendarReadPortV1 }
	>();
	/**
	 * Built per (user, turn) on first email read, for the same reason as the
	 * calendar port — and additionally because the shared email tools hang their
	 * per-turn call cap, character budget, and search-receipt set off the port
	 * instance. One port per turn is therefore the budget boundary.
	 */
	private readonly createEmailPort: (userId: string) => AgenticChatEmailReadPortV1;
	private readonly turnEmailPorts = new Map<
		string,
		{ expiresAt: number; port: AgenticChatEmailReadPortV1 }
	>();
	/**
	 * Access adapters are cached per user so the actorId RPC amortizes across
	 * the many tool calls of one turn. Bounded: the worker process is
	 * long-lived, so the cache is cleared once it holds 256 users rather than
	 * growing without limit.
	 */
	private readonly accessAdapters = new Map<string, AgenticChatToolAccessPortV1>();
	/**
	 * Outbound research is a data-egress capability, not an ordinary read. Once a
	 * turn has loaded user-scoped workspace content, keep later web requests from
	 * carrying that content to a model-selected destination.
	 */
	private readonly turnSecurityStates = new Map<string, TurnSecurityState>();
	/**
	 * Per-turn memo of `users.timezone`, keyed like the security state. A turn
	 * runs many read tools and each one carries the civil zone on its context;
	 * without this the worker would re-query `users` on every one of them.
	 */
	private readonly turnTimezones = new Map<
		string,
		{ expiresAt: number; timezone: Promise<string | null> }
	>();
	private readonly securityNow: () => number;
	private readonly maxTurnSecurityStates: number;
	private readonly maxTurnSecurityStatesPerUser: number;
	private readonly turnSecurityStateTtlMs: number;
	private readonly embeddings: AgenticChatEmbeddingsPortV1 | undefined;

	constructor(
		private readonly client: SupabaseClient<Database>,
		options: {
			now?: () => number;
			timeoutMs?: number;
			webResearchTimeoutMs?: number;
			webResearch?: WebResearchPort;
			createAccessAdapter?: (userId: string) => AgenticChatToolAccessPortV1;
			createCalendarPort?: (userId: string) => AgenticChatCalendarReadPortV1;
			createEmailPort?: (userId: string) => AgenticChatEmailReadPortV1;
			embeddings?: AgenticChatEmbeddingsPortV1;
			securityNow?: () => number;
			maxTurnSecurityStates?: number;
			maxTurnSecurityStatesPerUser?: number;
			turnSecurityStateTtlMs?: number;
		} = {}
	) {
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_READ_TOOL_TIMEOUT_MS;
		this.webResearchTimeoutMs =
			options.webResearchTimeoutMs ?? AGENTIC_CHAT_WEB_RESEARCH_TOOL_TIMEOUT_MS;
		this.securityNow = options.securityNow ?? Date.now;
		this.maxTurnSecurityStates = Math.max(
			1,
			Math.floor(options.maxTurnSecurityStates ?? MAX_TURN_SECURITY_STATES)
		);
		this.maxTurnSecurityStatesPerUser = Math.max(
			1,
			Math.min(
				this.maxTurnSecurityStates,
				Math.floor(
					options.maxTurnSecurityStatesPerUser ??
						Math.max(1, Math.min(64, this.maxTurnSecurityStates / 4))
				)
			)
		);
		this.turnSecurityStateTtlMs = Math.max(
			1,
			Math.floor(options.turnSecurityStateTtlMs ?? TURN_SECURITY_STATE_TTL_MS)
		);
		this.webResearch = options.webResearch;
		this.createAccessAdapter =
			options.createAccessAdapter ??
			((userId) => new WorkerAgenticChatToolAccessAdapter({ client: this.client, userId }));
		this.createCalendarPort =
			options.createCalendarPort ??
			((userId) => createWorkerAgenticChatCalendarReadPort({ client: this.client, userId }));
		this.createEmailPort =
			options.createEmailPort ??
			((userId) => createWorkerAgenticChatEmailReadPort({ client: this.client, userId }));
		this.embeddings = options.embeddings ?? createWorkerEmbeddingsPortFromEnv();
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
		// `search_email_messages` sends a model-authored query to Google, so it is
		// data egress on the same footing as web research even though it executes
		// on the shared read lane with the ordinary read timeout and failure
		// classes. The fence keys on the egress predicate; dispatch, timeout and
		// failure mapping stay keyed on the web-research names.
		const egressTool = isAgenticChatWebEgressToolName(toolName);
		const turnRunId = input.executionInput.claim.turnRunId;
		const standardControlTool = isAgenticChatStandardControlToolNameV1(toolName);
		const sharedReadTool = isAgenticChatSharedReadToolNameV1(toolName);
		const reviewControlTool = isWorkerReviewControlToolNameV1(toolName);
		const turnSecurityState =
			egressTool || sharedReadTool
				? this.turnSecurityStateFor(input.executionInput.claim.userId, turnRunId)
				: null;
		if (egressTool) {
			if (!turnSecurityState) {
				throw providerError('read_tool_egress_security_capacity_exceeded', 'permanent');
			}
			if (turnSecurityState.privateContentRead) {
				throw providerError('read_tool_egress_blocked_private_content', 'permanent');
			}
			const provenance = evaluateAgenticChatWebEgressProvenance({
				toolName,
				arguments: input.arguments,
				userMessage: String(input.executionInput.requestPayload.message ?? '')
			});
			if (!provenance.allowed) {
				throw providerError('read_tool_egress_provenance_required', 'permanent');
			}
		}
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
		const sharedContext: AgenticChatSharedReadContextV1 | null = sharedReadTool
			? {
					client: this.client,
					// The worker reads with a service-role client, so the claim's
					// userId is the only identity the shared tools can authorize
					// external (calendar/email) reads against.
					userId: input.executionInput.claim.userId,
					timezone: await this.turnTimezoneFor(
						input.executionInput.claim.userId,
						turnRunId
					),
					access: this.accessAdapterFor(input.executionInput.claim.userId),
					calendar: this.turnCalendarPortFor(
						input.executionInput.claim.userId,
						turnRunId
					),
					email: this.turnEmailPortFor(input.executionInput.claim.userId, turnRunId),
					embeddings: this.embeddings
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
				run: async (deadlineSignal) => {
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
					return requireResultRecord(
						await executeWebResearch(input.arguments, deadlineSignal)
					);
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
		// `get_email_message` and `search_email_messages` both reach mailbox
		// content, so a later egress call in the same turn is refused; the three
		// content-free email account tools deliberately do not taint.
		if (turnSecurityState && contributesPrivateContentTaint(input.toolName)) {
			turnSecurityState.privateContentRead = true;
		}

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

	prepareTurnToolBatchSecurity(input: {
		userId: string;
		turnRunId: string;
		toolNames: readonly string[];
	}): void {
		// An egress tool never pre-taints on its own behalf; otherwise
		// `search_email_messages` would block itself the moment it was scheduled.
		// Its own result still taints once it completes.
		const scheduledPrivateRead = input.toolNames.some(
			(toolName) =>
				contributesPrivateContentTaint(toolName) &&
				!isAgenticChatWebEgressToolName(toolName)
		);
		if (!scheduledPrivateRead) return;
		// Treat a scheduled private read as tainted before concurrent execution.
		// Failing closed even when that read later errors avoids an ordering race.
		const state = this.turnSecurityStateFor(input.userId, input.turnRunId);
		if (state) state.privateContentRead = true;
	}

	completeTurnSecurityState(userId: string, turnRunId: string): void {
		this.turnSecurityStates.delete(this.turnSecurityStateKey(userId, turnRunId));
		this.turnTimezones.delete(this.turnSecurityStateKey(userId, turnRunId));
		this.turnCalendarPorts.delete(this.turnSecurityStateKey(userId, turnRunId));
		// Dropping the email port also drops the turn's email call cap, character
		// budget, and the set of message ids search authorized this turn.
		this.turnEmailPorts.delete(this.turnSecurityStateKey(userId, turnRunId));
	}

	/**
	 * One calendar port per (user, turn), memoized like the timezone so the many
	 * tool calls of a turn share the same lazily composed provider services.
	 */
	private turnCalendarPortFor(userId: string, turnRunId: string): AgenticChatCalendarReadPortV1 {
		const now = this.securityNow();
		for (const [candidateId, entry] of this.turnCalendarPorts) {
			if (entry.expiresAt <= now) this.turnCalendarPorts.delete(candidateId);
		}
		const stateKey = this.turnSecurityStateKey(userId, turnRunId);
		const existing = this.turnCalendarPorts.get(stateKey);
		if (existing) {
			existing.expiresAt = now + this.turnSecurityStateTtlMs;
			return existing.port;
		}
		const port = this.createCalendarPort(userId);
		if (this.turnCalendarPorts.size < this.maxTurnSecurityStates) {
			this.turnCalendarPorts.set(stateKey, {
				expiresAt: now + this.turnSecurityStateTtlMs,
				port
			});
		}
		return port;
	}

	/** One email port per (user, turn), memoized exactly like the calendar port. */
	private turnEmailPortFor(userId: string, turnRunId: string): AgenticChatEmailReadPortV1 {
		const now = this.securityNow();
		for (const [candidateId, entry] of this.turnEmailPorts) {
			if (entry.expiresAt <= now) this.turnEmailPorts.delete(candidateId);
		}
		const stateKey = this.turnSecurityStateKey(userId, turnRunId);
		const existing = this.turnEmailPorts.get(stateKey);
		if (existing) {
			existing.expiresAt = now + this.turnSecurityStateTtlMs;
			return existing.port;
		}
		const port = this.createEmailPort(userId);
		if (this.turnEmailPorts.size < this.maxTurnSecurityStates) {
			this.turnEmailPorts.set(stateKey, {
				expiresAt: now + this.turnSecurityStateTtlMs,
				port
			});
		}
		return port;
	}

	/**
	 * Resolves `users.timezone` at most once per (user, turn). The promise is
	 * memoized rather than the value so concurrent tool calls in the same round
	 * share a single query instead of racing three of them.
	 */
	private turnTimezoneFor(userId: string, turnRunId: string): Promise<string | null> {
		const now = this.securityNow();
		for (const [candidateId, entry] of this.turnTimezones) {
			if (entry.expiresAt <= now) this.turnTimezones.delete(candidateId);
		}
		const stateKey = this.turnSecurityStateKey(userId, turnRunId);
		const existing = this.turnTimezones.get(stateKey);
		if (existing) {
			existing.expiresAt = now + this.turnSecurityStateTtlMs;
			return existing.timezone;
		}
		// resolveUserCivilTimezone never rejects — it returns null when the row
		// is missing, unreadable, or carries an invalid zone.
		const timezone = resolveUserCivilTimezone(this.client, userId);
		// Share the security-state ceiling so a saturated worker stops caching
		// rather than growing an unbounded second map.
		if (this.turnTimezones.size < this.maxTurnSecurityStates) {
			this.turnTimezones.set(stateKey, {
				expiresAt: now + this.turnSecurityStateTtlMs,
				timezone
			});
		}
		return timezone;
	}

	private turnSecurityStateKey(userId: string, turnRunId: string): string {
		return `${userId}:${turnRunId}`;
	}

	private turnSecurityStateFor(userId: string, turnRunId: string): TurnSecurityState | null {
		const now = this.securityNow();
		for (const [candidateId, state] of this.turnSecurityStates) {
			if (state.expiresAt <= now) this.turnSecurityStates.delete(candidateId);
		}
		const stateKey = this.turnSecurityStateKey(userId, turnRunId);
		const existing = this.turnSecurityStates.get(stateKey);
		if (existing) {
			existing.expiresAt = now + this.turnSecurityStateTtlMs;
			return existing;
		}
		let userStateCount = 0;
		for (const state of this.turnSecurityStates.values()) {
			if (state.userId === userId) userStateCount += 1;
		}
		if (userStateCount >= this.maxTurnSecurityStatesPerUser) return null;
		// Never clear active taint to make room. A saturated worker fails new web
		// egress closed until an existing state expires.
		if (this.turnSecurityStates.size >= this.maxTurnSecurityStates) return null;
		const created: TurnSecurityState = {
			userId,
			privateContentRead: false,
			expiresAt: now + this.turnSecurityStateTtlMs
		};
		this.turnSecurityStates.set(stateKey, created);
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
