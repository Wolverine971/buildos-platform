// apps/worker/tests/projectLoopStallReclaim.test.ts
import { describe, expect, it } from 'vitest';
import { resolveProjectLoopsEnabled } from '../src/config/projectLoops';
import { projectLoopDedupKey } from '../src/workers/project-loop/enqueue';

describe('resolveProjectLoopsEnabled', () => {
	it('lets an explicit true win in production', () => {
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: 'true', NODE_ENV: 'production' })
		).toBe(true);
	});

	it('lets an explicit false win in development (regression: dev no longer force-enables)', () => {
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: 'false', NODE_ENV: 'development' })
		).toBe(false);
	});

	it('is case-insensitive and trims the explicit value', () => {
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: '  TRUE ', NODE_ENV: 'production' })
		).toBe(true);
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: 'nope', NODE_ENV: 'development' })
		).toBe(false);
	});

	it('falls back to the dev default when the var is unset or empty', () => {
		expect(resolveProjectLoopsEnabled({ NODE_ENV: 'development' })).toBe(true);
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: '', NODE_ENV: 'development' })
		).toBe(true);
		expect(resolveProjectLoopsEnabled({ NODE_ENV: 'production' })).toBe(false);
		expect(
			resolveProjectLoopsEnabled({ ENABLE_PROJECT_LOOPS: null, NODE_ENV: 'production' })
		).toBe(false);
	});
});

describe('projectLoopDedupKey', () => {
	it('is stable per project across manual/cron triggers within the same UTC day', () => {
		const morning = new Date('2026-07-01T04:00:00.000Z');
		const later = new Date('2026-07-01T14:32:11.000Z');
		expect(projectLoopDedupKey('proj-1', morning)).toBe('project-loop:proj-1:2026-07-01');
		// A manual web trigger racing the 4am cron collapses onto the same key.
		expect(projectLoopDedupKey('proj-1', later)).toBe(projectLoopDedupKey('proj-1', morning));
	});

	it('rolls to a new key on the next UTC day so later runs are not blocked forever', () => {
		expect(projectLoopDedupKey('proj-1', new Date('2026-07-02T04:00:00.000Z'))).toBe(
			'project-loop:proj-1:2026-07-02'
		);
	});

	it('scopes the key per project', () => {
		const at = new Date('2026-07-01T04:00:00.000Z');
		expect(projectLoopDedupKey('proj-1', at)).not.toBe(projectLoopDedupKey('proj-2', at));
	});
});
