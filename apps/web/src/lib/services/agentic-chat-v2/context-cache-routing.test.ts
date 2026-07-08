// apps/web/src/lib/services/agentic-chat-v2/context-cache-routing.test.ts
import { describe, expect, it } from 'vitest';
import {
	annotateContextMetaCacheAge,
	normalizeContextLoadSource,
	resolveCacheAgeSeconds,
	shouldBypassContextCacheForShiftHint
} from './context-cache-routing';

describe('context-cache-routing', () => {
	it('normalizes known context load sources and marks unknown cached sources explicitly', () => {
		expect(normalizeContextLoadSource('rpc')).toBe('rpc');
		expect(normalizeContextLoadSource('rpc_null_fallback')).toBe('rpc_null_fallback');
		expect(normalizeContextLoadSource('fallback')).toBe('fallback');
		expect(normalizeContextLoadSource('not-real')).toBe('unknown_cached');
		expect(normalizeContextLoadSource(null)).toBe('unknown_cached');
	});

	it('resolves non-negative cache age seconds', () => {
		const nowMs = Date.parse('2026-07-07T12:00:10.000Z');

		expect(resolveCacheAgeSeconds('2026-07-07T12:00:00.000Z', nowMs)).toBe(10);
		expect(resolveCacheAgeSeconds('2026-07-07T12:00:20.000Z', nowMs)).toBe(0);
		expect(resolveCacheAgeSeconds('not-a-date', nowMs)).toBe(0);
		expect(resolveCacheAgeSeconds(null, nowMs)).toBe(0);
	});

	it('annotates context_meta cache age when metadata exists', () => {
		const data = {
			context_meta: {
				context_load_source: 'session_cache'
			}
		};

		annotateContextMetaCacheAge(data, 12.8);
		expect(data.context_meta).toEqual({
			context_load_source: 'session_cache',
			cache_age_seconds: 12
		});
	});

	it('leaves payloads without context_meta untouched when annotating cache age', () => {
		const data = { project: { id: 'project-1' } };

		annotateContextMetaCacheAge(data, 10);
		expect(data).toEqual({ project: { id: 'project-1' } });
	});

	it('bypasses cache when the recent shift hint points at a different context key', () => {
		expect(
			shouldBypassContextCacheForShiftHint({
				requestContextType: 'project',
				requestEntityId: 'project-1',
				requestProjectFocus: null,
				shiftHint: {
					context_type: 'project',
					entity_id: 'project-1',
					shifted_at: '2026-07-07T12:00:00.000Z'
				}
			})
		).toBe(false);

		expect(
			shouldBypassContextCacheForShiftHint({
				requestContextType: 'project',
				requestEntityId: 'project-1',
				requestProjectFocus: null,
				shiftHint: {
					context_type: 'project',
					entity_id: 'project-2',
					shifted_at: '2026-07-07T12:00:00.000Z'
				}
			})
		).toBe(true);

		expect(
			shouldBypassContextCacheForShiftHint({
				requestContextType: 'project',
				requestEntityId: 'project-1',
				requestProjectFocus: {
					focusType: 'task',
					focusEntityId: 'task-1',
					projectId: 'project-1'
				},
				shiftHint: {
					context_type: 'project',
					entity_id: 'project-1',
					shifted_at: '2026-07-07T12:00:00.000Z'
				}
			})
		).toBe(true);
	});
});
