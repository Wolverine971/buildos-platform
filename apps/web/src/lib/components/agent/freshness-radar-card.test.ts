// apps/web/src/lib/components/agent/freshness-radar-card.test.ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type {
	ChatSession,
	FreshnessCardPayloadV1,
	FreshnessScanStatusV1
} from '@buildos/shared-types';
import { buildAgentChatSessionSnapshot } from './agent-chat-session';
import { buildAgentTimeline, timelineItemsFromMessages } from './agent-chat-timeline';
import {
	approveFreshnessBundle,
	buildFreshnessCardUIMessage,
	describeUndoResult,
	draftInChatPromptFor,
	formatFreshnessPercent,
	freshnessBundleState,
	freshnessEntityHref,
	freshnessFlagView,
	freshnessItemState,
	freshnessScanIdFromMetadata,
	hasUndoableFlags,
	markFreshnessFlagNotStale,
	readFreshnessCardFromMetadata,
	remainingBundleOperationCount,
	retiredUndoableUntil,
	undoFreshnessScan
} from './freshness-radar-card';
import { freshnessCardFixture, freshnessCardMetadata } from './freshness-radar-card.fixture';

function apiResponse(data: unknown, status = 200): Response {
	return new Response(
		JSON.stringify(
			status < 400 ? { success: true, data } : { success: false, error: String(data) }
		),
		{ status, headers: { 'Content-Type': 'application/json' } }
	);
}

describe('freshness card message', () => {
	it('reads a card only from the radar-injected metadata shape', () => {
		const card = freshnessCardFixture();
		expect(readFreshnessCardFromMetadata(freshnessCardMetadata(card))?.scanId).toBe(
			card.scanId
		);
		expect(
			readFreshnessCardFromMetadata({ ...freshnessCardMetadata(card), source: 'agent_run' })
		).toBeNull();
		expect(readFreshnessCardFromMetadata({ card })).toBeNull();
		expect(freshnessScanIdFromMetadata(freshnessCardMetadata(card))).toBe(card.scanId);
	});

	it('maps a valid row to a card and an unparseable row to a plain assistant bubble', () => {
		const card = freshnessCardFixture();
		const row = {
			id: 'msg-card',
			session_id: 'session-1',
			content: '3 things may be out of date in Launch.',
			created_at: '2026-09-18T15:01:00.000Z',
			metadata: freshnessCardMetadata(card)
		};
		const message = buildFreshnessCardUIMessage(row);
		expect(message.type).toBe('freshness_card');
		expect(message.role).toBe('assistant');
		expect(message.data.card.items).toHaveLength(3);

		const broken = buildFreshnessCardUIMessage({
			...row,
			metadata: { ...freshnessCardMetadata(card), card: { version: 'freshness_card_v0' } }
		});
		expect(broken.type).toBe('assistant');
		expect(broken.content).toBe(row.content);
		expect(broken.data).toBeUndefined();
	});

	it('hydrates an injected card row as a card in session order', () => {
		const card = freshnessCardFixture();
		const snapshot = buildAgentChatSessionSnapshot({
			session: {
				id: 'session-1',
				user_id: 'user-1',
				context_type: 'project',
				entity_id: card.projectId,
				title: 'Launch',
				summary: null,
				agent_metadata: null
			} as unknown as ChatSession,
			messages: [
				{
					id: 'u1',
					role: 'user',
					content: 'Shipped the deck, pricing moves to Oct 3',
					created_at: '2026-09-18T15:00:00.000Z'
				},
				{
					id: 'a1',
					role: 'assistant',
					content: 'Noted.',
					created_at: '2026-09-18T15:00:05.000Z'
				},
				{
					id: 'card-1',
					role: 'assistant',
					content: '3 things may be out of date in Launch.',
					created_at: '2026-09-18T15:01:10.000Z',
					metadata: freshnessCardMetadata(card)
				}
			]
		});
		expect(snapshot.messages.map((message) => message.type)).toEqual([
			'user',
			'assistant',
			'freshness_card'
		]);
		const cardMessage = snapshot.messages[2]!;
		expect(cardMessage.id).toBe('card-1');
		expect(cardMessage.data.card.scanId).toBe(card.scanId);
	});

	it('shows the card as one linked timeline step, server-built or client-built', () => {
		const card = freshnessCardFixture();
		const row = {
			id: 'card-1',
			session_id: 'session-1',
			role: 'assistant',
			content: 'fallback text',
			created_at: '2026-09-18T15:01:10.000Z',
			metadata: freshnessCardMetadata(card)
		};
		const [server] = buildAgentTimeline({ sessionId: 'session-1', messages: [row] });
		const [client] = timelineItemsFromMessages('session-1', [buildFreshnessCardUIMessage(row)]);
		for (const item of [server, client]) {
			expect(item).toMatchObject({
				id: 'message:card-1',
				kind: 'status',
				title: 'Out-of-date check',
				summary: card.headline
			});
			expect(item!.entityRefs.map((ref) => ref.id)).toEqual([
				card.projectId,
				...card.items.map((cardItem) => cardItem.entity.id)
			]);
		}
	});
});

