// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts
import type { FastToolExecution } from '../stream-orchestrator/shared';
import { sanitizeAssistantFinalText } from '../stream-orchestrator/assistant-text-sanitization';
import { classifyToolExecution } from './digest';

export type FinalizationGuardReason =
	| 'empty_after_tools'
	| 'lead_in_after_successful_writes'
	| 'empty_after_successful_writes'
	| 'empty_after_failed_writes'
	| 'empty_after_reads';

export type FinalizationGuardResult = {
	text: string;
	applied: boolean;
	reason?: FinalizationGuardReason;
};

type ApplyFinalizationGuardParams = {
	finalAssistantText?: string | null;
	assistantText?: string | null;
	toolExecutions?: FastToolExecution[] | null;
};

const LEAD_IN_PATTERNS = [
	/\b(i['’]?ll|i will|let me|i['’]?m going to|i am going to)\b/i,
	/\b(check|look up|inspect|pull up|search|find|update|create|make|verify)\b/i,
	/\b(give me|one moment|hang on)\b/i
];

function isLikelyLeadIn(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return false;
	if (normalized.length > 260) return false;
	const lower = normalized.toLowerCase();
	if (
		lower.includes('updated') ||
		lower.includes('created') ||
		lower.includes('deleted') ||
		lower.includes('completed') ||
		lower.includes('finished') ||
		lower.includes('found')
	) {
		return false;
	}
	return LEAD_IN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
	return count === 1 ? singular : pluralValue;
}

function buildGuardText(params: {
	successfulWrites: number;
	failedWrites: number;
	successfulReads: number;
	failedReads: number;
	otherSuccesses: number;
	otherFailures: number;
}): { text: string; reason: FinalizationGuardReason } {
	const {
		successfulWrites,
		failedWrites,
		successfulReads,
		failedReads,
		otherSuccesses,
		otherFailures
	} = params;

	if (successfulWrites > 0) {
		const writeText =
			successfulWrites === 1
				? 'I completed the requested change.'
				: `I completed ${successfulWrites} requested ${plural(successfulWrites, 'change')}.`;
		if (failedWrites > 0) {
			return {
				text: `${writeText} ${failedWrites} ${plural(failedWrites, 'write')} failed, so I did not claim those as completed.`,
				reason: 'lead_in_after_successful_writes'
			};
		}
		return {
			text: writeText,
			reason: 'empty_after_successful_writes'
		};
	}

	if (failedWrites > 0) {
		return {
			text:
				failedWrites === 1
					? 'I tried to make the requested change, but the tool call failed, so nothing was changed.'
					: `I tried to make the requested changes, but ${failedWrites} write ${plural(failedWrites, 'attempt')} failed, so nothing was changed.`,
			reason: 'empty_after_failed_writes'
		};
	}

	if (successfulReads > 0) {
		const failureSuffix =
			failedReads + otherFailures > 0
				? ` ${failedReads + otherFailures} ${plural(failedReads + otherFailures, 'tool call')} failed while gathering context.`
				: '';
		return {
			text: `I gathered the requested context, but the turn ended before a final response was produced.${failureSuffix}`,
			reason: 'empty_after_reads'
		};
	}

	if (otherSuccesses > 0) {
		return {
			text: 'I completed the tool work, but the turn ended before a final response was produced.',
			reason: 'empty_after_tools'
		};
	}

	return {
		text: 'I tried to complete the request, but the tool work failed before I could produce a final answer.',
		reason: 'empty_after_tools'
	};
}

export function applyFinalizationGuard(
	params: ApplyFinalizationGuardParams
): FinalizationGuardResult {
	const toolExecutions = params.toolExecutions ?? [];
	const finalText = sanitizeAssistantFinalText(params.finalAssistantText ?? '').trim();
	const assistantText = sanitizeAssistantFinalText(params.assistantText ?? '').trim();
	const candidate = finalText || assistantText;

	if (toolExecutions.length === 0) {
		return { text: candidate, applied: false };
	}

	let successfulWrites = 0;
	let failedWrites = 0;
	let successfulReads = 0;
	let failedReads = 0;
	let otherSuccesses = 0;
	let otherFailures = 0;

	for (const execution of toolExecutions) {
		const category = classifyToolExecution(execution);
		const success = execution.result.success === true;
		if (category === 'write') {
			if (success) successfulWrites += 1;
			else failedWrites += 1;
		} else if (category === 'read_discovery') {
			if (success) successfulReads += 1;
			else failedReads += 1;
		} else if (success) {
			otherSuccesses += 1;
		} else {
			otherFailures += 1;
		}
	}

	const shouldReplaceLeadIn = successfulWrites > 0 && candidate && isLikelyLeadIn(candidate);
	const shouldSynthesizeEmpty = !candidate;

	if (!shouldReplaceLeadIn && !shouldSynthesizeEmpty) {
		return { text: candidate, applied: false };
	}

	const synthesized = buildGuardText({
		successfulWrites,
		failedWrites,
		successfulReads,
		failedReads,
		otherSuccesses,
		otherFailures
	});

	return {
		text: synthesized.text,
		applied: true,
		reason: shouldReplaceLeadIn ? 'lead_in_after_successful_writes' : synthesized.reason
	};
}
