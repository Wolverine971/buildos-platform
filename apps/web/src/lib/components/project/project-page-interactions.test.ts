// apps/web/src/lib/components/project/project-page-interactions.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	flushPendingImageUploadOpen,
	requestImageUploadOpen,
	resolveEntityOpenAction
} from './project-page-interactions';

describe('project page image upload interactions', () => {
	it('queues image upload open when panel ref is not available yet', () => {
		expect(requestImageUploadOpen(null)).toBe(true);
	});

	it('opens image upload immediately when panel ref is available', () => {
		const openUploadModal = vi.fn();

		expect(requestImageUploadOpen({ openUploadModal })).toBe(false);
		expect(openUploadModal).toHaveBeenCalledTimes(1);
	});

	it('flushes queued image upload open once panel ref appears', () => {
		const openUploadModal = vi.fn();

		expect(flushPendingImageUploadOpen(true, { openUploadModal })).toBe(false);
		expect(openUploadModal).toHaveBeenCalledTimes(1);
	});

	it('keeps queue state when still pending and panel ref is missing', () => {
		expect(flushPendingImageUploadOpen(true, null)).toBe(true);
	});
});

describe('resolveEntityOpenAction', () => {
	it.each([
		['task', { kind: 'task', entityId: 'ent-1' }],
		['plan', { kind: 'plan', entityId: 'ent-1' }],
		['goal', { kind: 'goal', entityId: 'ent-1' }],
		['note', { kind: 'document', entityId: 'ent-1' }],
		['document', { kind: 'document', entityId: 'ent-1' }],
		['milestone', { kind: 'milestone', entityId: 'ent-1' }],
		['risk', { kind: 'risk', entityId: 'ent-1' }],
		['event', { kind: 'event', entityId: 'ent-1' }],
		['project', { kind: 'project', entityId: 'ent-1' }]
	] as const)('returns opened action for %s', (entityType, expectedAction) => {
		expect(resolveEntityOpenAction(entityType, 'ent-1')).toEqual({
			result: 'opened',
			action: expectedAction
		});
	});

	it.each(['requirement', 'source'] as const)('marks %s as unsupported', (entityType) => {
		expect(resolveEntityOpenAction(entityType, 'ent-1')).toEqual({ result: 'unsupported' });
	});

	it('marks unknown entity types as unknown', () => {
		expect(resolveEntityOpenAction('user', 'ent-1')).toEqual({ result: 'unknown' });
	});
});
