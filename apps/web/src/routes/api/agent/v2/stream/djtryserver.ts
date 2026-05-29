// apps/web/src/routes/api/agent/v2/stream/djtryserver.ts

export const config = {
	maxDuration: 300,
	memory: 1024
};

import type { RequestHandler } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import type { ChatContextType, Database } from '@buildos/shared-types';
import type {
	OpenRouterChatMessage,
	OpenRouterChatRequest
} from '$lib/services/openrouter-v2/types';
import { ApiResponse } from '$lib/utils/api-response';

type ProjectPromptContext = Pick<
	Database['public']['Tables']['onto_projects']['Row'],
	'id' | 'name' | 'description' | 'props'
>;

type ChatSessionPromptContext = Pick<
	Database['public']['Tables']['chat_sessions']['Row'],
	'id' | 'summary' | 'context_type' | 'entity_id'
>;

type PrewarmedPromptContext = {
	project?: ProjectPromptContext | null;
};

type DjTryStreamRequest = {
	message?: unknown;
	session_id?: unknown;
	context_type?: unknown;
	contextType?: unknown;
	entity_id?: unknown;
	project_id?: unknown;
	project?: { id?: unknown } | null;
	prewarm_context?: PrewarmedPromptContext | null;
	prewarmed_context?: PrewarmedPromptContext | null;
	prewarmedContext?: PrewarmedPromptContext | null;
};

type PromptInput = {
	message: string;
	chatContextType: ChatContextType;
	session: ChatSessionPromptContext | null;
	project: ProjectPromptContext | null;
};

type BuiltPrompt = {
	messages: OpenRouterChatMessage[];
	metadata: {
		contextType: ChatContextType;
		sessionId?: string;
		projectId?: string;
	};
};

type StreamUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
};

type AgentStreamEvent =
	| { type: 'text_delta'; content: string }
	| { type: 'error'; error: string }
	| { type: 'done'; usage?: StreamUsage; finished_reason?: string };

type OpenRouterStreamChunk = {
	choices?: Array<{
		delta?: {
			content?: unknown;
		};
		finish_reason?: unknown;
		usage?: unknown;
	}>;
	usage?: unknown;
	error?: unknown;
};

const CHAT_CONTEXT_TYPES = new Set<string>([
	'global',
	'project',
	'calendar',
	'daily_brief',
	'general',
	'project_create',
	'daily_brief_update',
	'ontology'
]);

function trimOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeChatContextType(value: unknown): ChatContextType {
	if (typeof value === 'string' && CHAT_CONTEXT_TYPES.has(value)) {
		return value as ChatContextType;
	}
	return 'general';
}

async function parseRequest(request: Request): Promise<DjTryStreamRequest> {
	const body = (await request.json()) as unknown;
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return {};
	}
	return body as DjTryStreamRequest;
}

function getPrewarmedProject(body: DjTryStreamRequest): ProjectPromptContext | null {
	return (
		body.prewarm_context?.project ??
		body.prewarmed_context?.project ??
		body.prewarmedContext?.project ??
		null
	);
}

function resolveProjectId(
	body: DjTryStreamRequest,
	chatContextType: ChatContextType
): string | undefined {
	return (
		trimOptionalString(body.project_id) ??
		trimOptionalString(body.project?.id) ??
		(chatContextType === 'project' ? trimOptionalString(body.entity_id) : undefined)
	);
}

async function loadSession(
	supabase: App.Locals['supabase'],
	userId: string,
	body: DjTryStreamRequest
): Promise<ChatSessionPromptContext | null> {
	const sessionId = trimOptionalString(body.session_id);
	if (!sessionId) return null;

	const { data, error } = await supabase
		.from('chat_sessions')
		.select('id, summary, context_type, entity_id')
		.eq('id', sessionId)
		.eq('user_id', userId)
		.maybeSingle();

	if (error) throw error;
	return data;
}

