// apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentTimingSummary, ChatContextType, Database, Json } from '@buildos/shared-types';
import { normalizeTimingMetricSessionReference } from '$lib/services/agentic-chat/shared/timing-metrics';
import { deriveFirstLane } from './prompt-observability';

type FastChatSupabaseClient = SupabaseClient<Database>;

type TurnObservabilityLogger = {
	warn(message: string, metadata?: Record<string, unknown>): void;
};

type TurnObservabilityErrorReporter = (params: {
	error: unknown;
	operationType: string;
	projectId?: string;
	tableName?: string;
	recordId?: string;
	metadata?: Record<string, unknown>;
}) => void;

export type TurnObservabilityTimingState = {
	sessionId: string | null;
	contextType: ChatContextType;
	projectId: string | null;
	entityId: string | null;
	sessionResolvedAtMs: number | null;
	historyLoadStartedAtMs: number | null;
	historyLoadedAtMs: number | null;
	historyComposeStartedAtMs: number | null;
	historyComposedAtMs: number | null;
	toolSelectionMs: number | null;
	contextBuildStartedAtMs: number | null;
	contextReadyAtMs: number | null;
	firstEventAtMs: number | null;
	firstResponseAtMs: number | null;
	assistantPersistStartedAtMs: number | null;
	assistantPersistedAtMs: number | null;
	finalizationStartedAtMs: number | null;
	doneEmittedAtMs: number | null;
	historyStrategy: string | null;
	historyCompressed: boolean;
	rawHistoryCount: number | null;
	historyForModelCount: number | null;
	contextCacheSource: AgentTimingSummary['cache_source'];
	contextLoadSource: AgentTimingSummary['context_load_source'];
	contextCacheAgeSeconds: number | null;
	bypassedContextCache: boolean;
	preparedPromptRequested: boolean;
	preparedPromptHit: boolean;
	preparedPromptMissReason: string | null;
	preparedPromptId: string | null;
	preparedPromptAgeSeconds: number | null;
	preparedSurfaceProfile: string | null;
};

export type TurnObservabilityWriterParams = {
	supabase: FastChatSupabaseClient;
	userId: string;
	streamRunId: string;
	clientTurnId?: string | null;
	requestStartedAtMs: number;
	messageLength: number;
	requestPrewarmedContext: boolean;
	logger: TurnObservabilityLogger;
	logError: TurnObservabilityErrorReporter;
	getTimingState: () => TurnObservabilityTimingState;
	createId?: () => string;
	nowMs?: () => number;
};

export type TurnEventPhase = 'prompt' | 'llm' | 'tool' | 'stream' | 'finalize';

export type TurnEventOptions = {
	helpPath?: string | null;
	skillPath?: string | null;
	canonicalOp?: string | null;
	validationFailed?: boolean;
};

type PendingTurnEventRow = {
	turn_run_id: string;
	session_id: string;
	user_id: string;
	stream_run_id: string;
	sequence_index: number;
	phase: TurnEventPhase;
	event_type: string;
	payload: Json;
};

export type DetachedTaskMetadata = {
	projectId?: string;
	contextType?: ChatContextType;
	sessionId?: string;
	entityId?: string | null;
	[key: string]: unknown;
};

function toIsoString(value: number | null): string | null {
	return typeof value === 'number' ? new Date(value).toISOString() : null;
}

function durationMs(start: number | null, end: number | null): number | undefined {
	if (typeof start !== 'number' || typeof end !== 'number') return undefined;
	return Math.max(0, end - start);
}

export class TurnObservabilityWriter {
	private readonly detachedTasks = new Set<Promise<void>>();
	private readonly pendingTurnEvents: PendingTurnEventRow[] = [];
	private readonly createId: () => string;
	private readonly nowMs: () => number;
	private turnRunId: string | null = null;
	private turnEventSequence = 0;
	private firstHelpPath: string | null = null;
	private firstHelpSequence: number | null = null;
	private firstSkillPath: string | null = null;
	private firstSkillSequence: number | null = null;
	private firstCanonicalOp: string | null = null;
	private firstOpSequence: number | null = null;
	private validationFailureCount = 0;
	private timingMetricQueued = false;
	private timingMetricId: string | null = null;

	constructor(private readonly params: TurnObservabilityWriterParams) {
		this.createId = params.createId ?? uuidv4;
		this.nowMs = params.nowMs ?? Date.now;
	}

	setTurnRunId(id: string | null): void {
		this.turnRunId = id;
	}

