// apps/worker/src/workers/agentic-chat/provider/openrouter/validation.ts
// Construction-time route/header validation and per-request tool-surface checks.
import { DOCUMENT_READ_TOOL } from '@buildos/agentic-chat-runtime/specialists';
import { QWEN_38_27B_FREE_MODEL } from '@buildos/smart-llm';
import { type JsonValue, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import type { AgenticChatProviderPassRoleV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	isAgenticChatProductionReadToolNameV1
} from '../../tools/execution-adapter';
import {
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1,
	reviewedAgenticChatMutationSpecV1
} from '../../mutations/tool-catalog';
import type {
	AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatOpenRouterProviderRoutingV1,
	ClientInput
} from './types';
import {
	canonicalHeaderValue,
	canonicalModel,
	canonicalProviderAttempt,
	canonicalProviderPassRole,
	canonicalRoutingName,
	canonicalSecret,
	uniqueModels
} from './canonical';

const MAX_REVIEWED_PROVIDER_TOOLS =
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.length +
	AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames.length;

export function validateRoutes(
	routes: readonly AgenticChatOpenAiCompatibleRouteV1[]
): readonly AgenticChatOpenAiCompatibleRouteV1[] {
	if (!Array.isArray(routes) || routes.length < 1 || routes.length > 4) {
		throw new Error('Agentic Chat provider requires between one and four routes');
	}
	const ids = new Set<string>();
	const validated: readonly AgenticChatOpenAiCompatibleRouteV1[] = routes.map((route) => {
		if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(route.id) || ids.has(route.id)) {
			throw new Error('Agentic Chat provider route ids must be unique canonical identifiers');
		}
		ids.add(route.id);
		if (route.kind !== 'openrouter' && route.kind !== 'openai_compatible') {
			throw new Error('Agentic Chat provider route kind is invalid');
		}
		let url: URL;
		try {
			url = new URL(route.baseUrl);
		} catch {
			throw new Error('Agentic Chat provider route must use a clean HTTPS base URL');
		}
		if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
			throw new Error('Agentic Chat provider route must use a clean HTTPS base URL');
		}
		const baseUrl = route.baseUrl.replace(/\/+$/, '');
		const apiKey = canonicalSecret(route.apiKey);
		const model = canonicalModel(route.model);
		const fallbackModels = uniqueModels(route.fallbackModels ?? []).filter(
			(candidate) => candidate !== model
		);
		if (fallbackModels.length > 3) {
			throw new Error('Agentic Chat provider route supports at most three fallback models');
		}
		if (route.kind !== 'openrouter' && fallbackModels.length > 0) {
			throw new Error('Direct Agentic Chat provider routes cannot declare fallback models');
		}
		if (route.kind !== 'openrouter' && route.providerRouting) {
			throw new Error('Provider routing preferences are supported only for OpenRouter');
		}
		return Object.freeze({
			...route,
			baseUrl,
			apiKey,
			model,
			fallbackModels: Object.freeze(fallbackModels),
			providerRouting: validateProviderRouting(route.providerRouting),
			headers: validateHeaders(route.headers)
		});
	});
	if (
		validated[0]?.model === QWEN_38_27B_FREE_MODEL &&
		validated.some(
			(route) =>
				route.kind !== 'openrouter' ||
				route.model !== QWEN_38_27B_FREE_MODEL ||
				route.fallbackModels?.some((model) => model !== QWEN_38_27B_FREE_MODEL)
		)
	) {
		throw new Error('The free Qwen dev route cannot use paid or direct-provider fallbacks');
	}
	return Object.freeze(validated);
}

function validateProviderRouting(
	value: AgenticChatOpenRouterProviderRoutingV1 | undefined
): AgenticChatOpenRouterProviderRoutingV1 | undefined {
	if (!value) return undefined;
	if (value.data_collection !== undefined && value.data_collection !== 'deny') {
		throw new Error('Agentic Chat provider routing cannot allow data collection');
	}
	for (const key of ['allow_fallbacks', 'require_parameters', 'zdr'] as const) {
		if (value[key] !== undefined && typeof value[key] !== 'boolean') {
			throw new Error(`Agentic Chat provider routing ${key} must be boolean`);
		}
	}
	if (
		value.sort !== undefined &&
		value.sort !== 'price' &&
		value.sort !== 'throughput' &&
		value.sort !== 'latency'
	) {
		throw new Error('Agentic Chat provider routing sort is invalid');
	}
	const result: AgenticChatOpenRouterProviderRoutingV1 = {};
	if (value.allow_fallbacks !== undefined) result.allow_fallbacks = value.allow_fallbacks;
	if (value.require_parameters !== undefined) {
		result.require_parameters = value.require_parameters;
	}
	if (value.data_collection !== undefined) result.data_collection = value.data_collection;
	if (value.zdr !== undefined) result.zdr = value.zdr;
	if (value.sort !== undefined) result.sort = value.sort;
	for (const key of ['order', 'only', 'ignore'] as const) {
		if (value[key] === undefined) continue;
		if (!Array.isArray(value[key]) || value[key].length > 16) {
			throw new Error(`Agentic Chat provider routing ${key} is invalid`);
		}
		result[key] = Object.freeze(
			Array.from(
				new Set(
					value[key].map((entry) =>
						canonicalRoutingName(entry, `provider routing ${key}`)
					)
				)
			)
		) as string[];
	}
	return Object.freeze(result);
}

