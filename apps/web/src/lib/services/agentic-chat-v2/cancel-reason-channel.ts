// apps/web/src/lib/services/agentic-chat-v2/cancel-reason-channel.ts
import type { Json } from '@buildos/shared-types';

export type FastChatCancelReason = 'user_cancelled' | 'superseded';

type FastChatCancelHint = {
	reason: FastChatCancelReason;
	stream_run_id: string;
	created_at: string;
	source: 'client_cancel_endpoint';
	client_turn_id?: string;
};

const FASTCHAT_CANCEL_HINTS_KEY = 'fastchat_cancel_hints_v1';
const FASTCHAT_CANCEL_HINT_TTL_MS = 10 * 60 * 1000;
const FASTCHAT_CANCEL_HINT_MAX_ENTRIES = 24;
const FASTCHAT_TRANSIENT_HINT_MAX_ENTRIES = 200;

type TransientHintEntry = {
	reason: FastChatCancelReason;
	createdAtMs: number;
	clientTurnId?: string;
};

const transientCancelHints = new Map<string, TransientHintEntry>();

function getNowMs(nowMs?: number): number {
	return typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
}

function parseIsoTimestampMs(value: unknown): number | null {
	if (typeof value !== 'string' || value.trim().length === 0) return null;
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) return null;
	return parsed;
}

function isExpired(createdAtMs: number, nowMs: number): boolean {
	return createdAtMs + FASTCHAT_CANCEL_HINT_TTL_MS < nowMs;
}

function transientHintKey(userId: string, streamRunId: string): string {
	return `${userId}::${streamRunId}`;
}

function pruneTransientHints(nowMs: number): void {
	for (const [key, hint] of transientCancelHints.entries()) {
		if (isExpired(hint.createdAtMs, nowMs)) {
			transientCancelHints.delete(key);
		}
	}

	if (transientCancelHints.size <= FASTCHAT_TRANSIENT_HINT_MAX_ENTRIES) return;

	const entries = [...transientCancelHints.entries()].sort(
		(a, b) => a[1].createdAtMs - b[1].createdAtMs
	);
	const overflow = transientCancelHints.size - FASTCHAT_TRANSIENT_HINT_MAX_ENTRIES;
	for (let index = 0; index < overflow; index += 1) {
		const key = entries[index]?.[0];
		if (key) transientCancelHints.delete(key);
	}
}

function parseHintRecord(value: unknown): FastChatCancelHint | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (record.reason !== 'user_cancelled' && record.reason !== 'superseded') {
		return null;
	}

	if (typeof record.stream_run_id !== 'string' || record.stream_run_id.trim().length === 0) {
		return null;
	}
	if (typeof record.created_at !== 'string' || record.created_at.trim().length === 0) {
		return null;
	}
	if (record.source !== 'client_cancel_endpoint') {
		return null;
	}

	return {
		reason: record.reason,
		stream_run_id: record.stream_run_id,
		created_at: record.created_at,
		source: 'client_cancel_endpoint',
		client_turn_id:
			typeof record.client_turn_id === 'string' && record.client_turn_id.trim().length > 0
				? record.client_turn_id
				: undefined
	};
}

function readHintsFromMetadata(agentMetadata: unknown): Record<string, FastChatCancelHint> {
	if (!agentMetadata || typeof agentMetadata !== 'object' || Array.isArray(agentMetadata)) {
		return {};
	}
	const root = agentMetadata as Record<string, unknown>;
	const rawHints = root[FASTCHAT_CANCEL_HINTS_KEY];
	if (!rawHints || typeof rawHints !== 'object' || Array.isArray(rawHints)) {
		return {};
	}

	const parsedHints: Record<string, FastChatCancelHint> = {};
	for (const [streamRunId, hint] of Object.entries(rawHints)) {
		const parsed = parseHintRecord(hint);
		if (!parsed) continue;
		parsedHints[streamRunId] = parsed;
	}
	return parsedHints;
}

