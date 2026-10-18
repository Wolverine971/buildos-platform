// apps/worker/scripts/agentic-chat-concurrency-load.ts
//
// Free, local load test for the Agentic Chat worker's per-process concurrency
// (audit 2026-10-17 S15). It runs N concurrent chat turns through the real
// consumer -> executor -> provider -> publisher path, with the model and the
// database faked, and reports memory, event-loop lag, CPU, turn wall time and
// Realtime frame rate per concurrency level. No network, no paid calls.
//
//   pnpm --filter @buildos/worker exec node --expose-gc --conditions=development \
//     --import tsx scripts/agentic-chat-concurrency-load.ts --levels 2,4,6,8,12,16
//
//   Options: --levels 2,4,6,8   --warmup-s 12   --window-s 35   --out <dir>
//            --level N (run a single level in this process; used by the driver)
//
// The driver runs each level in its own child process (clean memory baseline)
// with the child's stdout discarded: the queue and executor keep their
// production console logging, it just goes to /dev/null instead of Railway's
// log pipe. The report goes to stderr and to <out>/concurrency-load-*.json.
//
// Read memory as heap (avg and post-GC live heap per in-flight turn) and as the
// slope of peak RSS across levels: each child's idle RSS baseline still holds
// tsx compile memory that V8 releases later, so per-process RSS deltas mislead.
// tsx compiles sources on load, so a tree other sessions are editing can fail a
// level mid-sweep; run from `git archive HEAD apps/worker | tar -x -C <dir>`
// with apps/worker/node_modules and the root node_modules symlinked instead.
//
// REAL production classes exercised:
//   - SupabaseQueue (claim batching, refill on completion, processor_managed
//     lifecycle, worker timeout, heartbeat) — constructed exactly like
//     createAgenticChatConsumer minus its MAX_AGENTIC_CHAT_CONCURRENCY check.
//   - AgenticChatTurnExecutor (claim, begin, lease, provider loop, read tools,
//     publication, finalize, queue completion).
//   - AgenticChatTurnProviderAdapter (prompt assembly from the input artifact,
//     tool surface, turn state machine, continuation passes).
//   - AgenticChatProviderCapacity (constructed at 1, then its live options
//     object is raised to N, because its constructor refuses > the reviewed
//     ceiling; acquire/release/snapshot semantics are untouched).
//   - withAgenticChatLiveTextPreviewV1 + AgenticChatLiveTextPreviewBroadcaster
//     (AGENTIC_CHAT_LIVE_TEXT_PREVIEW is on in production).
//   - AgenticChatOpenRouterClient (request body build, SSE decoding, reasoning
//     watchdog, usage accounting) behind a fake fetch.
//   - AgenticChatStreamPublisher (text batching, semantic writes, acks,
//     broadcasts) with production default limits (equal to the Railway env).
//   - AgenticChatPendingEffectsRegistry.
//
// STAND-INS (simulated latency, no I/O):
//   - fetch: a paced OpenRouter-shaped SSE stream (deepseek-v4.1-flash, ~270
//     tok/s, 2-4 tokens per frame, reasoning deltas, a tool call, usage frame).
//   - Supabase: the `supabase` singleton's rpc/from are replaced so the real
//     queue claims from an endless in-memory job list.
//   - Executor ports (control, input, lease, cancellation, prompt snapshots,
//     observations, tool executions, session handoff, read tool) and the
//     publisher's persistence/broadcast ports: generalized from the fixtures in
//     tests/agenticChatTurnExecutor.test.ts, keyed per turn, each call delayed
//     15-40 ms (database) or 5-15 ms (Realtime broadcast).
//   - The lease keeper, cancellation observer and dead-turn recovery sweep are
//     not run (their periodic RPCs are not in the measurement).
//
// Turn profile: pass 1 = 1-2 s to first byte, 600-900 reasoning tokens, one
// get_project_overview call; read tool 200-400 ms returning ~5-10 KB; pass 2 =
// 0.8-1.5 s to first byte, ~400 reasoning tokens, 300-400 answer tokens. The
// prompt carries a ~30 KB system prompt, 10 history messages and the real
// 74-tool project gateway surface (~80 KB of schemas).

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const DEFAULT_OUT_DIR =
	'/private/tmp/claude-501/-Users-djwayne-buildos-platform/74d2d44d-fd18-429e-b11c-5ad46bd12af5/scratchpad/s15b14';
const LAG_RESOLUTION_MS = 20; // Same as WorkerEventLoopLagMonitor in production.
const TOKENS_PER_SECOND = 270;
const MODEL = 'deepseek/deepseek-v4.1-flash';

type Args = {
	levels: number[];
	level: number | null;
	warmupS: number;
	windowS: number;
	out: string;
	resultFile: string | null;
};

function parseArgs(argv: string[]): Args {
	const value = (name: string): string | null => {
		const index = argv.indexOf(name);
		return index >= 0 ? (argv[index + 1] ?? null) : null;
	};
	const levels = (value('--levels') ?? '2,4,6,8,12,16')
		.split(',')
		.map((part) => Number.parseInt(part, 10))
		.filter((n) => Number.isSafeInteger(n) && n > 0);
	const level = value('--level');
	return {
		levels,
		level: level === null ? null : Number.parseInt(level, 10),
		warmupS: Number.parseFloat(value('--warmup-s') ?? '12'),
		windowS: Number.parseFloat(value('--window-s') ?? '35'),
		out: value('--out') ?? DEFAULT_OUT_DIR,
		resultFile: value('--result-file')
	};
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Deterministic PRNG so every level sees the same turn mix. */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const random = mulberry32(20261017);
const between = (min: number, max: number) => min + (max - min) * random();
const intBetween = (min: number, max: number) => Math.round(between(min, max));
const dbLatency = () => sleep(intBetween(15, 40));
const broadcastLatency = () => sleep(intBetween(5, 15));

function percentile(values: number[], p: number): number {
	if (values.length === 0) return Number.NaN;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
	);
	return sorted[index]!;
}

