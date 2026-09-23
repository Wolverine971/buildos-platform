// apps/worker/tests/helpers/providerCapture.ts
//
// Paid-harness diagnostics only. Wraps the provider client's `fetch` and observes every
// OpenRouter response as it passes through, so a live run keeps what the workflow tables
// do not: the visible text of rejected attempts, finish reasons, hidden-reasoning tokens,
// the serving provider and model, error bodies, and where each call's time went. Prompt
// dumps are disabled under Vitest (promptDump.ts), so live harnesses capture here instead.

export type CapturedProviderCallV1 = {
	index: number;
	/** Serialized request bytes; equals the dispatch row's `serialized_request_bytes`. */
	requestBytes: number;
	request: {
		model: unknown;
		models: unknown;
		maxTokens: unknown;
		reasoning: unknown;
		provider: unknown;
		toolChoice: unknown;
		tools: string[];
		messages: { role: string; chars: number }[];
		/** First line of the system message's ROLE header, written by the runner. */
		role: string | null;
	};
	body: unknown;
	startedAtMs: number;
	headersAtMs: number | null;
	firstDataAtMs: number | null;
	firstOutputAtMs: number | null;
	endedAtMs: number | null;
	httpStatus: number | null;
	provider: string | null;
	modelUsed: string | null;
	finishReason: string | null;
	nativeFinishReason: string | null;
	text: string;
	toolCalls: string;
	usage: {
		promptTokens: number | null;
		completionTokens: number | null;
		reasoningTokens: number | null;
		cachedPromptTokens: number | null;
		costUsd: number | null;
	};
	error: string | null;
};

export function createProviderCapture(base: typeof fetch = globalThis.fetch) {
	const calls: CapturedProviderCallV1[] = [];
	const pending = new Set<Promise<void>>();

	const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
		const bodyText = typeof init?.body === 'string' ? init.body : '';
		const parsed = safeJson(bodyText) as Record<string, any> | null;
		const messages: { role: string; content: unknown }[] = Array.isArray(parsed?.messages)
			? parsed!.messages
			: [];
		const system = messages.find((m) => m.role === 'system');
		const call: CapturedProviderCallV1 = {
			index: calls.length,
			requestBytes: Buffer.byteLength(bodyText, 'utf8'),
			request: {
				model: parsed?.model ?? null,
				models: parsed?.models ?? null,
				maxTokens: parsed?.max_tokens ?? null,
				reasoning: parsed?.reasoning ?? null,
				provider: parsed?.provider ?? null,
				toolChoice: parsed?.tool_choice ?? null,
				tools: Array.isArray(parsed?.tools)
					? parsed!.tools.map((t: any) => String(t?.function?.name ?? '?'))
					: [],
				messages: messages.map((m) => ({
					role: m.role,
					chars:
						typeof m.content === 'string'
							? m.content.length
							: JSON.stringify(m.content ?? '').length
				})),
				role: roleHeader(system?.content)
			},
			body: parsed,
			startedAtMs: Date.now(),
			headersAtMs: null,
			firstDataAtMs: null,
			firstOutputAtMs: null,
			endedAtMs: null,
			httpStatus: null,
			provider: null,
			modelUsed: null,
			finishReason: null,
			nativeFinishReason: null,
			text: '',
			toolCalls: '',
			usage: {
				promptTokens: null,
				completionTokens: null,
				reasoningTokens: null,
				cachedPromptTokens: null,
				costUsd: null
			},
			error: null
		};
		calls.push(call);
		let response: Response;
		try {
			response = await base(url, init);
		} catch (error) {
			call.error = errorText(error);
			call.endedAtMs = Date.now();
			throw error;
		}
		call.headersAtMs = Date.now();
		call.httpStatus = response.status;
		call.provider = response.headers.get('x-openrouter-provider');
		if (!response.body) {
			call.endedAtMs = Date.now();
			return response;
		}
		const sse =
			response.ok &&
			(response.headers.get('content-type') ?? '')
				.toLowerCase()
				.includes('text/event-stream');
		const observer = createObserver(call, sse);
		const reader = response.body.getReader();
		let finish!: () => void;
		const done = new Promise<void>((resolve) => (finish = resolve));
		pending.add(done);
		void done.then(() => pending.delete(done));
		const end = (error?: string) => {
			if (call.endedAtMs !== null) return;
			if (error) call.error ??= error;
			observer.flush();
			call.endedAtMs = Date.now();
			finish();
		};
		// A pass-through, not a tee: when the client cancels its stream, the provider stream
		// is cancelled too. A teed capture branch would keep an abandoned attempt generating
		// (and billing) until the provider finished.
		const passthrough = new ReadableStream<Uint8Array>({
			async pull(controller) {
				try {
					const { done: finished, value } = await reader.read();
					if (finished) {
						end();
						controller.close();
						return;
					}
					observer.chunk(value);
					controller.enqueue(value);
				} catch (error) {
					end(errorText(error));
					controller.error(error);
				}
			},
			async cancel(reason) {
				// The client cancels after `[DONE]` without reading end-of-stream; a stream that
				// already finished is a completion, not an abandoned attempt.
				end(
					call.finishReason !== null
						? undefined
						: `client_cancelled${reason === undefined ? '' : `: ${errorText(reason)}`}`
				);
				await reader.cancel(reason).catch(() => undefined);
			}
		});
		return new Response(passthrough, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}) as typeof fetch;

	return {
		fetchImpl,
		calls,
		/** Resolves once every stream has ended, failed or been cancelled, or after the bound. */
		settled: (timeoutMs = 30_000) => {
			let timer: NodeJS.Timeout | undefined;
			return Promise.race([
				Promise.allSettled([...pending]).then(() => undefined),
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, timeoutMs);
				})
			]).finally(() => clearTimeout(timer));
		},
		/** Calls started since `mark` (a previous `calls.length`). */
		since: (mark: number) => calls.slice(mark)
	};
}

