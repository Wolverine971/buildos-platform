const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;
const MAX_IMAGE_URL_LENGTH = 4_096;
const MAX_MODEL_LENGTH = 120;
const MAX_OUTPUT_TOKENS = 4_096;
const MAX_OUTPUT_CHARS = 100_000;
const MAX_SUMMARY_CHARS = 1_000;
const MAX_LANGUAGE_CHARS = 64;
const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429]);

export type LibriOcrProviderRequest = {
	imageUrl: string;
	mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
	model: string;
	maxOutputTokens: number;
	maxOutputChars: number;
	signal: AbortSignal;
};

export type LibriOcrProviderResult = {
	extractedText: string;
	summary: string;
	confidence?: number;
	language?: string;
	provider: 'openrouter';
	model: string;
	promptTokens: number;
	completionTokens: number;
	estimatedCostMicrousd: number | null;
};

export type LibriOcrProviderPort = {
	execute(request: LibriOcrProviderRequest): Promise<LibriOcrProviderResult>;
};

export type OpenRouterLibriOcrProviderOptions = {
	apiKey: string;
	allowedModels: readonly string[];
	fetchImpl?: typeof fetch;
	httpReferer?: string;
	appName?: string;
};

export class LibriOcrProviderError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly retryable: boolean,
		readonly httpStatus?: number
	) {
		super(message);
		this.name = 'LibriOcrProviderError';
	}
}

export function createOpenRouterLibriOcrProvider(
	options: OpenRouterLibriOcrProviderOptions
): LibriOcrProviderPort {
	const apiKey = options.apiKey.trim();
	if (!apiKey || apiKey.length > 512) {
		throw new Error('Libri OCR OpenRouter API key must contain 1 to 512 characters');
	}
	const allowedModels = normalizeAllowedModels(options.allowedModels);
	const fetchImpl = options.fetchImpl ?? fetch;
	const httpReferer = normalizeOptionalHeader(options.httpReferer, 'httpReferer');
	const appName = normalizeOptionalHeader(options.appName, 'appName');

	return {
		async execute(request) {
			validateRequest(request, allowedModels);
			let response: Response;
			try {
				response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json',
						...(httpReferer ? { 'HTTP-Referer': httpReferer } : {}),
						...(appName ? { 'X-Title': appName } : {})
					},
					body: JSON.stringify(buildRequestBody(request)),
					signal: request.signal
				});
			} catch {
				if (request.signal.aborted) {
					throw new LibriOcrProviderError(
						'provider_aborted',
						'Libri OCR provider request was aborted',
						true
					);
				}
				throw new LibriOcrProviderError(
					'provider_network_error',
					'Libri OCR provider request failed before a response',
					true
				);
			}

			if (!response.ok) {
				throw new LibriOcrProviderError(
					`provider_http_${response.status}`,
					`Libri OCR provider returned HTTP ${response.status}`,
					isTransientHttpStatus(response.status),
					response.status
				);
			}
			const payload = await readResponseJson(response);
			return parseProviderResponse(payload, request);
		}
	};
}

function normalizeAllowedModels(models: readonly string[]): Set<string> {
	if (models.length < 1 || models.length > 10) {
		throw new Error('Libri OCR allowedModels must contain 1 to 10 models');
	}
	const normalized = models.map((model) => model.trim());
	if (new Set(normalized).size !== normalized.length) {
		throw new Error('Libri OCR allowedModels must be unique');
	}
	for (const model of normalized) assertModel(model);
	return new Set(normalized);
}

function normalizeOptionalHeader(value: string | undefined, name: string): string | undefined {
	if (value === undefined || value.trim() === '') return undefined;
	const normalized = value.trim();
	if (normalized.length > 200 || /[\r\n]/.test(normalized)) {
		throw new Error(`Libri OCR ${name} must be one header-safe value`);
	}
	return normalized;
}

function validateRequest(request: LibriOcrProviderRequest, allowedModels: Set<string>): void {
	if (request.signal.aborted) {
		throw new LibriOcrProviderError(
			'provider_aborted',
			'Libri OCR provider request was aborted',
			true
		);
	}
	if (!ALLOWED_IMAGE_MIME_TYPES.has(request.mimeType)) {
		throw new Error('Libri OCR image MIME type is not allowed');
	}
	assertHttpsUrl(request.imageUrl);
	assertModel(request.model);
	if (!allowedModels.has(request.model)) {
		throw new Error('Libri OCR model is not in the configured allowlist');
	}
	assertBoundedInteger(request.maxOutputTokens, 1, MAX_OUTPUT_TOKENS, 'maxOutputTokens');
	assertBoundedInteger(request.maxOutputChars, 1, MAX_OUTPUT_CHARS, 'maxOutputChars');
}

function assertHttpsUrl(value: string): void {
	if (!value || value.length > MAX_IMAGE_URL_LENGTH) {
		throw new Error('Libri OCR image URL must contain 1 to 4096 characters');
	}
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error('Libri OCR image URL must be valid');
	}
	if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
		throw new Error('Libri OCR image URL must be credential-free HTTPS');
	}
}

