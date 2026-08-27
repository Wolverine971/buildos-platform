// apps/worker/src/workers/agentic-chat/provider/stream-tool-calls.ts
import { createHash } from 'node:crypto';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import {
	type AgenticChatControlDecisionAuthorV1,
	type AgenticChatProviderExecutionDiagnosticV1,
	AgenticChatProviderExecutionError,
	type AgenticChatProviderToolSchedulingV1,
	type AgenticChatTurnProviderRequestV1,
	type AgenticChatTurnProviderToolV1
} from './contracts';
import { canonicalRequiredText, providerError, requireRecord } from './protocol';

const MAX_PROVIDER_TOOL_CALLS_PER_ROUND = 40;

export type CompletedProviderToolCall = {
	id: string;
	name: string;
	arguments: JsonObject;
	/** Canonical domain-only arguments used by validation, review, and adapters. */
	canonicalArguments: string;
	/** Exact canonical provider arguments, including worker scheduling sidecars. */
	canonicalProviderArguments: string;
	scheduling?: AgenticChatProviderToolSchedulingV1;
	decidedBy?: AgenticChatControlDecisionAuthorV1;
};

type ProviderToolCallAccumulator = {
	seen: boolean;
	id: string;
	name: string;
	argumentsText: string;
};

export function createToolCallAccumulator(): Map<number, ProviderToolCallAccumulator> {
	return new Map();
}

export function appendToolCallDelta(
	state: ReturnType<typeof createToolCallAccumulator>,
	value: unknown
): void {
	if (!Array.isArray(value) || value.length === 0) {
		throw providerError('provider_tool_call_delta_invalid', 'permanent');
	}
	for (let position = 0; position < value.length; position += 1) {
		const delta = requireRecord(value[position], 'provider tool-call delta');
		const index = delta.index ?? (value.length === 1 ? 0 : position);
		if (
			!Number.isSafeInteger(index) ||
			(index as number) < 0 ||
			(index as number) >= MAX_PROVIDER_TOOL_CALLS_PER_ROUND
		) {
			throw providerError('provider_tool_call_count_exceeded', 'permanent');
		}
		const callIndex = index as number;
		const call = state.get(callIndex) ?? {
			seen: false,
			id: '',
			name: '',
			argumentsText: ''
		};
		call.seen = true;
		if (delta.id !== undefined) {
			const id = canonicalRequiredText(delta.id, 'provider tool-call id');
			if (id.length > 512 || (call.id && call.id !== id)) {
				throw providerError('provider_tool_call_id_invalid', 'permanent');
			}
			call.id = id;
		}
		if (delta.type !== undefined && delta.type !== 'function') {
			throw providerError('provider_tool_call_type_invalid', 'permanent');
		}
		if (delta.function !== undefined) {
			const fn = requireRecord(delta.function, 'provider tool-call function');
			if (fn.name !== undefined) {
				if (typeof fn.name !== 'string' || fn.name.length === 0) {
					throw providerError('provider_tool_name_invalid', 'permanent');
				}
				call.name += fn.name;
				if (call.name.length > 256) {
					throw providerError('provider_tool_name_invalid', 'permanent');
				}
			}
			if (fn.arguments !== undefined) {
				if (typeof fn.arguments !== 'string') {
					throw rejectedToolArgumentsError(call, 'delta_type', null);
				}
				call.argumentsText += fn.arguments;
				if (Buffer.byteLength(call.argumentsText, 'utf8') > 64 * 1024) {
					throw providerError('provider_tool_arguments_too_large', 'permanent');
				}
			}
		}
		state.set(callIndex, call);
	}
}

type ToolCallCompletionContext = {
	finishedReason?: string | null;
	completionBudgetExhausted?: boolean;
};

function toolArgumentParseCategory(error: unknown): {
	category: 'unexpected_end' | 'unterminated' | 'unexpected_token' | 'other';
	offset: number | null;
} {
	const message = error instanceof Error ? error.message : '';
	const offsetMatch = /position (\d+)/i.exec(message);
	const parsedOffset = offsetMatch ? Number.parseInt(offsetMatch[1]!, 10) : null;
	const category = /unexpected end of (json|data)/i.test(message)
		? 'unexpected_end'
		: /unterminated/i.test(message)
			? 'unterminated'
			: /unexpected (non-whitespace )?token/i.test(message)
				? 'unexpected_token'
				: 'other';
	return {
		category,
		offset: parsedOffset !== null && Number.isSafeInteger(parsedOffset) ? parsedOffset : null
	};
}

