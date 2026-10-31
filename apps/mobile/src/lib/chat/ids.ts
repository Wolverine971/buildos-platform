// apps/mobile/src/lib/chat/ids.ts
/**
 * Client ids for a turn (`clientTurnId`, `streamRunId`) and for rows made on this phone.
 * Unique enough per device; the server only asks for ≤ 256 chars. Hermes has no
 * `crypto.randomUUID`, so this mirrors the capture queue's id scheme.
 */
export function newChatId(prefix: 'turn' | 'stream' | 'row', now: number = Date.now()): string {
	const rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
	return `${prefix}_${now.toString(36)}_${rand}`;
}