async function loadProject(
	supabase: App.Locals['supabase'],
	body: DjTryStreamRequest,
	chatContextType: ChatContextType
): Promise<ProjectPromptContext | null> {
	const prewarmedProject = getPrewarmedProject(body);
	if (prewarmedProject) return prewarmedProject;

	const projectId = resolveProjectId(body, chatContextType);
	if (!projectId) return null;

	const { data, error } = await supabase
		.from('onto_projects')
		.select('id, name, description, props')
		.eq('id', projectId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) throw error;
	return data;
}

function buildPrompt(params: PromptInput): BuiltPrompt {
	const systemLines = ['You are BuildOS chat.', `Context type: ${params.chatContextType}.`];

	if (params.project) {
		systemLines.push(`Project: ${params.project.name}.`);
		if (params.project.description) {
			systemLines.push(`Project description: ${params.project.description}`);
		}
	}

	if (params.session?.summary) {
		systemLines.push(`Session summary: ${params.session.summary}`);
	}

	return {
		messages: [
			{ role: 'system', content: systemLines.join('\n') },
			{ role: 'user', content: params.message }
		],
		metadata: {
			contextType: params.chatContextType,
			sessionId: params.session?.id,
			projectId: params.project?.id
		}
	};
}

function buildOpenRouterRequest(prompt: BuiltPrompt): OpenRouterChatRequest {
	return {
		model: privateEnv.OPENROUTER_DJTRY_MODEL || 'openrouter/auto',
		messages: prompt.messages,
		stream: true,
		stream_options: {
			include_usage: true
		}
	};
}

function encodeSseEvent(event: AgentStreamEvent): Uint8Array {
	return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function splitSseFrames(buffer: string): { frames: string[]; remaining: string } {
	const frames: string[] = [];
	let remaining = buffer;

	while (true) {
		const separator = remaining.match(/\r?\n\r?\n/);
		if (!separator) break;
		const index = separator.index;
		if (index === undefined) break;

		frames.push(remaining.slice(0, index));
		remaining = remaining.slice(index + separator[0].length);
	}

	return { frames, remaining };
}

function getSseData(frame: string): string | null {
	const dataLines = frame
		.split(/\r?\n/)
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(5).trimStart());

	if (dataLines.length === 0) return null;
	return dataLines.join('\n');
}

function readUsage(value: unknown): StreamUsage | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const usage = value as Record<string, unknown>;
	const normalized: StreamUsage = {};

	if (typeof usage.prompt_tokens === 'number') normalized.prompt_tokens = usage.prompt_tokens;
	if (typeof usage.completion_tokens === 'number') {
		normalized.completion_tokens = usage.completion_tokens;
	}
	if (typeof usage.total_tokens === 'number') normalized.total_tokens = usage.total_tokens;

	return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function readOpenRouterError(error: unknown): string | null {
	if (!error) return null;
	if (typeof error === 'string') return error;
	if (typeof error !== 'object') return 'OpenRouter stream failed';

	const message = (error as { message?: unknown }).message;
	return typeof message === 'string' && message.trim()
		? message.trim()
		: 'OpenRouter stream failed';
}

function readOpenRouterChunk(data: string): OpenRouterStreamChunk | null {
	try {
		const parsed = JSON.parse(data) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed as OpenRouterStreamChunk;
	} catch {
		return null;
	}
}