function rejectedToolArgumentsError(
	call: Pick<ProviderToolCallAccumulator, 'name' | 'argumentsText'>,
	stage: 'delta_type' | 'json_parse' | 'json_shape',
	error: unknown,
	context: ToolCallCompletionContext = {}
): AgenticChatProviderExecutionError {
	const { category, offset } =
		stage === 'json_parse'
			? toolArgumentParseCategory(error)
			: { category: null, offset: null };
	const argumentBytes = Buffer.byteLength(call.argumentsText, 'utf8');
	const finishedReason = context.finishedReason ?? null;
	const failedAtEndOfInput =
		category === 'unexpected_end' ||
		category === 'unterminated' ||
		(offset !== null && argumentBytes > 0 && offset >= argumentBytes - 1);
	const truncated =
		context.completionBudgetExhausted === true ||
		finishedReason === 'length' ||
		(stage === 'json_parse' && failedAtEndOfInput);
	return providerError(
		truncated ? 'provider_tool_arguments_truncated' : 'provider_tool_arguments_invalid',
		'permanent',
		{
			kind: 'rejected_tool_arguments',
			toolName: /^[A-Za-z0-9_.:-]{1,256}$/.test(call.name) ? call.name : null,
			stage,
			argumentBytes,
			argumentSha256: createHash('sha256').update(call.argumentsText, 'utf8').digest('hex'),
			parseErrorOffset: offset,
			parseErrorCategory: category,
			finishedReason,
			completionBudgetExhausted: context.completionBudgetExhausted === true
		}
	);
}

export function assertToolCallFinishReason(
	state: ReturnType<typeof createToolCallAccumulator>,
	finishedReason: string,
	toolChoice: AgenticChatTurnProviderRequestV1['toolChoice'],
	disabledWhen: 'auto' | 'none'
): void {
	if (state.size === 0) return;
	if (disabledWhen === 'auto' ? toolChoice !== 'auto' : toolChoice === 'none') {
		throw providerError('provider_tool_call_disabled', 'permanent');
	}
	if (finishedReason !== 'tool_calls' && finishedReason !== 'function_call') {
		throw providerError('provider_tool_finish_reason_invalid', 'unknown');
	}
}

export function completeReviewerToolCalls(
	state: ReturnType<typeof createToolCallAccumulator>,
	advertisedTools: readonly AgenticChatTurnProviderToolV1[],
	context: ToolCallCompletionContext
): { calls: CompletedProviderToolCall[]; rejectionCode: string | null } {
	try {
		return { calls: completeToolCalls(state, advertisedTools, context), rejectionCode: null };
	} catch (error) {
		if (error instanceof AgenticChatProviderExecutionError) {
			return { calls: [], rejectionCode: error.code };
		}
		throw error;
	}
}

export function completeToolCalls(
	state: ReturnType<typeof createToolCallAccumulator>,
	advertisedTools: readonly AgenticChatTurnProviderToolV1[],
	context: ToolCallCompletionContext = {}
): CompletedProviderToolCall[] {
	if (state.size === 0) return [];
	const calls: CompletedProviderToolCall[] = [];
	const seenIds = new Set<string>();
	const entries = [...state.entries()].sort(([left], [right]) => left - right);
	for (let position = 0; position < entries.length; position += 1) {
		const [index, call] = entries[position]!;
		if (
			index !== position ||
			!call.seen ||
			!call.id ||
			!call.name ||
			call.name !== call.name.trim()
		) {
			throw providerError('provider_tool_call_incomplete', 'permanent');
		}
		if (seenIds.has(call.id)) {
			throw providerError('provider_tool_call_id_invalid', 'permanent');
		}
		seenIds.add(call.id);
		let parsed: unknown;
		try {
			parsed = JSON.parse(call.argumentsText || '{}');
		} catch (error) {
			throw rejectedToolArgumentsError(call, 'json_parse', error, context);
		}
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw rejectedToolArgumentsError(call, 'json_shape', null, context);
		}
		const canonicalProviderArguments = canonicalizeAgenticChatJson(parsed as JsonValue);
		const scheduling = parseSchedulingMetadata(parsed as JsonObject);
		const domainArguments = Object.fromEntries(
			Object.entries(parsed as JsonObject).filter(
				([name]) => name !== 'call_ref' && name !== 'after'
			)
		) as JsonObject;
		const canonicalArguments = canonicalizeAgenticChatJson(domainArguments);
		calls.push({
			id: call.id,
			name: normalizeRepeatedAdvertisedToolName(call.name, advertisedTools),
			arguments: JSON.parse(canonicalArguments) as JsonObject,
			canonicalArguments,
			canonicalProviderArguments,
			...(scheduling ? { scheduling } : {})
		});
	}
	return calls;
}

