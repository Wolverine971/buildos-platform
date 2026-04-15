// apps/web/src/lib/services/agentic-chat-lite/prompt/phase-frame.ts
import type { ChatContextType } from '@buildos/shared-types';
import { estimateTokensFromText } from '$lib/services/agentic-chat-v2/context-usage';

export type LitePhaseFrameInput = {
	phase: string;
	toolCall?: {
		id?: string | null;
		name?: string | null;
		arguments?: unknown;
	} | null;
	toolResult?: {
		status?: string | null;
		error?: string | null;
		output?: unknown;
	} | null;
	effectiveContextType?: ChatContextType | null;
	effectiveEntityId?: string | null;
	latestContextShift?:
		| {
				from?: ChatContextType | string | null;
				to?: ChatContextType | string | null;
				entityId?: string | null;
		  }
		| string
		| null;
	knownIds?: Record<string, string | null | undefined> | null;
	nextActionHint?: string | null;
};

export type LitePhaseFrame = {
	phase: string;
	content: string;
	slots: Record<string, unknown>;
	chars: number;
	estimatedTokens: number;
};

export function buildLitePhaseFrame(input: LitePhaseFrameInput): LitePhaseFrame {
	const slots = {
		phase: input.phase,
		toolName: input.toolCall?.name ?? null,
		toolCallId: input.toolCall?.id ?? null,
		toolResultStatus: input.toolResult?.status ?? null,
		toolResultError: input.toolResult?.error ?? null,
		effectiveContextType: input.effectiveContextType ?? null,
		effectiveEntityId: input.effectiveEntityId ?? null,
		latestContextShift: input.latestContextShift ?? null,
		knownIds: compactKnownIds(input.knownIds ?? null),
		nextActionHint: input.nextActionHint ?? null
	};
	const lines = [
		`Phase: ${input.phase}`,
		`Tool: ${input.toolCall?.name ?? 'none'}`,
		`Result: ${formatToolResult(input.toolResult ?? null)}`,
		`Runtime location: ${formatRuntimeLocation(input)}`,
		`Known IDs: ${formatKnownIds(input.knownIds ?? null)}`,
		`Next: ${input.nextActionHint ?? 'continue from the latest runtime state'}`
	];
	const content = lines.join('\n');

	return {
		phase: input.phase,
		content,
		slots,
		chars: content.length,
		estimatedTokens: estimateTokensFromText(content)
	};
}

function formatToolResult(result: LitePhaseFrameInput['toolResult']): string {
	if (!result) return 'none';
	if (result.error) return `error - ${result.error}`;
	if (result.status) return result.status;
	return result.output === undefined ? 'received' : 'received output';
}

function formatRuntimeLocation(input: LitePhaseFrameInput): string {
	const context = input.effectiveContextType ?? 'unknown context';
	const entity = input.effectiveEntityId ? `, entity ${input.effectiveEntityId}` : '';
	const shift = formatContextShift(input.latestContextShift ?? null);
	return `${context}${entity}${shift ? `, ${shift}` : ''}`;
}

function formatContextShift(shift: LitePhaseFrameInput['latestContextShift']): string {
	if (!shift) return '';
	if (typeof shift === 'string') return `context shift: ${shift}`;
	const from = shift.from ?? 'unknown';
	const to = shift.to ?? 'unknown';
	const entity = shift.entityId ? ` (${shift.entityId})` : '';
	return `context shift: ${from} -> ${to}${entity}`;
}

function formatKnownIds(ids: LitePhaseFrameInput['knownIds']): string {
	const compacted = compactKnownIds(ids ?? null);
	const entries = Object.entries(compacted);
	if (entries.length === 0) return 'none';
	return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function compactKnownIds(ids: LitePhaseFrameInput['knownIds']): Record<string, string> {
	if (!ids) return {};
	return Object.fromEntries(
		Object.entries(ids).filter((entry): entry is [string, string] => Boolean(entry[1]))
	);
}
