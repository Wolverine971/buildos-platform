// apps/worker/tests/helpers/workflowProviderScript.ts
import {
	AgenticChatOpenRouterClient,
	type AgenticChatOpenAiCompatibleRouteV1
} from '../../src/workers/agentic-chat/provider/openrouter-client';
import { AgenticChatPendingEffectsRegistry } from '../../src/workers/agentic-chat/pendingEffects';

/**
 * Drives the real AgenticChatOpenRouterClient (and therefore the real physical
 * dispatch hook) with a scripted fetch. Each HTTP request is one physical dispatch.
 */
export type WorkflowRole = 'planner' | 'project_analyst' | 'risk_reviewer' | 'editor';

export type ScriptedReply =
	| {
			kind: 'text';
			text: string;
			toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
			completionTokens?: number;
			promptTokens?: number;
			/** Provider-reported USD cost; null omits it from usage. */
			costUsd?: number | null;
			finishReason?: string;
			chunks?: number;
			delayMs?: number;
			/** Stream the text, then stall until the request is aborted. */
			stallAfterText?: boolean;
	  }
	| { kind: 'http_error'; status: number }
	| { kind: 'no_response' };

export type ScriptedCall = {
	role: WorkflowRole;
	routeId: string;
	/** 1-based count of HTTP requests this role has made so far. */
	attempt: number;
	body: Record<string, any>;
	bytes: number;
};

export const PRICED_MODEL = 'deepseek/deepseek-v4.1-flash';

export function workflowRoute(
	id = 'openrouter',
	overrides: Partial<AgenticChatOpenAiCompatibleRouteV1> = {}
) {
	return {
		id,
		kind: 'openrouter' as const,
		baseUrl: `https://${id}.example/api/v1`,
		apiKey: 'provider-secret',
		model: PRICED_MODEL,
		fallbackModels: [],
		...overrides
	};
}