function parseSchedulingMetadata(
	arguments_: JsonObject
): AgenticChatProviderToolSchedulingV1 | undefined {
	const rawCallRef = arguments_.call_ref;
	const rawAfter = arguments_.after;
	if (rawCallRef === undefined && rawAfter === undefined) return undefined;
	if (
		rawCallRef !== undefined &&
		(typeof rawCallRef !== 'string' ||
			rawCallRef.length === 0 ||
			rawCallRef.length > 128 ||
			rawCallRef !== rawCallRef.trim())
	) {
		throw providerError('provider_tool_scheduling_invalid', 'permanent');
	}
	if (
		rawAfter !== undefined &&
		(!Array.isArray(rawAfter) ||
			rawAfter.length > MAX_PROVIDER_TOOL_CALLS_PER_ROUND ||
			rawAfter.some(
				(value) =>
					typeof value !== 'string' ||
					value.length === 0 ||
					value.length > 128 ||
					value !== value.trim()
			))
	) {
		throw providerError('provider_tool_scheduling_invalid', 'permanent');
	}
	const after = (rawAfter ?? []) as string[];
	if (new Set(after).size !== after.length) {
		throw providerError('provider_tool_scheduling_invalid', 'permanent');
	}
	return {
		callRef: typeof rawCallRef === 'string' ? rawCallRef : null,
		after
	};
}

function normalizeRepeatedAdvertisedToolName(
	assembledName: string,
	advertisedTools: readonly AgenticChatTurnProviderToolV1[]
): string {
	if (advertisedTools.some((tool) => tool.function.name === assembledName)) {
		return assembledName;
	}
	for (const tool of advertisedTools) {
		const advertisedName = tool.function.name;
		if (
			advertisedName.length > 0 &&
			assembledName.length > advertisedName.length &&
			assembledName.length % advertisedName.length === 0 &&
			advertisedName.repeat(assembledName.length / advertisedName.length) === assembledName
		) {
			return advertisedName;
		}
	}
	return assembledName;
}

export function assertAllowlistedCall(
	call: CompletedProviderToolCall,
	tools: readonly AgenticChatTurnProviderToolV1[]
): void {
	if (!tools.some((tool) => tool.function.name === call.name)) {
		throw providerToolNotAllowlistedError(call.name, tools);
	}
}

export function providerToolNotAllowlistedError(
	rejectedToolName: string,
	tools: readonly AgenticChatTurnProviderToolV1[]
): AgenticChatProviderExecutionError {
	const repeated = tools
		.map((tool) => tool.function.name)
		.map((advertisedToolName) => {
			if (
				advertisedToolName.length === 0 ||
				rejectedToolName.length <= advertisedToolName.length ||
				rejectedToolName.length % advertisedToolName.length !== 0
			) {
				return null;
			}
			const count = rejectedToolName.length / advertisedToolName.length;
			return advertisedToolName.repeat(count) === rejectedToolName
				? { advertisedToolName, count }
				: null;
		})
		.find((value): value is { advertisedToolName: string; count: number } => value !== null);
	const diagnostic: AgenticChatProviderExecutionDiagnosticV1 = {
		kind: 'rejected_tool_name',
		rejectedToolName: /^[A-Za-z0-9_.:-]{1,256}$/.test(rejectedToolName)
			? rejectedToolName
			: null,
		rejectedToolNameLength: rejectedToolName.length,
		advertisedToolCount: tools.length,
		repeatedAdvertisedToolName: repeated?.advertisedToolName ?? null,
		repeatedToolNameCount: repeated?.count ?? null
	};
	return providerError('provider_tool_not_allowlisted', 'permanent', diagnostic);
}