function validateHeaders(
	headers: Readonly<Record<string, string>> | undefined
): Readonly<Record<string, string>> | undefined {
	if (!headers) return undefined;
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		if (!/^[A-Za-z0-9-]{1,64}$/.test(key)) {
			throw new Error('Agentic Chat provider route header name is invalid');
		}
		if (
			[
				'authorization',
				'content-type',
				'accept',
				'http-referer',
				'x-title',
				'x-openrouter-metadata'
			].includes(key.toLowerCase())
		) {
			throw new Error('Agentic Chat provider route cannot override protected headers');
		}
		result[key] = canonicalHeaderValue(value, `route header ${key}`);
	}
	return Object.freeze(result);
}

export function validateToolSurface(input: ClientInput): void {
	if (
		input.reasoningEffort !== undefined &&
		input.reasoningEffort !== 'low' &&
		input.reasoningEffort !== 'none'
	)
		throw new Error('Invalid provider reasoning effort');
	if (
		input.maxOutputTokens !== undefined &&
		(!Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1)
	) {
		throw new Error('Provider output token ceiling must be a positive integer');
	}
	canonicalProviderAttempt(input.providerAttempt);
	canonicalProviderPassRole(input.passRole);
	if (!Array.isArray(input.tools)) {
		throw new Error('Agentic Chat provider tool surface must be an array');
	}
	if (input.workflowToolPolicy !== undefined) {
		if (
			input.workflowToolPolicy !== 'bounded_document_read_v1' ||
			!input.dispatchGate ||
			input.passRole !== 'acting' ||
			input.toolChoice !== 'auto' ||
			canonicalizeAgenticChatJson(input.tools as unknown as JsonValue) !==
				canonicalizeAgenticChatJson([DOCUMENT_READ_TOOL] as unknown as JsonValue)
		) {
			throw new Error('Invalid workflow document tool surface');
		}
		return;
	}
	if (input.toolChoice === 'none') {
		if (input.tools.length !== 0) {
			throw new Error('Agentic Chat toolChoice=none requires an empty tool surface');
		}
		return;
	}
	if (
		(input.toolChoice !== 'auto' && input.toolChoice !== 'required') ||
		input.tools.length < 1 ||
		input.tools.length > MAX_REVIEWED_PROVIDER_TOOLS
	) {
		throw new Error(
			'Agentic Chat toolChoice=auto|required requires a bounded reviewed tool surface'
		);
	}
	const seen = new Set<string>();
	for (const tool of input.tools) {
		validateReadToolDefinition(tool, seen, input.passRole);
	}
}

function validateReadToolDefinition(
	tool: AgenticChatTurnProviderToolV1 | undefined,
	seen: Set<string>,
	passRole?: AgenticChatProviderPassRoleV1
): void {
	if (
		tool?.type !== 'function' ||
		!tool.function ||
		typeof tool.function.name !== 'string' ||
		!tool.function.name ||
		tool.function.name !== tool.function.name.trim() ||
		(!isAgenticChatProductionReadToolNameV1(tool.function.name) &&
			reviewedAgenticChatMutationSpecV1(tool.function.name) === null &&
			!(passRole === 'research_review' && tool.function.name === 'review_web_search')) ||
		seen.has(tool.function.name) ||
		typeof tool.function.description !== 'string' ||
		!tool.function.description.trim() ||
		!tool.function.parameters ||
		typeof tool.function.parameters !== 'object' ||
		Array.isArray(tool.function.parameters) ||
		tool.function.parameters.type !== 'object'
	) {
		throw new Error('Agentic Chat read tool definition is invalid');
	}
	try {
		canonicalizeAgenticChatJson(tool as unknown as JsonValue);
	} catch {
		throw new Error('Agentic Chat read tool definition is invalid');
	}
	seen.add(tool.function.name);
}