describe('freshness card view helpers', () => {
	it('formats clamped whole percentages', () => {
		expect(formatFreshnessPercent(0.816)).toBe('82%');
		expect(formatFreshnessPercent(1.4)).toBe('100%');
		expect(formatFreshnessPercent(Number.NaN)).toBe('0%');
	});

	it('links entities into the project page, documents by ?doc=', () => {
		expect(freshnessEntityHref('p 1', { kind: 'task', id: 't1' })).toBe(
			'/projects/p%201?entity=task&entity_id=t1'
		);
		expect(freshnessEntityHref('p1', { kind: 'document', id: 'd1' })).toBe(
			'/projects/p1?doc=d1'
		);
	});

	it('uses the worker prompt for Draft in chat and a plain default otherwise', () => {
		const [drafted, , surfaced] = freshnessCardFixture().items;
		expect(draftInChatPromptFor(surfaced!)).toBe(
			'Update "Launch plan" to reflect what I just said.'
		);
		expect(draftInChatPromptFor({ ...drafted!, draftInChatPrompt: 'Custom' })).toBe('Custom');
	});

	it('maps flag and bundle statuses to what the card says', () => {
		expect(freshnessItemState('open')).toBe('open');
		expect(freshnessItemState('applied')).toBe('updated');
		expect(freshnessItemState('dismissed')).toBe('not_stale');
		expect(freshnessItemState('superseded')).toBe('replaced');
		expect(freshnessBundleState('pending')).toBe('pending');
		expect(freshnessBundleState('superseded')).toBe('replaced');
		expect(freshnessBundleState('rejected')).toBe('dismissed');
		expect(freshnessBundleState(undefined)).toBe('none');
	});

	it('prefers a local action result over the fetched status', () => {
		const status: FreshnessScanStatusV1 = {
			version: 'freshness_scan_status_v1',
			scanId: 'scan-1',
			flags: { f1: { status: 'applied', disposition: 'auto_applied', undoable: true } },
			bundle: null
		};
		expect(freshnessFlagView('f1', status, {})).toMatchObject({
			status: 'applied',
			undoable: true
		});
		expect(freshnessFlagView('f1', status, { f1: 'undone' })).toMatchObject({
			status: 'undone',
			undoable: false
		});
		expect(freshnessFlagView('missing', null, {}).status).toBe('open');
	});

	it('offers undo only inside the window and while a flag is undoable', () => {
		const status: FreshnessScanStatusV1 = {
			version: 'freshness_scan_status_v1',
			scanId: 'scan-1',
			flags: {
				f1: { status: 'applied', disposition: 'auto_applied', undoable: true },
				f2: { status: 'undone', disposition: 'auto_applied', undoable: false }
			},
			bundle: null
		};
		const now = Date.parse('2026-09-18T16:00:00.000Z');
		const base = { status, local: {}, now };
		expect(
			hasUndoableFlags({ ...base, flagIds: ['f1'], undoableUntil: '2026-09-21T15:00:00Z' })
		).toBe(true);
		expect(
			hasUndoableFlags({ ...base, flagIds: ['f1'], undoableUntil: '2026-09-18T15:00:00Z' })
		).toBe(false);
		expect(
			hasUndoableFlags({ ...base, flagIds: ['f2'], undoableUntil: '2026-09-21T15:00:00Z' })
		).toBe(false);
		expect(hasUndoableFlags({ ...base, flagIds: [], undoableUntil: null })).toBe(false);
		expect(retiredUndoableUntil(freshnessCardFixture())).toBe('2026-09-21T15:01:00.000Z');
	});

	it('counts bundle operations minus drafted items marked current', () => {
		const card = freshnessCardFixture();
		expect(remainingBundleOperationCount(card, null, {})).toBe(2);
		expect(remainingBundleOperationCount(card, null, { 'flag-task': 'dismissed' })).toBe(1);
		// A surfaced item marked current was never in the bundle.
		expect(remainingBundleOperationCount(card, null, { 'flag-doc': 'dismissed' })).toBe(2);
		expect(remainingBundleOperationCount({ ...card, bundle: null }, null, {})).toBe(0);
	});

	it('describes undo results in a few words', () => {
		expect(
			describeUndoResult(
				{
					version: 'freshness_undo_v1',
					undone: ['a', 'b'],
					skipped: [{ flagId: 'c', reason: 'changed_since' }]
				},
				'auto-update'
			)
		).toBe('Undid 2 auto-updates · 1 changed since, left as is');
		expect(
			describeUndoResult(
				{
					version: 'freshness_undo_v1',
					undone: [],
					skipped: [{ flagId: 'a', reason: 'already_undone' }]
				},
				'inbox item'
			)
		).toBe('Already undone');
	});
});

