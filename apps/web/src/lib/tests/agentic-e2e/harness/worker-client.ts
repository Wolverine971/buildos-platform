// apps/web/src/lib/tests/agentic-e2e/harness/worker-client.ts
//
// Drives the actual worker transport used by the product: exact transport
// negotiation, durable worker admission, private Realtime delivery, and the
// product reconciliation fallback. Unlike the legacy SSE harness, this client
// never falls back when worker routing or capacity is unavailable.
import { randomUUID } from 'node:crypto';
import { env as publicEnv } from '$env/dynamic/public';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentSSEMessage,
	type Database
} from '@buildos/shared-types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAgentChatWorkerUiAdapter } from '$lib/components/agent/agent-chat-worker-ui-adapter';
import {
	AgenticChatWorkerRealtimeRuntime,
	type AgenticChatWorkerRealtimeRuntimeClient
} from '$lib/services/agentic-chat-v2/worker-realtime-runtime';
import { AgenticChatWorkerTurnAdoption } from '$lib/services/agentic-chat-v2/worker-turn-adoption';
import {
	requestAgenticChatTransportLease,
	requestAgenticChatWorkerAdmission
} from '$lib/services/agentic-chat-v2/worker-transport-client';
import {
	normalizeFastContextType,
	resolveEffectiveEntityId,
	resolveEffectiveProjectId
} from '$lib/services/agentic-chat-v2/scope';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { AgenticE2EExecutionMode, HarnessContextType, TurnResult } from './types';
import {
	applyTurnEvent,
	createEmptyTurnResult,
	createTurnEventTiming,
	createTurnTiming,
	recordTurnEventTiming,
	type RunTurnParams
} from './sse-client';

const REALTIME_READY_TIMEOUT_MS = 10_000;
// The production worker owns a 300-second provider budget and still needs a
// short terminalization/reconciliation window. Matching that budget exactly
// makes the harness race a durable terminal event that lands just after it.
const WORKER_TURN_TIMEOUT_MS = 315_000;
// A suspended test process can resume after the worker has already terminalized.
// Give durable reconciliation one bounded chance to recover the terminal receipt
// before classifying a missed Realtime broadcast as a transport failure.
const WORKER_TERMINAL_RECOVERY_TIMEOUT_MS = 30_000;

export type { AgenticE2EExecutionMode } from './types';

export function resolveAgenticE2EExecutionMode(
	value = process.env.AGENTIC_E2E_EXECUTION_MODE
): AgenticE2EExecutionMode {
	const normalized = value?.trim() || 'legacy_sse';
	if (normalized === 'legacy_sse' || normalized === 'worker_realtime') return normalized;
	throw new Error(
		`[agentic-e2e] AGENTIC_E2E_EXECUTION_MODE must be legacy_sse or worker_realtime; received ${normalized}`
	);
}

/** Shape of `agenticChat.mutationCapabilities` on the worker's `/health` response. */
export interface AdvertisedMutationCapabilities {
	provider: { count: number; names: string[] };
	adapter: { count: number; names: string[] };
	advertisedMutationToolNames: string[];
}

/**
 * Fail-closed write-surface preflight: proves the worker actually advertises the
 * mutation tools a scenario needs before spending on a turn against it. Unlike
 * `requireWorkerLease`, which only proves transport, this catches a worker that
 * negotiated fine but is read-only (or predates capability readback entirely).
 */
export async function requireAdvertisedMutationTools(params: {
	healthUrl: string;
	required: string[];
	fetchImpl?: typeof fetch;
}): Promise<{ advertised: string[] }> {
	const { healthUrl, required, fetchImpl = fetch } = params;
	if (required.length === 0) return { advertised: [] };

	const response = await fetchImpl(`${healthUrl.replace(/\/$/, '')}/health`);
	if (!response.ok) {
		throw new Error(`[agentic-e2e] worker health ${response.status}`);
	}
	const body = (await response.json()) as {
		agenticChat?: { mutationCapabilities?: AdvertisedMutationCapabilities | null } | null;
	};
	const capabilities = body?.agenticChat?.mutationCapabilities;
	if (!capabilities) {
		throw new Error(
			'[agentic-e2e] worker /health has no agenticChat.mutationCapabilities field — deployed worker predates the capability readback; deploy before running mutation scenarios'
		);
	}
	const advertised = capabilities.advertisedMutationToolNames ?? [];
	const missing = required.filter((tool) => !advertised.includes(tool));
	if (missing.length > 0) {
		throw new Error(
			`[agentic-e2e] worker does not advertise required write tools: [${missing.join(', ')}]; advertised: [${advertised.join(', ')}]; refusing to spend on a read-only worker`
		);
	}
	return { advertised };
}