/** Parses SSE frames as they pass; a non-SSE or error body keeps its first 2 KB instead. */
function createObserver(call: CapturedProviderCallV1, sse: boolean) {
	const decoder = new TextDecoder();
	let buffer = '';
	let raw = '';
	const line = (text: string) => {
		if (!text.startsWith('data:')) return;
		const data = text.slice(5).trim();
		if (!data || data === '[DONE]') return;
		const frame = safeJson(data) as Record<string, any> | null;
		if (!frame) return;
		call.firstDataAtMs ??= Date.now();
		if (frame.error) call.error = JSON.stringify(frame.error).slice(0, 2_000);
		call.provider ??= typeof frame.provider === 'string' ? frame.provider : null;
		call.modelUsed ??= typeof frame.model === 'string' ? frame.model : null;
		const choice = frame.choices?.[0];
		const delta = choice?.delta ?? {};
		if (typeof delta.content === 'string' && delta.content) {
			call.firstOutputAtMs ??= Date.now();
			call.text += delta.content;
		}
		if (Array.isArray(delta.tool_calls) && delta.tool_calls.length) {
			call.firstOutputAtMs ??= Date.now();
			call.toolCalls += JSON.stringify(delta.tool_calls);
		}
		if (choice?.finish_reason) call.finishReason = String(choice.finish_reason);
		if (choice?.native_finish_reason)
			call.nativeFinishReason = String(choice.native_finish_reason);
		if (frame.usage) {
			const u = frame.usage;
			call.usage = {
				promptTokens: numberOrNull(u.prompt_tokens),
				completionTokens: numberOrNull(u.completion_tokens),
				reasoningTokens: numberOrNull(u.completion_tokens_details?.reasoning_tokens),
				cachedPromptTokens: numberOrNull(u.prompt_tokens_details?.cached_tokens),
				costUsd: numberOrNull(u.cost)
			};
		}
	};
	return {
		chunk(bytes: Uint8Array) {
			const text = decoder.decode(bytes, { stream: true });
			if (!sse) {
				if (raw.length < 2_000) raw += text;
				return;
			}
			buffer += text;
			let newline: number;
			while ((newline = buffer.indexOf('\n')) >= 0) {
				line(buffer.slice(0, newline).trim());
				buffer = buffer.slice(newline + 1);
			}
		},
		flush() {
			if (sse) line(buffer.trim());
			else call.error ??= `http_${call.httpStatus}: ${raw.slice(0, 2_000)}`;
		}
	};
}

/** Timing summary: where one provider call's wall clock went. */
export function providerCallTiming(call: CapturedProviderCallV1) {
	const at = (value: number | null) => (value === null ? null : value - call.startedAtMs);
	const total = at(call.endedAtMs);
	const firstOutput = at(call.firstOutputAtMs);
	const outputMs =
		call.endedAtMs !== null && call.firstOutputAtMs !== null
			? call.endedAtMs - call.firstOutputAtMs
			: null;
	const completion = call.usage.completionTokens;
	const reasoning = call.usage.reasoningTokens ?? 0;
	return {
		headersMs: at(call.headersAtMs),
		firstDataMs: at(call.firstDataAtMs),
		/** Hidden reasoning happens before the first visible token. */
		firstOutputMs: firstOutput,
		outputMs,
		totalMs: total,
		completionTokens: completion,
		reasoningTokens: call.usage.reasoningTokens,
		visibleTokens: completion === null ? null : completion - reasoning,
		tokensPerSecond:
			completion !== null && total ? Math.round((completion * 1_000) / total) : null
	};
}

function roleHeader(content: unknown): string | null {
	if (typeof content !== 'string') return null;
	// The runner writes `\n\nROLE: <name>\n<task>`; this reads that fixed header only.
	const marker = content.lastIndexOf('\nROLE: ');
	if (marker < 0) return null;
	return content
		.slice(marker + 7)
		.split('\n', 1)[0]!
		.slice(0, 80);
}

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function errorText(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
}
