// apps/web/src/lib/services/agentic-chat-v2/turn-admission.test.ts
import { describe, expect, it } from 'vitest';
import { shouldReclaimRunningTurn } from './turn-admission';

describe('shouldReclaimRunningTurn', () => {
	const NOW = Date.parse('2026-07-23T12:00:00.000Z');
	const MAX = 285_000;

	it('keeps a young turn with fresh progress', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 60_000,
				lastProgressAtMs: NOW - 10_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
	});

	it('reclaims a dead turn after ~2 minutes of heartbeat silence, before max duration', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 150_000,
				lastProgressAtMs: NOW - 130_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});

	it('does NOT cancel a slow-but-alive turn past max duration when progress is fresh', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 300_000,
				lastProgressAtMs: NOW - 15_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
	});

	it('reclaims past max duration when progress is not fresh', () => {
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 300_000,
				lastProgressAtMs: NOW - 90_000,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});

	it('falls back to started_at for legacy turns without a heartbeat', () => {
		// Old behavior preserved: no heartbeat data, reclaim strictly by age...
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 60_000,
				lastProgressAtMs: null,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(false);
		// ...except a heartbeat-less turn older than the stale window is dead.
		expect(
			shouldReclaimRunningTurn({
				nowMs: NOW,
				startedAtMs: NOW - 130_000,
				lastProgressAtMs: null,
				detachedTurnMaxDurationMs: MAX
			})
		).toBe(true);
	});
});