type WorkerHarnessOptions = {
	userId: string;
	admin: TypedSupabaseClient;
	runtime: AgenticChatWorkerRealtimeRuntime;
	fetchImpl: typeof fetch;
	realtimeClient: SupabaseClient<Database>;
};

export class AgenticE2EWorkerClient {
	readonly #userId: string;
	readonly #admin: TypedSupabaseClient;
	readonly #runtime: AgenticChatWorkerRealtimeRuntime;
	readonly #fetch: typeof fetch;
	readonly #realtimeClient: SupabaseClient<Database>;

	constructor(options: WorkerHarnessOptions) {
		this.#userId = options.userId;
		this.#admin = options.admin;
		this.#runtime = options.runtime;
		this.#fetch = options.fetchImpl;
		this.#realtimeClient = options.realtimeClient;
	}

	async requireWorkerLease(): Promise<void> {
		const lease = await requestAgenticChatTransportLease({
			fetchImpl: this.#fetch,
			request: {
				clientTurnId: randomUUID(),
				streamRunId: randomUUID(),
				sessionId: null,
				context: { type: 'global', entityId: null, projectId: null },
				supportedModes: ['legacy_sse', 'worker_realtime'],
				supportedContractVersions: [
					'legacy_internal_v1',
					AGENTIC_CHAT_WORKER_CONTRACT_VERSION
				],
				priorDecisionId: null
			}
		});
		if (
			lease?.mode !== 'worker_realtime' ||
			lease.contractVersion !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION
		) {
			throw new Error(
				'[agentic-e2e] worker execution was required, but transport negotiation did not return a worker lease'
			);
		}
	}

