// apps/web/src/lib/components/agent/agent-chat-render-keys.ts
//
// Stable render identity across server id swaps. A live turn's messages carry
// client ids (optimistic user bubble, placeholder thinking block, worker
// assistant placeholder); a snapshot reload replaces them with persisted rows
// under different ids. Carrying the on-screen `renderKey` forward lets keyed
// renderers update those nodes in place instead of remounting them (which
// replayed entrance animations and reset per-message DOM state).

import type { UIMessage } from './agent-chat.types';

const TURN_IDENTITY_FIELDS = ['client_turn_id', 'turn_run_id', 'stream_run_id'] as const;

function identityCandidates(message: UIMessage): string[] {
	const candidates = [`id:${message.id}`];
	const metadata = message.metadata as Record<string, unknown> | undefined;
	if (!metadata) return candidates;
	for (const field of TURN_IDENTITY_FIELDS) {
		const value = metadata[field];
		if (typeof value === 'string' && value.length > 0) {
			candidates.push(`${message.type}:${field}:${value}`);
		}
	}
	return candidates;
}

/**
 * Return `next` with each message's `renderKey` inherited from the matching
 * message in `previous` (same id, or same type + turn identity). Copy-on-replace:
 * unchanged messages keep their object identity, and the original array is
 * returned when nothing needed a key.
 */
export function carryRenderKeys(previous: UIMessage[], next: UIMessage[]): UIMessage[] {
	if (previous.length === 0 || next.length === 0) return next;

	const keyByCandidate = new Map<string, string>();
	for (const message of previous) {
		const renderKey = message.renderKey ?? message.id;
		for (const candidate of identityCandidates(message)) {
			if (!keyByCandidate.has(candidate)) keyByCandidate.set(candidate, renderKey);
		}
	}

	const claimed = new Set<string>();
	let changed = false;
	const result = next.map((message) => {
		if (message.renderKey) {
			claimed.add(message.renderKey);
			return message;
		}
		for (const candidate of identityCandidates(message)) {
			const renderKey = keyByCandidate.get(candidate);
			if (!renderKey || claimed.has(renderKey)) continue;
			claimed.add(renderKey);
			if (renderKey === message.id) return message;
			changed = true;
			return { ...message, renderKey };
		}
		return message;
	});
	return changed ? result : next;
}