function pruneMetadataHints(
	hints: Record<string, FastChatCancelHint>,
	nowMs: number
): Record<string, FastChatCancelHint> {
	const validHints = Object.entries(hints)
		.map(([streamRunId, hint]) => {
			const createdAtMs = parseIsoTimestampMs(hint.created_at);
			if (!createdAtMs || isExpired(createdAtMs, nowMs)) return null;
			return { streamRunId, hint, createdAtMs };
		})
		.filter(
			(
				entry
			): entry is { streamRunId: string; hint: FastChatCancelHint; createdAtMs: number } =>
				Boolean(entry)
		)
		.sort((a, b) => b.createdAtMs - a.createdAtMs)
		.slice(0, FASTCHAT_CANCEL_HINT_MAX_ENTRIES);

	const next: Record<string, FastChatCancelHint> = {};
	for (const entry of validHints) {
		next[entry.streamRunId] = entry.hint;
	}
	return next;
}

export function isFastChatCancelReason(value: unknown): value is FastChatCancelReason {
	return value === 'user_cancelled' || value === 'superseded';
}

export function normalizeFastChatStreamRunId(value: unknown): string | null {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : null;
	}
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

export function createFastChatCancelHint(params: {
	reason: FastChatCancelReason;
	streamRunId: string;
	clientTurnId?: string;
	createdAt?: string;
}): FastChatCancelHint {
	return {
		reason: params.reason,
		stream_run_id: params.streamRunId,
		created_at: params.createdAt ?? new Date().toISOString(),
		source: 'client_cancel_endpoint',
		...(params.clientTurnId ? { client_turn_id: params.clientTurnId } : {})
	};
}

export function mergeFastChatCancelHintIntoMetadata(params: {
	agentMetadata: unknown;
	streamRunId: string;
	hint: FastChatCancelHint;
	nowMs?: number;
}): Record<string, Json | undefined> {
	const nowMs = getNowMs(params.nowMs);
	const baseMetadata =
		params.agentMetadata &&
		typeof params.agentMetadata === 'object' &&
		!Array.isArray(params.agentMetadata)
			? ({ ...(params.agentMetadata as Record<string, Json | undefined>) } as Record<
					string,
					Json | undefined
				>)
			: {};
	const hints = readHintsFromMetadata(params.agentMetadata);
	hints[params.streamRunId] = params.hint;
	const prunedHints = pruneMetadataHints(hints, nowMs);
	baseMetadata[FASTCHAT_CANCEL_HINTS_KEY] = prunedHints as unknown as Json;
	return baseMetadata;
}

export function readFastChatCancelReasonFromMetadata(params: {
	agentMetadata: unknown;
	streamRunId: string;
	nowMs?: number;
}): FastChatCancelReason | null {
	const nowMs = getNowMs(params.nowMs);
	const hints = pruneMetadataHints(readHintsFromMetadata(params.agentMetadata), nowMs);
	const hint = hints[params.streamRunId];
	if (!hint) return null;
	return hint.reason;
}

export function recordTransientFastChatCancelHint(params: {
	userId: string;
	streamRunId: string;
	reason: FastChatCancelReason;
	clientTurnId?: string;
	nowMs?: number;
}): void {
	const nowMs = getNowMs(params.nowMs);
	pruneTransientHints(nowMs);
	transientCancelHints.set(transientHintKey(params.userId, params.streamRunId), {
		reason: params.reason,
		createdAtMs: nowMs,
		clientTurnId: params.clientTurnId
	});
}

export function consumeTransientFastChatCancelHint(params: {
	userId: string;
	streamRunId: string;
	nowMs?: number;
}): FastChatCancelReason | null {
	const nowMs = getNowMs(params.nowMs);
	pruneTransientHints(nowMs);

	const key = transientHintKey(params.userId, params.streamRunId);
	const hint = transientCancelHints.get(key);
	if (!hint) return null;
	transientCancelHints.delete(key);

	if (isExpired(hint.createdAtMs, nowMs)) return null;
	return hint.reason;
}