	async runTurn(params: RunTurnParams): Promise<TurnResult> {
		const sessionId =
			params.sessionId ??
			(await this.#createSession(params.contextType, params.entityId ?? null));
		const requestStartedAt = new Date().toISOString();
		const requestStartedMs = performance.now();
		const streamRunId = randomUUID();
		const clientTurnId = randomUUID();
		const result = createEmptyTurnResult(
			streamRunId,
			clientTurnId,
			createTurnTiming(requestStartedAt)
		);
		result.sessionId = sessionId;

		const normalizedContextType = normalizeFastContextType(params.contextType);
		const context = {
			type: normalizedContextType,
			entityId: resolveEffectiveEntityId({
				contextType: normalizedContextType,
				entityId: params.entityId,
				projectFocus: null
			}),
			projectId: resolveEffectiveProjectId({
				contextType: normalizedContextType,
				entityId: params.entityId,
				projectFocus: null
			})
		};
		const lease = await requestAgenticChatTransportLease({
			fetchImpl: this.#fetch,
			request: {
				clientTurnId,
				streamRunId,
				sessionId,
				context,
				supportedModes: ['legacy_sse', 'worker_realtime'],
				supportedContractVersions: [
					'legacy_internal_v1',
					AGENTIC_CHAT_WORKER_CONTRACT_VERSION
				],
				priorDecisionId: null
			}
		});
		if (
			lease?.mode !== 'worker_realtime' ||
			lease.contractVersion !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION
		) {
			throw new Error(
				'[agentic-e2e] worker execution was required, but this turn negotiated legacy SSE'
			);
		}

		const admission = await requestAgenticChatWorkerAdmission({
			fetchImpl: this.#fetch,
			command: {
				leaseToken: lease.token,
				clientTurnId,
				streamRunId,
				sessionId,
				context,
				message: params.message,
				attachments: [],
				projectFocus: null,
				lastTurnContext: params.lastTurnContext ?? null,
				voiceNoteGroupId: null,
				preparedPromptKey: null
			}
		});
		result.timing.responseHeadersMs = performance.now() - requestStartedMs;
		if (!admission.response.ok || !admission.payload) {
			const body = await admission.response.text().catch(() => '');
			result.errors.push({
				error: `worker admission failed (${admission.response.status}): ${body.slice(0, 300)}`
			});
			result.timing.totalDurationMs = performance.now() - requestStartedMs;
			return result;
		}

		let resolveTerminal!: () => void;
		let rejectTerminal!: (error: unknown) => void;
		const terminal = new Promise<void>((resolve, reject) => {
			resolveTerminal = resolve;
			rejectTerminal = reject;
		});
		const adoption = new AgenticChatWorkerTurnAdoption({
			runtime: this.#runtime,
			fetchImpl: this.#fetch,
			createObserver: ({ handle, onTerminal }) =>
				createAgentChatWorkerUiAdapter({
					handle,
					onTerminal: (status) => {
						onTerminal(status);
						resolveTerminal();
					},
					port: {
						beginGeneration: () => undefined,
						replaceAssistantSnapshot: ({ text }) => {
							this.#recordSnapshotTiming(result, text, requestStartedMs);
							result.assistantText = text;
						},
						appendAssistantText: ({ text }) => {
							this.#recordSnapshotTiming(result, text, requestStartedMs);
							result.assistantText += text;
						},
						applySemanticEvent: (event) => {
							this.#applyEvent(result, event, requestStartedMs);
						},
						updateTurnState: () => undefined,
						finishTurn: ({ status, failureCode }) => {
							if (status !== 'completed') {
								result.errors.push({
									error: failureCode ?? `worker turn ${status}`
								});
							}
						},
						onError: rejectTerminal
					}
				}),
			onError: rejectTerminal
		});

		try {
			const descriptor = adoption.adoptAdmissionResponse(admission.payload);
			if (
				descriptor.handle.streamRunId !== streamRunId ||
				descriptor.handle.clientTurnId !== clientTurnId ||
				descriptor.handle.sessionId !== sessionId
			) {
				throw new Error('[agentic-e2e] worker admission returned the wrong turn identity');
			}
			await waitForWorkerTerminalWithRecovery({
				terminal,
				turnRunId: descriptor.handle.turnRunId,
				requestReconciliation: () => this.#runtime.coordinator.requestAll('watchdog')
			});
		} catch (error) {
			// Return a normal TurnResult so deterministic assertions and Phase 0
			// capture can retain the failed/timed-out turn instead of losing it when
			// the transport promise rejects before the runner reaches its finally.
			const message = error instanceof Error ? error.message : String(error);
			if (!result.errors.some((entry) => entry.error === message)) {
				result.errors.push({ error: message });
			}
		} finally {
			adoption.clear('teardown');
			result.timing.totalDurationMs = performance.now() - requestStartedMs;
		}
		return result;
	}

	async close(): Promise<void> {
		try {
			await this.#runtime.stop();
		} finally {
			await this.#realtimeClient.auth.signOut({ scope: 'local' });
		}
	}

	async #createSession(
		contextType: HarnessContextType,
		entityId: string | null
	): Promise<string> {
		const { data, error } = await this.#admin
			.from('chat_sessions')
			.insert({
				user_id: this.#userId,
				context_type: normalizeFastContextType(contextType),
				entity_id: entityId,
				status: 'active'
			})
			.select('id')
			.single();
		if (error || !data?.id) {
			throw new Error(
				`[agentic-e2e] failed to create worker chat session: ${error?.message ?? 'missing id'}`
			);
		}
		return data.id;
	}

	#recordSnapshotTiming(result: TurnResult, text: string, requestStartedMs: number): void {
		if (!text) return;
		const elapsedMs = performance.now() - requestStartedMs;
		recordTurnEventTiming(result.timing, 'text_delta', elapsedMs);
	}

	#applyEvent(result: TurnResult, event: AgentSSEMessage, requestStartedMs: number): void {
		const record = event as unknown as Record<string, unknown>;
		const elapsedMs = performance.now() - requestStartedMs;
		recordTurnEventTiming(result.timing, record.type, elapsedMs);
		result.eventTimings.push(createTurnEventTiming(record, elapsedMs));
		applyTurnEvent(result, record);
	}
}