async function streamOpenRouterToClient(params: {
	upstreamBody: ReadableStream<Uint8Array>;
	signal: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	const decoder = new TextDecoder();

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let buffer = '';
			let finishedReason: string | undefined;
			let usage: StreamUsage | undefined;
			let sentDone = false;

			const send = (event: AgentStreamEvent): void => {
				controller.enqueue(encodeSseEvent(event));
			};

			const sendDone = (reason: string): void => {
				if (sentDone) return;
				sentDone = true;
				send({ type: 'done', usage, finished_reason: reason });
			};

			const processFrame = (frame: string): void => {
				if (sentDone) return;

				const data = getSseData(frame);
				if (!data) return;
				if (data === '[DONE]') {
					sendDone(finishedReason ?? 'stop');
					return;
				}

				const chunk = readOpenRouterChunk(data);
				if (!chunk) return;

				const error = readOpenRouterError(chunk.error);
				if (error) {
					send({ type: 'error', error });
					sendDone('error');
					return;
				}

				usage = readUsage(chunk.usage) ?? usage;

				for (const choice of chunk.choices ?? []) {
					const delta = choice.delta?.content;
					if (typeof delta === 'string' && delta.length > 0) {
						send({ type: 'text_delta', content: delta });
					}

					const choiceUsage = readUsage(choice.usage);
					if (choiceUsage) usage = choiceUsage;

					if (typeof choice.finish_reason === 'string' && choice.finish_reason.trim()) {
						finishedReason = choice.finish_reason.trim();
					}
				}
			};

			try {
				reader = params.upstreamBody.getReader();

				while (!params.signal.aborted) {
					const { value, done } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const split = splitSseFrames(buffer);
					buffer = split.remaining;
					for (const frame of split.frames) {
						processFrame(frame);
					}
				}

				const tail = `${buffer}${decoder.decode()}`.trim();
				if (tail) processFrame(tail);

				if (!params.signal.aborted) {
					sendDone(finishedReason ?? 'stop');
				}
			} catch (error) {
				if (!params.signal.aborted) {
					const message =
						error instanceof Error ? error.message : 'OpenRouter stream failed';
					send({ type: 'error', error: message });
					sendDone('error');
				}
			} finally {
				try {
					controller.close();
				} catch {
					// The client may already have closed the connection.
				}
			}
		},
		async cancel() {
			await reader?.cancel().catch(() => undefined);
		}
	});
}

async function streamOpenRouterResponse(params: {
	fetch: typeof fetch;
	prompt: BuiltPrompt;
	signal: AbortSignal;
}): Promise<Response> {
	const apiKey = privateEnv.PRIVATE_OPENROUTER_API_KEY;
	if (!apiKey) {
		return ApiResponse.internalError(
			new Error('Missing PRIVATE_OPENROUTER_API_KEY'),
			'OpenRouter is not configured'
		);
	}

	const baseUrl = privateEnv.OPENROUTER_V2_BASE_URL || 'https://openrouter.ai/api/v1';
	const upstream = await params.fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
			'HTTP-Referer': privateEnv.OPENROUTER_HTTP_REFERER || 'https://build-os.com',
			'X-Title': privateEnv.OPENROUTER_APP_NAME || 'BuildOS Agent Stream'
		},
		body: JSON.stringify(buildOpenRouterRequest(params.prompt)),
		signal: params.signal
	});

	if (!upstream.ok) {
		return ApiResponse.error('OpenRouter request failed', upstream.status || 502);
	}

	if (!upstream.body) {
		return ApiResponse.internalError(
			new Error('OpenRouter response did not include a stream body'),
			'OpenRouter stream did not start'
		);
	}

	const stream = await streamOpenRouterToClient({
		upstreamBody: upstream.body,
		signal: params.signal
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Content-Type-Options': 'nosniff'
		}
	});
}

export const POST: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	fetch
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	let body: DjTryStreamRequest;
	try {
		body = await parseRequest(request);
	} catch {
		return ApiResponse.badRequest('Invalid request body');
	}

	const message = trimOptionalString(body.message);
	if (!message) {
		return ApiResponse.badRequest('Message is required');
	}

	try {
		const session = await loadSession(supabase, user.id, body);
		const chatContextType = normalizeChatContextType(
			body.contextType ?? body.context_type ?? session?.context_type
		);
		const project = await loadProject(supabase, body, chatContextType);
		const prompt = buildPrompt({ session, message, project, chatContextType });

		return await streamOpenRouterResponse({
			fetch,
			prompt,
			signal: request.signal
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to prepare chat stream');
	}
};
