// apps/worker/tests/helpers/providerCapture.ts
//
// Paid-harness diagnostics only. Wraps the provider client's `fetch` and tees every
// OpenRouter SSE response, so a live run keeps what the workflow tables do not: the
// visible text of rejected attempts, finish reasons, hidden-reasoning tokens, the
// serving provider, and where each call's time went. Prompt dumps are disabled under
// Vitest (promptDump.ts), so live harnesses capture here instead.

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
		const [forClient, forCapture] = response.body.tee();
		const work = readSse(forCapture, call).finally(() => pending.delete(work));
		pending.add(work);
		return new Response(forClient, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}) as typeof fetch;

	return {
		fetchImpl,
		calls,
		/** Resolves once every teed stream has ended or failed. */
		settled: () => Promise.allSettled([...pending]).then(() => undefined),
		/** Calls started since `mark` (a previous `calls.length`). */
		since: (mark: number) => calls.slice(mark)
	};
}

async function readSse(stream: ReadableStream<Uint8Array>, call: CapturedProviderCallV1) {
	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
			buffer += decoder.decode(chunk, { stream: true });
			let newline: number;
			while ((newline = buffer.indexOf('\n')) >= 0) {
				const line = buffer.slice(0, newline).trim();
				buffer = buffer.slice(newline + 1);
				if (!line.startsWith('data:')) continue;
				const data = line.slice(5).trim();
				if (!data || data === '[DONE]') continue;
				const frame = safeJson(data) as Record<string, any> | null;
				if (!frame) continue;
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
						reasoningTokens: numberOrNull(
							u.completion_tokens_details?.reasoning_tokens
						),
						cachedPromptTokens: numberOrNull(u.prompt_tokens_details?.cached_tokens),
						costUsd: numberOrNull(u.cost)
					};
				}
			}
		}
	} catch (error) {
		call.error ??= errorText(error);
	} finally {
		call.endedAtMs = Date.now();
	}
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