function assertModel(model: string): void {
	if (!model || model.length > MAX_MODEL_LENGTH || !MODEL_PATTERN.test(model)) {
		throw new Error('Libri OCR model must be a provider-qualified model identifier');
	}
}

function assertBoundedInteger(value: number, minimum: number, maximum: number, name: string): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`Libri OCR ${name} must be an integer between ${minimum} and ${maximum}`);
	}
}

function buildRequestBody(request: LibriOcrProviderRequest): Record<string, unknown> {
	return {
		model: request.model,
		temperature: 0,
		max_tokens: request.maxOutputTokens,
		response_format: { type: 'json_object' },
		messages: [
			{
				role: 'system',
				content:
					'Return one JSON object with exactly extracted_text, summary, confidence, and language. Preserve readable text faithfully. Do not add markdown.'
			},
			{
				role: 'user',
				content: [
					{
						type: 'text',
						text: `Extract all readable text from this ${request.mimeType} book image. Summarize the image in one sentence.`
					},
					{ type: 'image_url', image_url: { url: request.imageUrl } }
				]
			}
		]
	};
}

async function readResponseJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new LibriOcrProviderError(
			'provider_response_invalid',
			'Libri OCR provider returned invalid JSON',
			true,
			response.status
		);
	}
}

function parseProviderResponse(
	payload: unknown,
	request: LibriOcrProviderRequest
): LibriOcrProviderResult {
	const root = readObject(payload, 'provider response');
	const choices = root.choices;
	if (!Array.isArray(choices) || choices.length !== 1) {
		throw invalidProviderResponse('Libri OCR provider must return exactly one choice');
	}
	const choice = readObject(choices[0], 'provider choice');
	const message = readObject(choice.message, 'provider message');
	if (typeof message.content !== 'string' || !message.content.trim()) {
		throw invalidProviderResponse('Libri OCR provider returned empty content');
	}

	let parsedContent: unknown;
	try {
		parsedContent = JSON.parse(message.content);
	} catch {
		throw invalidProviderResponse('Libri OCR provider content was not JSON');
	}
	const output = readObject(parsedContent, 'OCR output');
	const unexpectedKeys = Object.keys(output).filter(
		(key) => !['extracted_text', 'summary', 'confidence', 'language'].includes(key)
	);
	if (unexpectedKeys.length > 0) {
		throw invalidProviderResponse('Libri OCR provider output contained unsupported fields');
	}

	const extractedText = readBoundedText(
		output.extracted_text,
		request.maxOutputChars,
		'extracted_text'
	);
	const summary = readBoundedText(output.summary, MAX_SUMMARY_CHARS, 'summary');
	const confidence = readOptionalConfidence(output.confidence);
	const language = readOptionalText(output.language, MAX_LANGUAGE_CHARS, 'language');
	const usage = readObject(root.usage, 'provider usage');
	const promptTokens = readNonnegativeInteger(usage.prompt_tokens, 'prompt_tokens');
	const completionTokens = readNonnegativeInteger(usage.completion_tokens, 'completion_tokens');
	const estimatedCostMicrousd = readOptionalCostMicrousd(usage.cost);
	const responseModel = readBoundedText(root.model, MAX_MODEL_LENGTH, 'model');
	if (responseModel !== request.model) {
		throw invalidProviderResponse('Libri OCR provider returned an unexpected model');
	}

	return {
		extractedText,
		summary,
		...(confidence === undefined ? {} : { confidence }),
		...(language === undefined ? {} : { language }),
		provider: 'openrouter',
		model: responseModel,
		promptTokens,
		completionTokens,
		estimatedCostMicrousd
	};
}

function readObject(value: unknown, name: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalidProviderResponse(`Libri OCR ${name} must be an object`);
	}
	return value as Record<string, unknown>;
}

function readBoundedText(value: unknown, maximum: number, name: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw invalidProviderResponse(`Libri OCR ${name} must be nonempty text`);
	}
	const normalized = value.trim();
	if (normalized.length > maximum) {
		throw invalidProviderResponse(`Libri OCR ${name} exceeded its maximum length`);
	}
	return normalized;
}

function readOptionalText(value: unknown, maximum: number, name: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	return readBoundedText(value, maximum, name);
}

function readOptionalConfidence(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
		throw invalidProviderResponse('Libri OCR confidence must be between 0 and 1');
	}
	return value;
}

function readNonnegativeInteger(value: unknown, name: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw invalidProviderResponse(`Libri OCR ${name} must be a nonnegative integer`);
	}
	return value as number;
}

function readOptionalCostMicrousd(value: unknown): number | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw invalidProviderResponse('Libri OCR provider cost must be a nonnegative number');
	}
	const microusd = Math.ceil(value * 1_000_000);
	if (!Number.isSafeInteger(microusd)) {
		throw invalidProviderResponse('Libri OCR provider cost exceeded the supported range');
	}
	return microusd;
}

function invalidProviderResponse(message: string): LibriOcrProviderError {
	return new LibriOcrProviderError('provider_response_invalid', message, true);
}

function isTransientHttpStatus(status: number): boolean {
	return TRANSIENT_HTTP_STATUSES.has(status) || status >= 500;
}