const WORDS =
	'project plan task goal milestone review draft budget launch scope owner deadline risk note document outline section research customer signal follow up decision context summary priority status blocked ready shipping estimate weekly cadence'.split(
		' '
	);
function prose(chars: number): string {
	let text = '';
	while (text.length < chars) {
		text += `${WORDS[intBetween(0, WORDS.length - 1)]}${random() < 0.08 ? '.\n' : ' '}`;
	}
	return text.slice(0, chars);
}

// ---------------------------------------------------------------------------
// Per-level run (child process)
// ---------------------------------------------------------------------------

type TurnRecord = {
	turnRunId: string;
	queueJobId: string;
	sessionId: string;
	userId: string;
	correlationId: string;
	streamRunId: string;
	clientTurnId: string;
	inputArtifactId: string;
	userMessageId: string;
	processingToken: string;
	sequence: number;
	claimCount: number;
	claimedAtMs: number | null;
	finishedAtMs: number | null;
	simulatedModelMs: number;
	outcome: string | null;
};

async function runLevel(args: Args, concurrency: number): Promise<Record<string, unknown>> {
	// lib/supabase.ts throws without these and dotenv never overrides set values,
	// so the real apps/worker/.env credentials are never loaded into the client.
	process.env.PUBLIC_SUPABASE_URL = 'https://load-test.invalid';
	process.env.PRIVATE_SUPABASE_SERVICE_KEY = 'load-test-service-role-key';
	process.env.NODE_ENV = 'production';
	delete process.env.AGENTIC_CHAT_LOCAL_PROMPT_DUMPS;

	const [
		{ supabase },
		{ SupabaseQueue },
		{ AGENTIC_CHAT_TURN_LEASE_POLICY_V1, createAgentStreamEventIdV1 },
		{ getGatewaySurfaceForContextType },
		{ AgenticChatTurnExecutor },
		{ AgenticChatTurnProviderAdapter },
		{ AgenticChatProviderCapacity },
		{ AgenticChatOpenRouterClient },
		{ AgenticChatStreamPublisher },
		{ AgenticChatLiveTextPreviewBroadcaster, withAgenticChatLiveTextPreviewV1 },
		{ AgenticChatPendingEffectsRegistry },
		{ createStableAgenticChatPromptSnapshotIdV1 },
		{ AGENTIC_CHAT_SHUTDOWN_BUDGET_V1 },
		{ DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG }
	] = await Promise.all([
		import('../src/lib/supabase'),
		import('../src/lib/supabaseQueue'),
		import('@buildos/shared-types'),
		import('@buildos/agentic-chat-runtime/catalog'),
		import('../src/workers/agentic-chat/turn/turn-executor'),
		import('../src/workers/agentic-chat/provider/turn-provider'),
		import('../src/workers/agentic-chat/provider/provider-capacity'),
		import('../src/workers/agentic-chat/provider/openrouter-client'),
		import('../src/workers/agentic-chat/stream/stream-publisher'),
		import('../src/workers/agentic-chat/stream/live-text-preview'),
		import('../src/workers/agentic-chat/effects/pending-effects'),
		import('../src/workers/agentic-chat/effects/prompt-snapshot'),
		import('../src/workers/agentic-chat/host/shutdown-budget'),
		import('../src/workers/agentic-chat/host/consumer')
	]);

	// ----- Shared prompt material (built once, like a warm prepared context) -----
	const toolDefinitions = getGatewaySurfaceForContextType('project');
	const systemPrompt = `You are BuildOS. ${prose(30_000)}\n`;
	const contextPayload = {
		project: { id: 'context-project', name: 'Cedar House', summary: prose(2_500) },
		recent_activity: Array.from({ length: 12 }, (_, i) => ({
			id: `act-${i}`,
			text: prose(180)
		}))
	};
	const overviewResult = {
		project: { name: 'Cedar House', state: 'active', description: prose(1_500) },
		tasks: Array.from({ length: 24 }, (_, i) => ({
			id: randomUUID(),
			title: prose(50),
			state: i % 3 === 0 ? 'done' : 'todo',
			due_at: null,
			summary: prose(160)
		})),
		documents: Array.from({ length: 8 }, () => ({ id: randomUUID(), title: prose(40) }))
	};

	// ----- Fake database: turn registry, queue supply, receipts -----
	const turns = new Map<string, TurnRecord>();
	const byQueueRow = new Map<string, TurnRecord>();
	const bySession = new Map<string, TurnRecord>();
	const counters = {
		dbCalls: 0,
		broadcasts: 0,
		previewFrames: 0,
		providerRequests: 0,
		failures: [] as string[]
	};
	let supplyOpen = true;

	function newTurn(): TurnRecord {
		const turn: TurnRecord = {
			turnRunId: randomUUID(),
			queueJobId: randomUUID(),
			sessionId: randomUUID(),
			userId: randomUUID(),
			correlationId: randomUUID(),
			streamRunId: `stream-${randomUUID()}`,
			clientTurnId: `client-${randomUUID()}`,
			inputArtifactId: randomUUID(),
			userMessageId: randomUUID(),
			processingToken: randomUUID(),
			sequence: 0,
			claimCount: 0,
			claimedAtMs: null,
			finishedAtMs: null,
			simulatedModelMs: 0,
			outcome: null
		};
		turns.set(turn.turnRunId, turn);
		byQueueRow.set(turn.queueJobId, turn);
		bySession.set(turn.sessionId, turn);
		return turn;
	}

	const turnFor = (turnRunId: unknown): TurnRecord => {
		const turn = turns.get(String(turnRunId));
		if (!turn) throw new Error(`Unknown turn ${String(turnRunId)}`);
		return turn;
	};

	const thenable = (value: unknown) => {
		// A chainable PostgREST stand-in: every builder method returns itself.
		const chain: Record<string, unknown> = {};
		const handler: ProxyHandler<Record<string, unknown>> = {
			get(_target, property) {
				if (property === 'then') {
					return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
						dbLatency().then(() => resolve(value), reject);
				}
				return () => proxy;
			}
		};
		const proxy = new Proxy(chain, handler);
		return proxy;
	};

	const fakeRpc = async (name: string, params: Record<string, unknown>) => {
		counters.dbCalls += 1;
		await dbLatency();
		if (name === 'claim_pending_jobs') {
			if (!supplyOpen) return { data: [], error: null };
			const size = Number(params.p_batch_size ?? 0);
			const rows = Array.from({ length: size }, () => {
				const turn = newTurn();
				return {
					id: turn.queueJobId,
					queue_job_id: `agentic-chat-turn:${turn.turnRunId}`,
					job_type: 'agentic_chat_turn',
					user_id: turn.userId,
					metadata: { turnRunId: turn.turnRunId, correlationId: turn.correlationId },
					processing_token: turn.processingToken,
					status: 'processing',
					attempts: 0,
					max_attempts: 3,
					priority: 1
				};
			});
			return { data: rows, error: null };
		}
		return { data: true, error: null };
	};
	(supabase as unknown as { rpc: unknown }).rpc = fakeRpc;
	(supabase as unknown as { from: unknown }).from = () => thenable({ data: null, error: null });

	// ----- Publisher persistence + broadcast (real publisher) -----
	const persisted = (turn: TurnRecord, sequence: number) => ({
		outcome: 'persisted',
		publish_allowed: true,
		turn_run_id: turn.turnRunId,
		queue_job_id: turn.queueJobId,
		session_id: turn.sessionId,
		user_id: turn.userId,
		stream_run_id: turn.streamRunId,
		client_turn_id: turn.clientTurnId,
		execution_generation: 1,
		sequence_index: sequence,
		event_id: createAgentStreamEventIdV1(turn.turnRunId, 1, sequence),
		durable: true,
		reconcile_required: true,
		persisted_at: new Date().toISOString()
	});
	const persistence = {
		async flushTextBatches(inputs: Array<Record<string, unknown>>) {
			counters.dbCalls += 1;
			await dbLatency();
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results: inputs.map((input, index) => {
					const turn = turnFor(input.turn_run_id);
					turn.sequence += 1;
					return {
						...persisted(turn, turn.sequence),
						phase: 'llm',
						event_type: 'text_delta',
						batch_id: input.batch_id,
						text_delta: input.text_delta,
						assistant_text_bytes: Buffer.byteLength(String(input.assistant_text)),
						input_index: index
					};
				})
			};
		},
		async persistSemantic(input: Record<string, unknown>) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turn_run_id);
			turn.sequence += 1;
			return {
				...persisted(turn, turn.sequence),
				phase: input.phase,
				event_type: input.event_type,
				transition_id: input.transition_id,
				event_payload: input.event_payload
			};
		},
		async acknowledge(input: Record<string, unknown>) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turn_run_id);
			const acknowledged = Number(input.acknowledged_sequence);
			if (acknowledged === turn.sequence + 1) turn.sequence = acknowledged;
			if (acknowledged > turn.sequence) {
				throw Object.assign(new Error('agentic_chat_stream_ack_future_sequence'), {
					code: 'P0001'
				});
			}
			const superseded = acknowledged < turn.sequence;
			return {
				outcome: superseded ? 'newer_snapshot' : 'acknowledged',
				turn_run_id: turn.turnRunId,
				queue_job_id: turn.queueJobId,
				execution_generation: 1,
				acknowledged_sequence: acknowledged,
				current_sequence: turn.sequence,
				reconcile_required: superseded
			};
		}
	};
	const broadcast = {
		async publish(message: { kind: string }) {
			counters.broadcasts += 1;
			if (message.kind === 'live_text_preview') counters.previewFrames += 1;
			await broadcastLatency();
			return 'sent' as const;
		}
	};
	const publisher = new AgenticChatStreamPublisher({
		persistence: persistence as never,
		broadcast: broadcast as never
	});
	publisher.start();

	// ----- Fake OpenRouter: paced SSE -----
	const encoder = new TextEncoder();
	type Frame = Record<string, unknown>;
	const frameText = (frame: Frame) => `data: ${JSON.stringify(frame)}\n\n`;

	function sseStream(
		signal: AbortSignal | undefined,
		plan: {
			ttfbMs: number;
			reasoningTokens: number;
			answerTokens: number;
			toolCall: { id: string; name: string; arguments: string } | null;
			promptTokens: number;
		}
	): ReadableStream<Uint8Array> {
		const generationId = `gen-${randomUUID()}`;
		const base = {
			id: generationId,
			provider: 'Together',
			model: MODEL,
			object: 'chat.completion.chunk',
			created: Math.floor(Date.now() / 1000)
		};
		const deltaFrame = (
			delta: Record<string, unknown>,
			finish: string | null = null
		): Frame => ({
			...base,
			choices: [
				{
					index: 0,
					delta,
					finish_reason: finish,
					native_finish_reason: finish,
					logprobs: null
				}
			]
		});
		const frames: Frame[] = [];
		let remaining = plan.reasoningTokens;
		while (remaining > 0) {
			const tokens = Math.min(remaining, intBetween(2, 4));
			frames.push(
				deltaFrame({ role: 'assistant', content: '', reasoning: prose(tokens * 4) })
			);
			remaining -= tokens;
		}
		remaining = plan.answerTokens;
		while (remaining > 0) {
			const tokens = Math.min(remaining, intBetween(2, 4));
			frames.push(deltaFrame({ role: 'assistant', content: prose(tokens * 4) }));
			remaining -= tokens;
		}
		if (plan.toolCall) {
			frames.push(
				deltaFrame({
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							index: 0,
							id: plan.toolCall.id,
							type: 'function',
							function: { name: plan.toolCall.name, arguments: '' }
						}
					]
				})
			);
			const args = plan.toolCall.arguments;
			for (let i = 0; i < args.length; i += 12) {
				frames.push(
					deltaFrame({
						role: 'assistant',
						content: '',
						tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 12) } }]
					})
				);
			}
		}
		const completion = plan.reasoningTokens + plan.answerTokens + (plan.toolCall ? 30 : 0);
		const finish = plan.toolCall ? 'tool_calls' : 'stop';
		frames.push({
			...deltaFrame({ role: 'assistant', content: '' }, finish),
			usage: {
				prompt_tokens: plan.promptTokens,
				completion_tokens: completion,
				total_tokens: plan.promptTokens + completion,
				prompt_tokens_details: { cached_tokens: Math.floor(plan.promptTokens * 0.7) },
				completion_tokens_details: { reasoning_tokens: plan.reasoningTokens },
				cost: 0.0004
			}
		});
		const msPerFrame = (3 / TOKENS_PER_SECOND) * 1000;
		let cancelled = false;
		return new ReadableStream<Uint8Array>({
			async start(controller) {
				try {
					await sleep(plan.ttfbMs);
					const startedAt = Date.now();
					let sent = 0;
					// One network read usually carries several frames: deliver what is
					// due every ~35 ms rather than arming a timer per frame.
					while (sent < frames.length) {
						if (cancelled || signal?.aborted) return;
						const due = Math.min(
							frames.length,
							Math.max(sent + 1, Math.floor((Date.now() - startedAt) / msPerFrame))
						);
						let chunk = '';
						for (; sent < due; sent += 1) chunk += frameText(frames[sent]!);
						controller.enqueue(encoder.encode(chunk));
						await sleep(35);
					}
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				} catch (error) {
					if (!cancelled) controller.error(error);
				}
			},
			cancel() {
				cancelled = true;
			}
		});
	}

	const fakeFetch: typeof fetch = async (_url, init) => {
		counters.providerRequests += 1;
		const body = JSON.parse(String(init?.body ?? '{}')) as {
			messages?: Array<{ role: string; content?: unknown }>;
			session_id?: string;
		};
		const messages = body.messages ?? [];
		const toolResults = messages.filter((message) => message.role === 'tool').length;
		const promptTokens = Math.ceil(String(init?.body ?? '').length / 4);
		const opening = toolResults === 0;
		const plan = opening
			? {
					ttfbMs: intBetween(1_000, 2_000),
					reasoningTokens: intBetween(600, 900),
					answerTokens: 0,
					toolCall: {
						id: `call_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
						name: 'get_project_overview',
						arguments: JSON.stringify({ project_id: CONTEXT_PROJECT_ID })
					},
					promptTokens
				}
			: {
					ttfbMs: intBetween(800, 1_500),
					reasoningTokens: intBetween(350, 450),
					answerTokens: intBetween(300, 400),
					toolCall: null,
					promptTokens
				};
		// Planned stream time (first byte + paced frames), credited to the turn so
		// the report can separate model time from everything concurrency adds.
		const turn = bySession.get(String(body.session_id ?? ''));
		if (turn) {
			const tokens = plan.reasoningTokens + plan.answerTokens + (plan.toolCall ? 30 : 0);
			turn.simulatedModelMs += plan.ttfbMs + (tokens / TOKENS_PER_SECOND) * 1000;
		}
		return new Response(sseStream(init?.signal ?? undefined, plan), {
			status: 200,
			headers: {
				'content-type': 'text/event-stream; charset=utf-8',
				'x-openrouter-model': MODEL,
				'x-openrouter-provider': 'Together',
				'x-request-id': `req-${randomUUID()}`
			}
		});
	};

	// ----- Provider (real adapter + real OpenRouter client) -----
	const pendingEffects = new AgenticChatPendingEffectsRegistry();
	const executionObservations = {
		async observe() {
			counters.dbCalls += 1;
			await dbLatency();
		}
	};
	const openRouterClient = new AgenticChatOpenRouterClient(
		{
			usage: {
				async observe() {
					counters.dbCalls += 1;
					await dbLatency();
				}
			},
			executionObservations: executionObservations as never,
			pendingEffects,
			onUsageError: (error) => counters.failures.push(`usage: ${String(error)}`),
			onExecutionObservationError: (error) =>
				counters.failures.push(`observation: ${String(error)}`)
		},
		{
			routes: [
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: 'https://openrouter.invalid/api/v1',
					apiKey: 'sk-or-load-test',
					model: MODEL
				}
			],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Load Test',
			fetchImpl: fakeFetch
		}
	);
	const capacityOptions = { configured: true, concurrency: 1 };
	const providerCapacity = new AgenticChatProviderCapacity(capacityOptions);
	// The constructor refuses more than the reviewed ceiling; the class reads its
	// options live, so raising the same object tests a higher cap unmodified.
	capacityOptions.concurrency = concurrency;
	const actingClient = withAgenticChatLiveTextPreviewV1(
		openRouterClient,
		new AgenticChatLiveTextPreviewBroadcaster({
			publisher,
			broadcast: broadcast as never
		})
	);
	const provider = new AgenticChatTurnProviderAdapter({
		client: actingClient,
		capacity: providerCapacity
	});

	// ----- Executor ports (generalized from the executor test harness) -----
	const executionInputFor = (turn: TurnRecord) => {
		const now = new Date().toISOString();
		const history = Array.from({ length: 10 }, (_, i) => ({
			sourceMessageId: randomUUID(),
			role: i % 2 === 0 ? 'user' : 'assistant',
			content: prose(i % 2 === 0 ? 300 : 1_200),
			attachments: [],
			toolCalls: [],
			toolCallId: null
		}));
		return {
			claim: claimFor(turn, 'claimed'),
			streamRunId: turn.streamRunId,
			clientTurnId: turn.clientTurnId,
			requestPayload: {
				clientTurnId: turn.clientTurnId,
				streamRunId: turn.streamRunId,
				message: 'What is the state of Cedar House and what should I do next?',
				attachments: [],
				context: {
					type: 'project',
					entityId: CONTEXT_PROJECT_ID,
					projectId: CONTEXT_PROJECT_ID
				}
			},
			timingBaseline: {
				admittedAt: now,
				startedAt: now,
				workerStartedAt: now,
				executionStartedAt: null,
				historyCutoffAt: now,
				requestPrewarmedContext: false,
				cacheSource: 'not_requested',
				cacheAgeSeconds: null,
				historyStrategy: 'raw_history',
				historyCompressed: false,
				rawHistoryCount: history.length,
				historyForModelCount: history.length,
				preparedPromptId: null,
				preparedPromptHit: false,
				preparedPromptMissReason: null,
				preparedSurfaceProfile: null
			},
			artifact: {
				artifactVersion: 'agentic_chat_input_v2',
				historySource: 'admission_window',
				history,
				prepared: {
					sourcePreparedPromptId: null,
					contextPayload,
					conversationSummary: null,
					surfaceProfile: 'project_default',
					systemPrompt,
					promptSections: [],
					toolSurface: {
						surfaceProfile: 'project_default',
						toolNames: toolDefinitions.map((definition) => definition.function.name),
						definitions: toolDefinitions
					}
				},
				createdAt: now,
				retainUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
				contentHash: '0'.repeat(64)
			}
		};
	};

	function claimFor(turn: TurnRecord, outcome: 'claimed' | 'matching_current_claim') {
		return {
			outcome,
			executionMayStart: outcome === 'claimed',
			turnRunId: turn.turnRunId,
			queueJobId: turn.queueJobId,
			sessionId: turn.sessionId,
			userId: turn.userId,
			correlationId: turn.correlationId,
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: turn.inputArtifactId,
			userMessageId: turn.userMessageId
		};
	}

	const terminalReceipt = (
		turn: TurnRecord,
		status: string,
		sequence: number,
		overrides: Record<string, unknown> = {}
	) => ({
		outcome: 'finalized',
		turn_run_id: turn.turnRunId,
		queue_job_id: turn.queueJobId,
		session_id: turn.sessionId,
		user_id: turn.userId,
		execution_generation: 1,
		status,
		finished_reason: status === 'completed' ? 'stop' : status,
		failure_code: status === 'completed' ? null : status,
		assistant_message_id: null,
		terminal_event_id: createAgentStreamEventIdV1(turn.turnRunId, 1, sequence),
		terminal_sequence_index: sequence,
		terminalized_at: new Date().toISOString(),
		...overrides
	});

	const preterminalEvent = (
		turn: TurnRecord,
		sequence: number,
		eventType: string,
		transitionId: unknown,
		payload: Record<string, unknown>,
		at: string
	) => ({
		...persisted(turn, sequence),
		phase: 'finalize',
		event_type: eventType,
		transition_id: transitionId,
		event_payload: payload,
		persisted_at: at
	});

	const control = {
		async claim(input: { turnRunId: string }) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turnRunId);
			turn.claimCount += 1;
			if (turn.claimCount === 1) turn.claimedAtMs = Date.now();
			return claimFor(turn, turn.claimCount === 1 ? 'claimed' : 'matching_current_claim');
		},
		async begin(input: { turnRunId: string }) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turnRunId);
			return {
				outcome: 'started',
				invoke_provider: true,
				turn_run_id: turn.turnRunId,
				queue_job_id: turn.queueJobId,
				session_id: turn.sessionId,
				user_id: turn.userId,
				correlation_id: turn.correlationId,
				execution_generation: 1,
				execution_started_at: new Date().toISOString(),
				status: 'running'
			};
		},
		async recover(input: {
			turnRunId: string;
			failureClass: string;
			errorMessage: string | null;
		}) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turnRunId);
			counters.failures.push(`recover ${input.failureClass}: ${input.errorMessage ?? ''}`);
			return {
				outcome: 'finalize_failed',
				execution_may_retry: false,
				failure_code: 'transient_infra',
				turn_run_id: turn.turnRunId,
				queue_job_id: turn.queueJobId,
				session_id: turn.sessionId,
				user_id: turn.userId,
				correlation_id: turn.correlationId,
				execution_generation: 1,
				status: 'running'
			};
		},
		async finalize(input: Record<string, unknown>) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = turnFor(input.turnRunId);
			const at = new Date().toISOString();
			const status = String(input.status);
			const timingDraft = input.timingDraft as Record<string, unknown> | null | undefined;
			const timingEvent = (sequence: number) =>
				preterminalEvent(
					turn,
					sequence,
					'timing',
					input.timingTransitionId,
					{
						type: 'timing',
						timing: {
							...timingDraft,
							assistant_persisted_at: input.assistantMessageId ? at : null,
							done_emitted_at: null,
							terminal_committed_at: at,
							phases: {
								...(timingDraft?.phases as Record<string, unknown>),
								total_request_ms: 3_000
							}
						}
					},
					at
				);
			if (
				status === 'failed' &&
				input.publicError &&
				input.errorTransitionId &&
				timingDraft &&
				input.timingTransitionId
			) {
				const errorSequence = turn.sequence + 1;
				const timingSequence = turn.sequence + 2;
				turn.sequence = timingSequence;
				return terminalReceipt(turn, 'failed', timingSequence + 1, {
					finished_reason: input.finishedReason,
					failure_code: input.failureCode,
					assistant_message_id: input.assistantMessageId,
					terminalized_at: at,
					preterminal_events: [
						preterminalEvent(
							turn,
							errorSequence,
							'error',
							input.errorTransitionId,
							{ type: 'error', error: input.publicError },
							at
						),
						timingEvent(timingSequence)
					]
				});
			}
			const lastTurnContext = input.lastTurnContext as
				| Record<string, unknown>
				| null
				| undefined;
			if ((status === 'completed' || status === 'cancelled') && lastTurnContext) {
				const contextEvent = (sequence: number) =>
					preterminalEvent(
						turn,
						sequence,
						'last_turn_context',
						input.lastTurnContextTransitionId,
						{
							type: 'last_turn_context',
							context: { ...lastTurnContext, timestamp: at }
						},
						at
					);
				if (timingDraft && input.timingTransitionId) {
					const contextSequence = turn.sequence + 1;
					const timingSequence = turn.sequence + 2;
					turn.sequence = timingSequence;
					return terminalReceipt(turn, status, timingSequence + 1, {
						failure_code: input.failureCode,
						assistant_message_id: input.assistantMessageId,
						terminalized_at: at,
						preterminal_events: [
							contextEvent(contextSequence),
							timingEvent(timingSequence)
						]
					});
				}
				turn.sequence += 1;
				return terminalReceipt(turn, status, turn.sequence + 1, {
					failure_code: input.failureCode,
					assistant_message_id: input.assistantMessageId,
					terminalized_at: at,
					preterminal_event: contextEvent(turn.sequence)
				});
			}
			if (timingDraft && input.timingTransitionId) {
				const timingSequence = turn.sequence + 1;
				turn.sequence = timingSequence;
				return terminalReceipt(turn, status, timingSequence + 1, {
					failure_code: input.failureCode,
					assistant_message_id: input.assistantMessageId,
					terminalized_at: at,
					preterminal_events: [timingEvent(timingSequence)]
				});
			}
			return terminalReceipt(turn, status, turn.sequence + 1, {
				failure_code: input.failureCode,
				assistant_message_id: input.assistantMessageId,
				terminalized_at: at
			});
		},
		async completeQueueJob(input: { queueJobId: string }) {
			counters.dbCalls += 1;
			await dbLatency();
			const turn = byQueueRow.get(input.queueJobId);
			if (turn && turn.finishedAtMs === null) turn.finishedAtMs = Date.now();
			return true;
		}
	};

	const input = {
		async load(claim: { turnRunId: string }) {
			counters.dbCalls += 2; // chat_turn_runs + chat_turn_input_artifacts reads
			await dbLatency();
			await dbLatency();
			return executionInputFor(turnFor(claim.turnRunId));
		}
	};
	const readTool = {
		prepareTurnToolBatchSecurity() {},
		async execute() {
			counters.dbCalls += 3;
			await sleep(intBetween(200, 400));
			return {
				result: overviewResult,
				executionTimeMs: 300,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'utility',
				resultCount: overviewResult.tasks.length,
				zeroResult: false,
				requiresUserAction: false
			};
		}
	};
	const delayedVoid = async () => {
		counters.dbCalls += 1;
		await dbLatency();
	};
	const executor = new AgenticChatTurnExecutor({
		control: control as never,
		input: input as never,
		publisher,
		cancellation: {
			registerTurn: () => new AbortController().signal,
			unregisterTurn: () => true
		} as never,
		lease: {
			hold: () => ({
				signal: new AbortController().signal,
				isFresh: () => true,
				release: () => undefined
			})
		} as never,
		provider,
		promptSnapshots: {
			async persist(snapshotInput: { turnRunId?: string }) {
				await delayedVoid();
				return {
					outcome: 'persisted' as const,
					snapshotAvailable: true,
					promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(
						String(snapshotInput?.turnRunId ?? randomUUID())
					)
				};
			}
		} as never,
		pendingEffects,
		executionObservations: executionObservations as never,
		onPromptSnapshotError: (error) => counters.failures.push(`snapshot: ${String(error)}`),
		onTerminalControlError: (report) =>
			counters.failures.push(`terminal ${report.stage}: ${String(report.error)}`),
		onTimingSnapshot: (snapshot) =>
			console.info(JSON.stringify({ event: 'agentic_chat_runtime_timing', snapshot })),
		readTool: readTool as never,
		toolExecutions: {
			persistRead: delayedVoid,
			persistFailure: delayedVoid,
			persistMutation: delayedVoid
		} as never,
		sessionHandoff: { persist: delayedVoid } as never,
		mutation: {
			execute: async () => {
				throw new Error('mutations are disabled in the load test');
			}
		} as never
	});

	// ----- Real queue consumer (createAgenticChatConsumer minus the bound check) -----
	const consumerConfig = { ...DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG, concurrency };
	const queue = new SupabaseQueue({
		batchSize: consumerConfig.concurrency,
		pollInterval: consumerConfig.pollIntervalMs,
		wakeAwarePolling: { idleIntervalMs: consumerConfig.idlePollIntervalMs, jitterMs: 250 },
		stalledTimeout: AGENTIC_CHAT_TURN_LEASE_POLICY_V1.unleasedExpiredAfterMs,
		drainTimeout: consumerConfig.drainTimeoutMs,
		abortGraceMs: AGENTIC_CHAT_SHUTDOWN_BUDGET_V1.abortCleanupGraceMs,
		genericStalledRecovery: false
	});
	queue.process<{ turnRunId: string; correlationId: string }>(
		'agentic_chat_turn',
		async (job) => {
			const started = Date.now();
			const result = await executor.execute(job as never);
			const turn = turns.get(job.data.turnRunId);
			if (turn) {
				turn.outcome = result.outcome;
				if (turn.finishedAtMs === null) turn.finishedAtMs = Date.now();
				turn.claimedAtMs ??= started;
				if (result.outcome !== 'completed') {
					counters.failures.push(`outcome ${result.outcome} (${result.terminalStatus})`);
				}
			}
			return result;
		},
		{ queueLifecycle: 'processor_managed', workerTimeoutMs: consumerConfig.workerTimeoutMs }
	);

	// ----- Measurement -----
	const gc = (globalThis as { gc?: () => void }).gc;
	gc?.();
	await sleep(300);
	gc?.();
	const baseline = process.memoryUsage();

	const histogram = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
	histogram.enable();
	await queue.start();
	await sleep(args.warmupS * 1000);

	histogram.reset();
	const windowStartMs = Date.now();
	const cpuStart = process.cpuUsage();
	const counterStart = { ...counters, failures: counters.failures.length };
	const samples: Array<{ rss: number; heapUsed: number; inFlight: number }> = [];
	const sampler = setInterval(() => {
		const usage = process.memoryUsage();
		let inFlight = 0;
		for (const turn of turns.values()) {
			if (turn.claimedAtMs !== null && turn.finishedAtMs === null) inFlight += 1;
		}
		samples.push({ rss: usage.rss, heapUsed: usage.heapUsed, inFlight });
	}, 250);
	await sleep(args.windowS * 1000);
	clearInterval(sampler);
	const windowEndMs = Date.now();
	const cpu = process.cpuUsage(cpuStart);
	histogram.disable();
	supplyOpen = false;
	// Live (post-GC) heap with turns still in flight, taken after the lag window
	// closes so the forced collection never shows up as event-loop lag.
	let liveInFlight = 0;
	for (const turn of turns.values()) {
		if (turn.claimedAtMs !== null && turn.finishedAtMs === null) liveInFlight += 1;
	}
	gc?.();
	const liveHeap = process.memoryUsage().heapUsed;

	const windowS = (windowEndMs - windowStartMs) / 1000;
	const finishedInWindow = [...turns.values()].filter(
		(turn) =>
			turn.finishedAtMs !== null &&
			turn.finishedAtMs >= windowStartMs &&
			turn.finishedAtMs <= windowEndMs
	);
	const completed = finishedInWindow.filter((turn) => turn.outcome === 'completed');
	const measured = completed.filter(
		(turn) => turn.claimedAtMs !== null && turn.claimedAtMs >= windowStartMs - 20_000
	);
	const walls = measured.map((turn) => turn.finishedAtMs! - turn.claimedAtMs!);
	// Wall time minus the planned model stream time: tool latency, simulated
	// database round trips, and anything concurrency adds (CPU, lag, queueing).
	const overheads = measured.map(
		(turn) => turn.finishedAtMs! - turn.claimedAtMs! - turn.simulatedModelMs
	);
	const mb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
	const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
	const peakRss = Math.max(...samples.map((s) => s.rss));
	const avgHeap = avg(samples.map((s) => s.heapUsed));
	const peakHeap = Math.max(...samples.map((s) => s.heapUsed));
	const avgInFlight = avg(samples.map((s) => s.inFlight));
	const net = (ns: number) => Math.max(0, Math.round((ns / 1e6 - LAG_RESOLUTION_MS) * 100) / 100);

	const failures = counters.failures.slice(counterStart.failures);
	const failureCounts: Record<string, number> = {};
	for (const failure of failures) {
		const key = failure.slice(0, 160);
		failureCounts[key] = (failureCounts[key] ?? 0) + 1;
	}

	return {
		concurrency,
		windowS: Math.round(windowS * 10) / 10,
		avgInFlight: Math.round(avgInFlight * 10) / 10,
		turnsFinished: finishedInWindow.length,
		turnsCompleted: completed.length,
		turnsNotCompleted: finishedInWindow.length - completed.length,
		turnsPerMinute: Math.round((completed.length / windowS) * 60 * 10) / 10,
		turnWallP50Ms: percentile(walls, 50),
		turnWallP90Ms: percentile(walls, 90),
		turnWallMaxMs: walls.length ? Math.max(...walls) : null,
		nonModelP50Ms: Math.round(percentile(overheads, 50)),
		nonModelP90Ms: Math.round(percentile(overheads, 90)),
		baselineRssMb: mb(baseline.rss),
		baselineHeapMb: mb(baseline.heapUsed),
		peakRssMb: mb(peakRss),
		avgHeapMb: mb(avgHeap),
		peakHeapMb: mb(peakHeap),
		rssDeltaPerTurnMb:
			Math.round(((peakRss - baseline.rss) / 1024 / 1024 / concurrency) * 10) / 10,
		heapDeltaPerTurnMb:
			Math.round(
				((avgHeap - baseline.heapUsed) / 1024 / 1024 / Math.max(1, avgInFlight)) * 10
			) / 10,
		liveInFlight,
		liveHeapAfterGcMb: gc ? mb(liveHeap) : null,
		liveHeapPerTurnMb: gc
			? Math.round(
					((liveHeap - baseline.heapUsed) / 1024 / 1024 / Math.max(1, liveInFlight)) * 100
				) / 100
			: null,
		lagMeanNetMs: net(histogram.mean),
		lagP99NetMs: net(histogram.percentile(99)),
		lagMaxNetMs: net(histogram.max),
		cpuPctOfOneCore: Math.round(((cpu.user + cpu.system) / 1e6 / windowS) * 1000) / 10,
		previewFramesPerS:
			Math.round(((counters.previewFrames - counterStart.previewFrames) / windowS) * 10) / 10,
		broadcastsPerS:
			Math.round(((counters.broadcasts - counterStart.broadcasts) / windowS) * 10) / 10,
		dbCallsPerS: Math.round(((counters.dbCalls - counterStart.dbCalls) / windowS) * 10) / 10,
		providerRequestsPerS:
			Math.round(
				((counters.providerRequests - counterStart.providerRequests) / windowS) * 100
			) / 100,
		failureCounts
	};
}

const CONTEXT_PROJECT_ID = '40000000-0000-4000-8000-000000000004';

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function formatTable(results: Array<Record<string, unknown>>): string {
	const columns: Array<[string, string]> = [
		['N', 'concurrency'],
		['inFlight', 'avgInFlight'],
		['done', 'turnsCompleted'],
		['notDone', 'turnsNotCompleted'],
		['turns/min', 'turnsPerMinute'],
		['wallP50', 'turnWallP50Ms'],
		['wallP90', 'turnWallP90Ms'],
		['nonModelP50', 'nonModelP50Ms'],
		['nonModelP90', 'nonModelP90Ms'],
		['rssBase', 'baselineRssMb'],
		['rssPeak', 'peakRssMb'],
		['heapAvg', 'avgHeapMb'],
		['heap/turn', 'heapDeltaPerTurnMb'],
		['live/turn', 'liveHeapPerTurnMb'],
		['lagMean', 'lagMeanNetMs'],
		['lagP99', 'lagP99NetMs'],
		['lagMax', 'lagMaxNetMs'],
		['cpu%', 'cpuPctOfOneCore'],
		['preview/s', 'previewFramesPerS'],
		['bcast/s', 'broadcastsPerS'],
		['db/s', 'dbCallsPerS']
	];
	const rows = [columns.map(([label]) => label)];
	for (const result of results) rows.push(columns.map(([, key]) => String(result[key] ?? '')));
	const widths = columns.map((_, i) => Math.max(...rows.map((row) => row[i]!.length)));
	return rows.map((row) => row.map((cell, i) => cell.padStart(widths[i]!)).join('  ')).join('\n');
}

async function main(): Promise<void> {
	const args = parseArgs(process.argv.slice(2));
	if (args.level !== null) {
		const result = await runLevel(args, args.level);
		if (args.resultFile) writeFileSync(args.resultFile, JSON.stringify(result, null, 2));
		process.stderr.write(`${JSON.stringify(result)}\n`);
		process.exit(0);
	}

	mkdirSync(args.out, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const results: Array<Record<string, unknown>> = [];
	for (const level of args.levels) {
		const resultFile = join(args.out, `concurrency-load-level-${level}-${stamp}.json`);
		process.stderr.write(`level N=${level}: running ~${args.warmupS + args.windowS}s...\n`);
		const child = spawnSync(
			process.execPath,
			[
				...process.execArgv,
				process.argv[1]!,
				'--level',
				String(level),
				'--warmup-s',
				String(args.warmupS),
				'--window-s',
				String(args.windowS),
				'--result-file',
				resultFile
			],
			{ stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 }
		);
		if (child.status !== 0) {
			process.stderr.write(`level ${level} failed (${child.status}):\n${child.stderr}\n`);
			continue;
		}
		results.push(JSON.parse(readFileSync(resultFile, 'utf8')) as Record<string, unknown>);
	}
	const reportFile = join(args.out, `concurrency-load-${stamp}.json`);
	writeFileSync(reportFile, JSON.stringify({ args, results }, null, 2));
	process.stderr.write(`\n${formatTable(results)}\n\n`);
	for (const result of results) {
		const failures = result.failureCounts as Record<string, number>;
		if (Object.keys(failures).length > 0) {
			process.stderr.write(
				`N=${String(result.concurrency)} failures: ${JSON.stringify(failures)}\n`
			);
		}
	}
	process.stderr.write(
		`lag = monitorEventLoopDelay(resolution ${LAG_RESOLUTION_MS} ms) minus the resolution; report: ${reportFile}\n`
	);
}

void main().catch((error) => {
	process.stderr.write(
		`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
	);
	process.exit(1);
});