	getTimingMetricId(): string | null {
		return this.timingMetricId;
	}

	getValidationFailureCount(): number {
		return this.validationFailureCount;
	}

	getFirstLanePatch(): Record<string, unknown> {
		return {
			first_lane: deriveFirstLane({
				firstHelpPath: this.firstHelpPath,
				firstHelpSequence: this.firstHelpSequence,
				firstSkillPath: this.firstSkillPath,
				firstSkillSequence: this.firstSkillSequence,
				firstCanonicalOp: this.firstCanonicalOp,
				firstOpSequence: this.firstOpSequence
			}),
			first_help_path: this.firstHelpPath,
			first_skill_path: this.firstSkillPath,
			first_canonical_op: this.firstCanonicalOp
		};
	}

	recordEvent(
		phase: TurnEventPhase,
		eventType: string,
		payload: Json,
		options?: TurnEventOptions
	): void {
		const turnRunId = this.turnRunId;
		const timingState = this.params.getTimingState();
		const sessionId = timingState.sessionId;
		if (!turnRunId || !sessionId) return;

		const sequenceIndex = ++this.turnEventSequence;
		this.noteFirstHelpPath(options?.helpPath ?? null, sequenceIndex);
		this.noteFirstSkillPath(options?.skillPath ?? null, sequenceIndex);
		this.noteFirstCanonicalOp(options?.canonicalOp ?? null, sequenceIndex);
		if (options?.validationFailed) {
			this.validationFailureCount += 1;
		}

		this.pendingTurnEvents.push({
			turn_run_id: turnRunId,
			session_id: sessionId,
			user_id: this.params.userId,
			stream_run_id: this.params.streamRunId,
			sequence_index: sequenceIndex,
			phase,
			event_type: eventType,
			payload
		});
	}

	queueTurnRunUpdate(
		patch: Record<string, unknown>,
		label: string,
		metadata?: Record<string, unknown>
	): void {
		const turnRunId = this.turnRunId;
		if (!turnRunId) return;

		this.trackTimingTask(
			(async () => {
				const { error } = await this.params.supabase
					.from('chat_turn_runs')
					.update(patch)
					.eq('id', turnRunId)
					.eq('user_id', this.params.userId);
				if (error) throw error;
			})(),
			label,
			metadata
		);
	}

	async persistFinalState(patch: Record<string, unknown>, label: string): Promise<void> {
		const turnRunId = this.turnRunId;
		if (!turnRunId) return;

		const { error } = await this.params.supabase
			.from('chat_turn_runs')
			.update(patch)
			.eq('id', turnRunId)
			.eq('user_id', this.params.userId);
		if (!error) return;

		const timingState = this.params.getTimingState();
		this.params.logger.warn(`Failed to persist FastChat turn run ${label}`, {
			error,
			sessionId: timingState.sessionId,
			turnRunId
		});
		this.params.logError({
			error,
			operationType: 'fastchat_turn_run_update',
			projectId: timingState.projectId ?? undefined,
			metadata: {
				label,
				sessionId: timingState.sessionId,
				turnRunId,
				contextType: timingState.contextType
			}
		});
	}

