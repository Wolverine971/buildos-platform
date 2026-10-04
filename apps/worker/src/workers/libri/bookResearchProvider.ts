import { OPENROUTER_PRIVATE_PROVIDER } from '@buildos/smart-llm';
import type { BookResearchUsage } from './bookResearchTransaction';
export function createBookResearchProvider<Input extends { dataset: unknown }, Result>(options: {
	apiKey: string;
	allowedModels: readonly string[];
	fetchImpl?: typeof fetch;
	system: string;
	maxTokens: number;
	validate(value: unknown, input: Input): Result;
}): {
	execute(
		input: Input,
		model: string,
		signal: AbortSignal
	): Promise<BookResearchUsage & { output: Result }>;
} {
	if (!options.apiKey.trim() || options.apiKey.length > 512 || /[\r\n]/.test(options.apiKey))
		throw new Error('Invalid book research provider credential');
	if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1 || options.maxTokens > 8000)
		throw new Error('Invalid book research output limit');
	const models = new Set(options.allowedModels);
	if (
		!models.size ||
		models.size > 10 ||
		[...models].some((m) => !/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(m))
	)
		throw new Error('Invalid book research model allowlist');
	return {
		async execute(input, model, signal) {
			if (!models.has(model)) throw new Error('Book research model is not allowed');
			const dataset = JSON.stringify(input.dataset);
			if (Buffer.byteLength(dataset) > 200000)
				throw new Error('Book research dataset exceeds context limit');
			signal.throwIfAborted();
			const response = await (options.fetchImpl ?? fetch)(
				'https://openrouter.ai/api/v1/chat/completions',
				{
					method: 'POST',
					redirect: 'error',
					signal,
					headers: {
						Authorization: `Bearer ${options.apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						model,
						max_tokens: options.maxTokens,
						stream: false,
						response_format: { type: 'json_object' },
						provider: {
							...OPENROUTER_PRIVATE_PROVIDER,
							allow_fallbacks: false,
							require_parameters: true
						},
						messages: [
							{ role: 'system', content: options.system },
							{
								role: 'user',
								content: `Use the following book dataset:\n${dataset}`
							}
						]
					})
				}
			);
			if (!response.ok)
				throw new Error(`Book research provider returned HTTP ${response.status}`);
			if (!response.body) throw new Error('Book research response is missing');
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let bytes = 0;
			try {
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) break;
					bytes += chunk.value.byteLength;
					if (bytes > 512000) throw new Error('Book research response exceeds limit');
					chunks.push(chunk.value);
				}
			} finally {
				await reader.cancel().catch(() => undefined);
				reader.releaseLock();
			}
			const root = object(JSON.parse(Buffer.concat(chunks).toString('utf8')));
			if (root.model !== model) throw new Error('Book research response model mismatch');
			const choices = array(root.choices, 1);
			if (choices.length !== 1) throw new Error('Book research requires one result');
			const choice = object(choices[0]);
			if (choice.finish_reason !== 'stop')
				throw new Error('Book research result is incomplete');
			const content = text(object(choice.message).content, 100000);
			const usage = object(root.usage);
			if (
				typeof usage.cost !== 'number' ||
				!Number.isFinite(usage.cost) ||
				usage.cost < 0 ||
				!Number.isSafeInteger(Math.ceil(usage.cost * 1000000))
			)
				throw new Error('Book research cost is unknown');
			return {
				output: options.validate(JSON.parse(content), input),
				model,
				providerRequestId: text(root.id, 256),
				costMicrousd: BigInt(Math.ceil(usage.cost * 1000000)),
				promptTokens: BigInt(integer(usage.prompt_tokens)),
				completionTokens: BigInt(integer(usage.completion_tokens))
			};
		}
	};
}

function object(v: unknown): Record<string, unknown> {
	if (!v || typeof v !== 'object' || Array.isArray(v))
		throw new Error('Expected synthesis object');
	return v as Record<string, unknown>;
}
function array(v: unknown, max: number): unknown[] {
	if (!Array.isArray(v) || v.length > max) throw new Error('Invalid synthesis array');
	return v;
}
function text(v: unknown, max: number, empty = false): string {
	if (typeof v !== 'string' || v.trim().length > max || (!empty && !v.trim()))
		throw new Error('Invalid synthesis text');
	return v.trim();
}
function integer(v: unknown): number {
	if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0)
		throw new Error('Invalid synthesis integer');
	return v;
}