export function scriptedWorkflowProvider(
	script: (call: ScriptedCall) => ScriptedReply,
	options: { routes?: AgenticChatOpenAiCompatibleRouteV1[]; maxTokens?: number } = {}
) {
	const calls: ScriptedCall[] = [];
	const counts = new Map<WorkflowRole, number>();
	let inFlight = 0;
	let maxInFlight = 0;
	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const body = JSON.parse(String(init?.body ?? '{}'));
		const system = String(body.messages?.[0]?.content ?? '');
		const role = roleOf(system);
		const attempt = (counts.get(role) ?? 0) + 1;
		counts.set(role, attempt);
		const routeId = new URL(String(url)).hostname.split('.')[0]!;
		const call = {
			role,
			routeId,
			attempt,
			body,
			bytes: Buffer.byteLength(String(init?.body), 'utf8')
		};
		calls.push(call);
		const reply = script(call);
		const signal = init?.signal ?? new AbortController().signal;
		if (reply.kind === 'no_response') {
			return await new Promise<Response>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			});
		}
		if (reply.kind === 'http_error') {
			return new Response(JSON.stringify({ error: { message: 'upstream unavailable' } }), {
				status: reply.status,
				headers: {
					'content-type': 'application/json',
					'x-request-id': `req-${calls.length}`
				}
			});
		}
		inFlight += 1;
		maxInFlight = Math.max(maxInFlight, inFlight);
		const encoder = new TextEncoder();
		const pieces = splitText(reply.text, reply.chunks ?? 3);
		const id = `gen-${calls.length}`;
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const release = () => {
					inFlight -= 1;
				};
				try {
					if (reply.delayMs) await sleep(reply.delayMs, signal);
					for (const piece of pieces) {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ id, model: PRICED_MODEL, choices: [{ delta: { content: piece } }] })}\n\n`
							)
						);
						await sleep(1, signal);
					}
					if (reply.stallAfterText) {
						await new Promise((_resolve, reject) =>
							signal.addEventListener('abort', () => reject(signal.reason), {
								once: true
							})
						);
					}
					if (reply.toolCalls) {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ id, model: PRICED_MODEL, choices: [{ delta: { tool_calls: reply.toolCalls.map((call, index) => ({ index, id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } }] })}\n\n`
							)
						);
					}
					const promptTokens = reply.promptTokens ?? 2_000;
					const completionTokens = reply.completionTokens ?? 400;
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({
								id,
								model: PRICED_MODEL,
								choices: [
									{
										delta: {},
										finish_reason:
											reply.finishReason ??
											(reply.toolCalls ? 'tool_calls' : 'stop')
									}
								],
								usage: {
									prompt_tokens: promptTokens,
									completion_tokens: completionTokens,
									total_tokens: promptTokens + completionTokens,
									...(reply.costUsd === null
										? {}
										: { cost: reply.costUsd ?? 0.0011 })
								}
							})}\n\ndata: [DONE]\n\n`
						)
					);
					controller.close();
				} catch (error) {
					controller.error(error);
				} finally {
					release();
				}
			}
		});
		return new Response(stream, {
			status: 200,
			headers: { 'content-type': 'text/event-stream', 'x-request-id': id }
		});
	}) as typeof fetch;

	const usage: unknown[] = [];
	const client = new AgenticChatOpenRouterClient(
		{
			usage: { observe: (observation) => void usage.push(observation) },
			pendingEffects: new AgenticChatPendingEffectsRegistry()
		},
		{
			routes: options.routes ?? [workflowRoute()],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 20_000,
			responseHeadersTimeoutMs: 1_000,
			...(options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens })
		}
	);
	return {
		client,
		calls,
		usage,
		callsFor: (role: WorkflowRole) => calls.filter((call) => call.role === role),
		get maxInFlight() {
			return maxInFlight;
		}
	};
}

export function roleOf(system: string): WorkflowRole {
	if (system.includes('ROLE: Planner')) return 'planner';
	if (system.includes('ROLE: Document organizer')) return 'project_analyst';
	if (system.includes('ROLE: Project analyst')) return 'project_analyst';
	if (system.includes('ROLE: Risk and alternatives reviewer')) return 'risk_reviewer';
	if (system.includes('ROLE: Editor')) return 'editor';
	throw new Error('unknown workflow role');
}

export function plannerReply(): ScriptedReply {
	return {
		kind: 'text',
		text: JSON.stringify({
			analyst: 'Rank the next actions using the saved tasks.',
			reviewer: 'Find the risks that could change that order.'
		}),
		completionTokens: 200
	};
}

export function reportReply(
	role: 'project_analyst' | 'risk_reviewer',
	evidence: string[] = ['task-1'],
	overrides: Partial<Extract<ScriptedReply, { kind: 'text' }>> = {}
): ScriptedReply {
	return {
		kind: 'text',
		text: JSON.stringify({
			summary:
				role === 'project_analyst'
					? 'The venue is the next blocker.'
					: 'Catering is the main risk.',
			findings: [{ claim: `${role} finding about the venue.`, basis: 'recorded', evidence }],
			risks: [{ risk: 'Venue capacity is unconfirmed.', evidence: ['task-2'] }],
			unknowns: ['The budget ceiling'],
			recommendation: 'Book the venue after confirming capacity.'
		}),
		completionTokens: 1_500,
		...overrides
	};
}

export const EDITOR_TEXT =
	'Book the venue first: it blocks every later step (task: Book the venue). Then confirm the caterer, the main open risk.';

export function editorReply(
	overrides: Partial<Extract<ScriptedReply, { kind: 'text' }>> = {}
): ScriptedReply {
	return { kind: 'text', text: EDITOR_TEXT, completionTokens: 600, chunks: 4, ...overrides };
}

/** The ordinary happy path for every role. */
export function happyScript(call: ScriptedCall): ScriptedReply {
	if (call.role === 'planner') return plannerReply();
	if (call.role === 'editor') return editorReply();
	return reportReply(call.role);
}

function splitText(text: string, parts: number): string[] {
	const size = Math.max(1, Math.ceil(text.length / parts));
	const pieces: string[] = [];
	for (let index = 0; index < text.length; index += size)
		pieces.push(text.slice(index, index + size));
	return pieces.length ? pieces : [''];
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true }
		);
	});
}