	buildTimingSummary(finishedReason?: string | null): AgentTimingSummary {
		const timingState = this.params.getTimingState();
		return {
			request_started_at: new Date(this.params.requestStartedAtMs).toISOString(),
			session_resolved_at: toIsoString(timingState.sessionResolvedAtMs),
			history_loaded_at: toIsoString(timingState.historyLoadedAtMs),
			history_composed_at: toIsoString(timingState.historyComposedAtMs),
			context_ready_at: toIsoString(timingState.contextReadyAtMs),
			first_event_at: toIsoString(timingState.firstEventAtMs),
			first_response_at: toIsoString(timingState.firstResponseAtMs),
			assistant_persisted_at: toIsoString(timingState.assistantPersistedAtMs),
			done_emitted_at: toIsoString(timingState.doneEmittedAtMs),
			cache_source: timingState.contextCacheSource,
			context_load_source: timingState.contextLoadSource,
			cache_age_seconds: timingState.contextCacheAgeSeconds,
			bypassed_context_cache: timingState.bypassedContextCache,
			history_strategy: timingState.historyStrategy,
			history_compressed: timingState.historyCompressed,
			raw_history_count: timingState.rawHistoryCount,
			history_for_model_count: timingState.historyForModelCount,
			finished_reason: finishedReason ?? null,
			phases: {
				session_resolve_ms: durationMs(
					this.params.requestStartedAtMs,
					timingState.sessionResolvedAtMs
				),
				history_load_ms: durationMs(
					timingState.historyLoadStartedAtMs,
					timingState.historyLoadedAtMs
				),
				history_compose_ms: durationMs(
					timingState.historyComposeStartedAtMs,
					timingState.historyComposedAtMs
				),
				tool_selection_ms: timingState.toolSelectionMs ?? undefined,
				context_build_ms: durationMs(
					timingState.contextBuildStartedAtMs,
					timingState.contextReadyAtMs
				),
				request_to_context_ready_ms: durationMs(
					this.params.requestStartedAtMs,
					timingState.contextReadyAtMs
				),
				time_to_first_event_ms: durationMs(
					this.params.requestStartedAtMs,
					timingState.firstEventAtMs
				),
				time_to_first_response_ms: durationMs(
					this.params.requestStartedAtMs,
					timingState.firstResponseAtMs
				),
				response_generation_ms: durationMs(
					timingState.firstResponseAtMs,
					timingState.assistantPersistStartedAtMs ??
						timingState.assistantPersistedAtMs ??
						timingState.doneEmittedAtMs
				),
				assistant_persist_ms: durationMs(
					timingState.assistantPersistStartedAtMs,
					timingState.assistantPersistedAtMs
				),
				finalization_ms: durationMs(
					timingState.finalizationStartedAtMs,
					timingState.doneEmittedAtMs
				),
				total_request_ms: durationMs(
					this.params.requestStartedAtMs,
					timingState.doneEmittedAtMs ?? this.nowMs()
				)
			}
		};
	}

	queueTimingMetric(finishedReason?: string | null): AgentTimingSummary | null {
		const timingState = this.params.getTimingState();
		if (!timingState.sessionId) return null;

		const summary = this.buildTimingSummary(finishedReason);
		if (this.timingMetricQueued) {
			return summary;
		}

		this.timingMetricQueued = true;
		const timingMetricId = this.createId();
		this.timingMetricId = timingMetricId;
		const timingMetricReference = normalizeTimingMetricSessionReference({
			source: 'chat_sessions',
			sessionId: timingState.sessionId,
			metadata: {
				stream_version: 'v2',
				client_turn_id: this.params.clientTurnId ?? null,
				stream_run_id: this.params.streamRunId,
				project_id: timingState.projectId,
				entity_id: timingState.entityId,
				request_prewarmed_context: this.params.requestPrewarmedContext,
				context_load_source: timingState.contextLoadSource,
				prepared_prompt_requested: timingState.preparedPromptRequested,
				prepared_prompt_hit: timingState.preparedPromptHit,
				prepared_prompt_miss_reason: timingState.preparedPromptMissReason,
				prepared_prompt_id: timingState.preparedPromptId,
				prepared_prompt_age_seconds: timingState.preparedPromptAgeSeconds,
				prepared_prompt_surface_profile: timingState.preparedSurfaceProfile,
				timing_summary: JSON.parse(JSON.stringify(summary)) as Json
			}
		});
		const nowIso = new Date().toISOString();

		this.trackTimingTask(
			(async () => {
				const { error } = await this.params.supabase.from('timing_metrics').insert({
					id: timingMetricId,
					user_id: this.params.userId,
					session_id: timingMetricReference.session_id,
					turn_run_id: this.turnRunId,
					context_type: timingState.contextType,
					message_length: this.params.messageLength,
					message_received_at: new Date(this.params.requestStartedAtMs).toISOString(),
					first_event_at: summary.first_event_at ?? null,
					first_response_at: summary.first_response_at ?? null,
					time_to_first_event_ms: summary.phases.time_to_first_event_ms ?? null,
					time_to_first_response_ms: summary.phases.time_to_first_response_ms ?? null,
					context_build_ms: summary.phases.context_build_ms ?? null,
					tool_selection_ms: summary.phases.tool_selection_ms ?? null,
					metadata: timingMetricReference.metadata,
					created_at: nowIso,
					updated_at: nowIso
				});
				if (error) throw error;
			})(),
			'insert_turn_timing_metric',
			{ finishedReason }
		);

		return summary;
	}

