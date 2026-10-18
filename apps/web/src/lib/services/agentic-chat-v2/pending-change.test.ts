// apps/web/src/lib/services/agentic-chat-v2/pending-change.test.ts
import { describe, expect, it } from 'vitest';
import type { FastChatPendingTurnContract } from '@buildos/agentic-chat-runtime/loop';
import { buildPendingChangeView, pendingChangeKey, pendingChangeLookupIds } from './pending-change';

type Outcome = FastChatPendingTurnContract['contract']['outcomes'][number];

function outcome(patch: Partial<Outcome> & Pick<Outcome, 'action' | 'entityKind'>): Outcome {
	return {
		id: `o_${Math.random().toString(36).slice(2, 8)}`,
		targetIds: [],
		requiredFields: [],
		minimumSuccessfulEffects: 1,
		...patch
	} as Outcome;
}

function pending(outcomes: Outcome[]): FastChatPendingTurnContract {
	return {
		version: 1,
		contract: { version: 1, source: 'declared', outcomes },
		contextType: 'project',
		projectId: 'f85b6c5f-59fb-4e4c-8654-748f793d8f4b',
		originatingTurnRunId: 'bf1ffac2-62a6-4be7-b0a1-e9d80cc4a710',
		createdAt: '2026-09-30T02:03:22.856Z',
		finishedReason: 'stop'
	};
}

const DOC_IDS = ['b0274dec', '8a2994bf', 'b0f8066a', 'a7cf03d8', 'acbf6978', 'be374ea5'];

describe('buildPendingChangeView', () => {
	// Shape of a real production commission (Wayne Strategies, 2026-09-30).
	it('groups archives, names a single target, and keeps the commission order', () => {
		const view = buildPendingChangeView(
			pending([
				outcome({
					action: 'update',
					entityKind: 'plan',
					targetIds: ['e7676504'],
					requiredFields: ['state_key']
				}),
				outcome({
					action: 'update',
					entityKind: 'goal',
					targetIds: ['9d8831d7'],
					requiredFields: ['description', 'name']
				}),
				...DOC_IDS.map((id) =>
					outcome({
						action: 'update',
						entityKind: 'document',
						targetIds: [id],
						requiredFields: ['archive_mode', 'state_key']
					})
				)
			]),
			(kind, id) =>
				kind === 'goal' && id === '9d8831d7'
					? 'Q4 pipeline'
					: kind === 'plan'
						? 'Launch'
						: null
		);
		expect(view).toEqual({
			key: 'bf1ffac2-62a6-4be7-b0a1-e9d80cc4a710@2026-09-30T02:03:22.856Z',
			createdAt: '2026-09-30T02:03:22.856Z',
			items: ['Update plan "Launch"', 'Update goal "Q4 pipeline"', 'Archive 6 docs']
		});
	});

	it('counts without names when titles are unknown, and pluralizes', () => {
		const view = buildPendingChangeView(
			pending([
				outcome({ action: 'complete', entityKind: 'task', targetIds: ['t1'] }),
				outcome({ action: 'complete', entityKind: 'task', targetIds: ['t2'] }),
				outcome({ action: 'update', entityKind: 'task', targetIds: ['t3'] }),
				outcome({ action: 'create', entityKind: 'task', minimumSuccessfulEffects: 2 })
			])
		);
		expect(view?.items).toEqual(['Complete 2 tasks', 'Update 1 task', 'Create 2 tasks']);
	});

	it('shortens long titles and counts a repeated target once', () => {
		const long = 'A very long document title that keeps going well past the limit';
		const view = buildPendingChangeView(
			pending([
				outcome({ action: 'update', entityKind: 'document', targetIds: ['d1'] }),
				outcome({ action: 'update', entityKind: 'document', targetIds: ['d1'] })
			]),
			() => long
		);
		expect(view?.items).toHaveLength(1);
		expect(view?.items[0]).toMatch(/^Update doc "A very long document title that keeps g…"$/);
	});

	it('is null when nothing is owed', () => {
		expect(buildPendingChangeView(null)).toBeNull();
		expect(buildPendingChangeView(pending([]))).toBeNull();
	});
});

describe('pendingChangeLookupIds', () => {
	it('collects target ids only for kinds the title lookup knows', () => {
		const ids = pendingChangeLookupIds(
			pending([
				outcome({ action: 'update', entityKind: 'document', targetIds: ['d1', 'd2'] }),
				outcome({ action: 'link', entityKind: 'relationship', targetIds: ['r1'] }),
				outcome({ action: 'update', entityKind: 'document', targetIds: ['d2'] })
			])
		);
		expect([...ids.entries()].map(([kind, set]) => [kind, [...set]])).toEqual([
			['document', ['d1', 'd2']]
		]);
	});
});

describe('pendingChangeKey', () => {
	it('changes when the trigger rewrites the commission', () => {
		const a = pending([outcome({ action: 'update', entityKind: 'task', targetIds: ['t1'] })]);
		expect(pendingChangeKey(a)).not.toBe(
			pendingChangeKey({ ...a, createdAt: '2026-09-30T03:00:00.000Z' })
		);
		expect(pendingChangeKey({ ...a, originatingTurnRunId: null })).toBe(
			'none@2026-09-30T02:03:22.856Z'
		);
	});
});