describe('freshness card network actions', () => {
	it('approves the bundle through the existing suggestion route', async () => {
		const fetchFn = vi.fn(async () =>
			apiResponse({
				suggestion: { status: 'applied' },
				result: { ok: true, applied_operations: 2 }
			})
		);
		const outcome = await approveFreshnessBundle('p1', 's1', fetchFn as typeof fetch);
		expect(fetchFn).toHaveBeenCalledWith(
			'/api/onto/projects/p1/suggestions/s1',
			expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'approve' }) })
		);
		expect(outcome).toMatchObject({ status: 'applied', appliedOperations: 2, failed: false });
	});

	it('undoes named flags and marks a flag not stale on the freshness routes', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(
				apiResponse({ version: 'freshness_undo_v1', undone: ['f1'], skipped: [] })
			)
			.mockResolvedValueOnce(
				apiResponse({ flag: { status: 'dismissed' }, suggestionId: 'bundle-2' })
			);
		const undo = await undoFreshnessScan('p1', 'scan-1', ['f1'], fetchFn);
		expect(undo.undone).toEqual(['f1']);
		expect(fetchFn.mock.calls[0]![0]).toBe('/api/onto/projects/p1/freshness/scans/scan-1/undo');
		expect(JSON.parse(fetchFn.mock.calls[0]![1].body)).toEqual({ flag_ids: ['f1'] });

		const marked = await markFreshnessFlagNotStale('p1', 'f2', fetchFn);
		expect(fetchFn.mock.calls[1]![0]).toBe('/api/onto/projects/p1/freshness/flags/f2');
		expect(JSON.parse(fetchFn.mock.calls[1]![1].body)).toEqual({ action: 'not_stale' });
		expect(marked).toEqual({ flagStatus: 'dismissed', suggestionId: 'bundle-2' });
	});

	it('surfaces the server error and status', async () => {
		const fetchFn = vi.fn(async () => apiResponse('This proposal can no longer apply', 409));
		await expect(
			approveFreshnessBundle('p1', 's1', fetchFn as typeof fetch)
		).rejects.toMatchObject({
			status: 409,
			message: 'This proposal can no longer apply'
		});
	});
});

// Lane B writes a real worker-built card; parse it once it lands (plan §8, H4).
const workerFixturePath = fileURLToPath(
	new URL('../../../../../worker/tests/fixtures/freshness-card.v1.json', import.meta.url)
);
describe('worker card fixture', () => {
	it.skipIf(!existsSync(workerFixturePath))(
		'parses the worker-built card and renders it as a card message',
		() => {
			const raw = JSON.parse(readFileSync(workerFixturePath, 'utf8')) as unknown;
			const payload = (
				raw && typeof raw === 'object' && 'card' in raw
					? (raw as { card: unknown }).card
					: raw
			) as FreshnessCardPayloadV1;
			const message = buildFreshnessCardUIMessage({
				id: 'worker-card',
				content: 'fallback',
				metadata: freshnessCardMetadata(payload)
			});
			expect(message.type).toBe('freshness_card');
			expect(message.data.card.version).toBe('freshness_card_v1');
		}
	);
});