export async function createAgenticE2EWorkerClient(input: {
	baseUrl: string;
	cookie: string;
	email: string;
	password: string;
	userId: string;
	admin: TypedSupabaseClient;
}): Promise<AgenticE2EWorkerClient> {
	const supabaseUrl = requiredEnvironment('PUBLIC_SUPABASE_URL', publicEnv.PUBLIC_SUPABASE_URL);
	const anonKey = requiredEnvironment(
		'PUBLIC_SUPABASE_ANON_KEY',
		publicEnv.PUBLIC_SUPABASE_ANON_KEY
	);
	const realtimeClient = createClient<Database>(supabaseUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
	});
	const { data, error } = await realtimeClient.auth.signInWithPassword({
		email: input.email,
		password: input.password
	});
	if (error || data.user?.id !== input.userId) {
		throw new Error(
			`[agentic-e2e] Realtime test-user authentication failed: ${error?.message ?? 'user mismatch'}`
		);
	}

	const fetchImpl = createAuthenticatedHarnessFetch(input.baseUrl, input.cookie);
	const runtime = new AgenticChatWorkerRealtimeRuntime({
		client: realtimeClient as unknown as AgenticChatWorkerRealtimeRuntimeClient,
		fetchImpl,
		windowTarget: null,
		documentTarget: null
	});
	try {
		await runtime.start();
		await waitForRealtimeSubscription(runtime);
	} catch (error) {
		try {
			await runtime.stop();
		} finally {
			await realtimeClient.auth.signOut({ scope: 'local' });
		}
		throw error;
	}
	return new AgenticE2EWorkerClient({
		userId: input.userId,
		admin: input.admin,
		runtime,
		fetchImpl,
		realtimeClient
	});
}

export function createAuthenticatedHarnessFetch(baseUrl: string, cookie: string): typeof fetch {
	return ((input: RequestInfo | URL, init: RequestInit = {}) => {
		const resolved =
			typeof input === 'string' || input instanceof URL
				? new URL(String(input), `${baseUrl.replace(/\/$/, '')}/`)
				: input;
		const headers = new Headers(input instanceof Request ? input.headers : undefined);
		new Headers(init.headers).forEach((value, key) => headers.set(key, value));
		headers.set('Cookie', cookie);
		return fetch(resolved, { ...init, headers });
	}) as typeof fetch;
}

async function waitForRealtimeSubscription(
	runtime: AgenticChatWorkerRealtimeRuntime
): Promise<void> {
	const deadline = Date.now() + REALTIME_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (runtime.status === 'subscribed') return;
		if (runtime.status === 'unavailable' || runtime.status === 'closed') break;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
	await runtime.stop();
	throw new Error(
		`[agentic-e2e] private worker Realtime channel did not subscribe (status: ${runtime.status})`
	);
}

function requiredEnvironment(name: string, rawValue?: string): string {
	const value = rawValue?.trim();
	if (!value) throw new Error(`[agentic-e2e] missing ${name} for worker Realtime`);
	return value;
}

async function withTimeout<T>(
	operation: Promise<T>,
	timeoutMs: number,
	message: string
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			operation,
			new Promise<T>((_resolve, reject) => {
				timer = setTimeout(
					() =>
						reject(
							new AgenticE2EWorkerTerminalTimeoutError(`[agentic-e2e] ${message}`)
						),
					timeoutMs
				);
			})
		]);
	} finally {
		if (timer !== null) clearTimeout(timer);
	}
}

export async function waitForWorkerTerminalWithRecovery(params: {
	terminal: Promise<void>;
	turnRunId: string;
	requestReconciliation: () => void;
	timeoutMs?: number;
	recoveryTimeoutMs?: number;
}): Promise<void> {
	const timeoutMs = params.timeoutMs ?? WORKER_TURN_TIMEOUT_MS;
	const recoveryTimeoutMs = params.recoveryTimeoutMs ?? WORKER_TERMINAL_RECOVERY_TIMEOUT_MS;
	try {
		await withTimeout(
			params.terminal,
			timeoutMs,
			`worker turn ${params.turnRunId} did not terminate`
		);
		return;
	} catch (error) {
		if (!(error instanceof AgenticE2EWorkerTerminalTimeoutError)) throw error;
	}

	params.requestReconciliation();
	await withTimeout(
		params.terminal,
		recoveryTimeoutMs,
		`worker turn ${params.turnRunId} did not terminate after final durable reconciliation`
	);
}

class AgenticE2EWorkerTerminalTimeoutError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AgenticE2EWorkerTerminalTimeoutError';
	}
}
