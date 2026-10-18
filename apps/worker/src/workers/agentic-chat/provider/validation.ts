// apps/worker/src/workers/agentic-chat/provider/validation.ts
import { createHash } from 'node:crypto';
import type { ChatToolDefinition, JsonValue } from '@buildos/shared-types';
import { canonicalizeAgenticChatJson } from '@buildos/shared-types';
import {
	type LoadedTaskSchedule,
	type ToolValidationIssue,
	type TurnContract,
	validateToolCalls
} from '@buildos/agentic-chat-runtime/loop';
import { reviewedAgenticChatMutationSpecV1 } from '../mutations/tool-catalog';
import type { AgenticChatTurnProviderRequestV1 } from './contracts';
import { completedProviderCallToChatToolCall } from './feedback';
import { providerError } from './protocol';
import type { CompletedProviderToolCall } from './stream-tool-calls';

const CANONICAL_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function contractSha256(contract: TurnContract): string {
	return createHash('sha256')
		.update(canonicalizeAgenticChatJson(contract as unknown as JsonValue), 'utf8')
		.digest('hex');
}

export function validateCompletedProviderCalls(
	calls: readonly CompletedProviderToolCall[],
	request: AgenticChatTurnProviderRequestV1,
	/** Scheduling values this turn's reads loaded; a reschedule that repeats one is a no-op. */
	loadedTaskSchedules?: ReadonlyMap<string, LoadedTaskSchedule>
): ToolValidationIssue[] {
	const issues = validateToolCalls(
		calls.map((call) => {
			// Server archive facts contain existing titles, not authored durable
			// text. Keep them in the review digest but out of text-write validation.
			// The pre-review archive guard separately rejects actor-supplied facts.
			if (
				call.name !== 'update_onto_document' ||
				!Object.hasOwn(call.arguments, '_archive_review')
			)
				return completedProviderCallToChatToolCall(call);
			const { _archive_review: _facts, ...args } = call.arguments;
			return completedProviderCallToChatToolCall({
				...call,
				canonicalArguments: canonicalizeAgenticChatJson(args)
			});
		}),
		Array.from(request.tools) as unknown as ChatToolDefinition[],
		{
			projectId:
				typeof request.projectId === 'string' &&
				CANONICAL_UUID_PATTERN.test(request.projectId)
					? request.projectId
					: null,
			...(loadedTaskSchedules && loadedTaskSchedules.size > 0 ? { loadedTaskSchedules } : {})
		}
	);
	validateExactDocumentLiterals(calls, request, issues);
	return issues;
}

const HTML_ENTITY_LITERAL_PAIRS = [
	['&amp;', '&'],
	['&lt;', '<'],
	['&gt;', '>'],
	['&quot;', '"'],
	['&#34;', '"'],
	['&#39;', "'"],
	['&apos;', "'"]
] as const;

/**
 * Reject a model-authored HTML encoding when the user's literal document body
 * proves the intended characters. This never decodes or rewrites a mutation:
 * the existing bounded validation loop asks the acting model to propose the
 * exact content again before semantic review or persistence.
 */
function validateExactDocumentLiterals(
	calls: readonly CompletedProviderToolCall[],
	request: AgenticChatTurnProviderRequestV1,
	issues: ToolValidationIssue[]
): void {
	const userText = latestUserText(request);
	if (!userText) return;
	for (const call of calls) {
		if (!['create_onto_document', 'update_onto_document'].includes(call.name)) continue;
		const transformed = new Map<string, string>();
		for (const content of authoredDocumentTexts(call.arguments)) {
			collectHtmlEncodedLiterals(content, userText, transformed);
		}
		const errors = Array.from(
			transformed,
			([entity, literal]) =>
				`Document content must preserve the user's exact literal text. Do not HTML-encode ${JSON.stringify(literal)} as ${JSON.stringify(entity)}; copy the original content byte-for-byte.`
		);
		addCallValidationErrors(issues, call, errors);
	}
}