	trackDetachedTask(
		promise: Promise<unknown> | PromiseLike<unknown>,
		label: string,
		metadata?: DetachedTaskMetadata
	): void {
		const task = Promise.resolve(promise)
			.catch((error) => {
				const timingState = this.params.getTimingState();
				const {
					projectId = timingState.projectId ?? undefined,
					contextType = timingState.contextType,
					sessionId = timingState.sessionId ?? undefined,
					entityId = timingState.entityId,
					...extraMetadata
				} = metadata ?? {};

				this.params.logger.warn(`Detached FastChat task failed: ${label}`, {
					error,
					sessionId
				});
				this.params.logError({
					error,
					operationType: 'fastchat_detached_task',
					projectId,
					metadata: {
						task: label,
						sessionId,
						contextType,
						entityId: entityId ?? null,
						...extraMetadata
					}
				});
			})
			.then(() => undefined);
		this.track(task);
	}

	async flush(): Promise<void> {
		await this.flushTurnEvents();
		await Promise.allSettled([...this.detachedTasks]);
		if (this.pendingTurnEvents.length > 0) {
			await this.flushTurnEvents();
		}
	}

	// Flush pending turn events AND the detached-task set, bounded by a timeout so a
	// hung detached write can never block the SSE stream from closing (which, on a
	// serverless lambda, would otherwise let the runtime freeze mid-flush and drop
	// the detached persistence entirely). Returns `completed: false` when the budget
	// elapsed before flush settled so the caller can log the drop.
	async flushWithBudget(timeoutMs: number): Promise<{ completed: boolean }> {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<'timeout'>((resolve) => {
			timer = setTimeout(() => resolve('timeout'), timeoutMs);
		});
		try {
			const outcome = await Promise.race([
				this.flush().then(() => 'flushed' as const),
				timeout
			]);
			return { completed: outcome === 'flushed' };
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	async flushTurnEvents(): Promise<void> {
		const events = this.pendingTurnEvents.splice(0);
		if (events.length === 0) return;

		try {
			const { error } = await this.params.supabase.from('chat_turn_events').insert(events);
			if (error) throw error;
		} catch (error) {
			const timingState = this.params.getTimingState();
			this.params.logger.warn('Failed to persist FastChat turn events batch', {
				error,
				sessionId: timingState.sessionId,
				eventCount: events.length
			});
			this.params.logError({
				error,
				operationType: 'fastchat_turn_event_batch',
				projectId: timingState.projectId ?? undefined,
				tableName: 'chat_turn_events',
				recordId: timingState.sessionId ?? undefined,
				metadata: {
					sessionId: timingState.sessionId,
					contextType: timingState.contextType,
					entityId: timingState.entityId,
					streamRunId: this.params.streamRunId,
					eventCount: events.length,
					firstSequenceIndex: events[0]?.sequence_index ?? null,
					lastSequenceIndex: events.at(-1)?.sequence_index ?? null
				}
			});
		}
	}

	private trackTimingTask(
		promise: Promise<unknown> | PromiseLike<unknown>,
		label: string,
		metadata?: Record<string, unknown>
	): void {
		const task = Promise.resolve(promise)
			.catch((error) => {
				const timingState = this.params.getTimingState();
				this.params.logger.warn(`Detached FastChat timing task failed: ${label}`, {
					error,
					sessionId: timingState.sessionId
				});
				this.params.logError({
					error,
					operationType: 'fastchat_timing_metric',
					projectId: timingState.projectId ?? undefined,
					tableName: 'timing_metrics',
					recordId: timingState.sessionId ?? undefined,
					metadata: {
						label,
						sessionId: timingState.sessionId,
						contextType: timingState.contextType,
						entityId: timingState.entityId,
						...(metadata ?? {})
					}
				});
			})
			.then(() => undefined);
		this.track(task);
	}

	private track(task: Promise<void>): void {
		this.detachedTasks.add(task);
		void task.finally(() => {
			this.detachedTasks.delete(task);
		});
	}

	private noteFirstHelpPath(path: string | null, sequenceIndex: number): void {
		if (!path || this.firstHelpPath) return;
		this.firstHelpPath = path;
		this.firstHelpSequence = sequenceIndex;
	}

	private noteFirstSkillPath(path: string | null, sequenceIndex: number): void {
		if (!path || this.firstSkillPath) return;
		this.firstSkillPath = path;
		this.firstSkillSequence = sequenceIndex;
	}

	private noteFirstCanonicalOp(op: string | null, sequenceIndex: number): void {
		if (!op || this.firstCanonicalOp) return;
		this.firstCanonicalOp = op;
		this.firstOpSequence = sequenceIndex;
	}
}