/** Body text the model authored: whole content, edit replacements, and section content. */
function authoredDocumentTexts(args: Record<string, unknown>): string[] {
	const texts: string[] = [];
	if (typeof args.content === 'string') texts.push(args.content);
	for (const edit of Array.isArray(args.edits) ? args.edits : []) {
		if (typeof edit?.new_text === 'string') texts.push(edit.new_text);
	}
	for (const edit of Array.isArray(args.section_edits) ? args.section_edits : []) {
		if (typeof edit?.content === 'string') texts.push(edit.content);
	}
	return texts;
}

function collectHtmlEncodedLiterals(
	content: string,
	userText: string,
	transformed: Map<string, string>
): void {
	if (content.length === 0 || userText.includes(content)) return;
	const fullyDecoded = HTML_ENTITY_LITERAL_PAIRS.reduce(
		(value, [entity, literal]) => value.split(entity).join(literal),
		content
	);
	if (fullyDecoded !== content && userText.includes(fullyDecoded)) {
		for (const [entity, literal] of HTML_ENTITY_LITERAL_PAIRS) {
			if (content.includes(entity)) transformed.set(entity, literal);
		}
	} else {
		for (const [entity, literal] of HTML_ENTITY_LITERAL_PAIRS) {
			let offset = content.indexOf(entity);
			while (offset >= 0) {
				const oneLiteral =
					content.slice(0, offset) + literal + content.slice(offset + entity.length);
				if (userText.includes(oneLiteral)) {
					transformed.set(entity, literal);
					break;
				}
				offset = content.indexOf(entity, offset + entity.length);
			}
		}
	}
}

function latestUserText(request: AgenticChatTurnProviderRequestV1): string | null {
	for (let index = request.messages.length - 1; index >= 0; index -= 1) {
		const message = request.messages[index];
		if (message?.role !== 'user') continue;
		if (typeof message.content === 'string') return message.content;
		return message.content
			.filter((part) => part.type === 'text')
			.map((part) => part.text)
			.join('\n');
	}
	return null;
}

function addCallValidationErrors(
	issues: ToolValidationIssue[],
	call: CompletedProviderToolCall,
	errors: string[]
): void {
	if (errors.length === 0) return;
	const existing = issues.find((issue) => issue.toolCall.id === call.id);
	if (existing) {
		existing.errors.push(...errors);
	} else {
		issues.push({
			toolCall: completedProviderCallToChatToolCall(call),
			toolName: call.name,
			errors
		});
	}
}

/**
 * A reviewer is configured, no independently approved batch covers these
 * calls, and they are not an eligible simple direct write: every reviewed
 * mutation is rejected before execution. Reached only when the batch cannot be
 * held for review (for example after a direct write whose every call failed).
 */
export function rejectUnapprovedMutations(
	calls: readonly CompletedProviderToolCall[]
): ToolValidationIssue[] {
	return calls.flatMap((call): ToolValidationIssue[] => {
		const spec = reviewedAgenticChatMutationSpecV1(call.name);
		if (!spec) return [];
		return [
			{
				toolCall: completedProviderCallToChatToolCall(call),
				toolName: call.name,
				...(spec.operationName ? { op: spec.operationName } : {}),
				errors: [
					`Mutation ${call.name} is outside the independently approved turn contract. ` +
						'Do not execute it; either finish from the approved effects or declare a new exact contract for independent review.'
				]
			}
		];
	});
}

export function validationIssuesForCall(
	call: CompletedProviderToolCall,
	issues: readonly ToolValidationIssue[]
): ToolValidationIssue[] {
	return issues.filter((issue) => issue.toolCall.id === call.id);
}

export function callsWithValidationIssues(
	calls: readonly CompletedProviderToolCall[],
	issues: readonly ToolValidationIssue[]
): CompletedProviderToolCall[] {
	const invalidIds = new Set(issues.map((issue) => issue.toolCall.id));
	const invalidCalls = calls.filter((call) => invalidIds.has(call.id));
	if (invalidCalls.length === 0 || invalidCalls.length !== invalidIds.size) {
		throw providerError('provider_tool_validation_issue_identity_mismatch', 'permanent');
	}
	return invalidCalls;
}

export function validationFailureError(issues: readonly ToolValidationIssue[]): string {
	return `Tool validation failed: ${issues.flatMap((issue) => issue.errors).join(' ')}`;
}
