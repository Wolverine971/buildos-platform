// apps/worker/tests/chatGlobalCaptureAttribution.test.ts
import { parseContextSelectionEventV1 } from '@buildos/shared-types';
import { describe, expect, it } from 'vitest';
import {
	attributeGlobalTurns,
	globalCaptureUserIds,
	receiptsForMessages
} from '../src/workers/chat/checkpoint/globalAttribution';

const REDLINE = '30000000-0000-4000-8000-000000000003';
const TACEMUS = '30000000-0000-4000-8000-000000000004';

function receipt(
	clientTurnId: string,
	scope: 'projects' | 'portfolio' | 'none',
	projects: { id: string; p: number }[],
	status = 'selected'
) {
	return {
		type: 'context_selection',
		version: 1,
		mode: 'on',
		visible: true,
		injected: true,
		status,
		failure: null,
		client_turn_id: clientTurnId,
		turn_run_id: `run-${clientTurnId}`,
		project_id: null,
		workspace: { scope, dig: true, checked: 46 },
		projects: projects.map((p) => ({ ...p, name: p.id, hop2: 'ran' })),
		items: [],
		counts: { full: 0, summary: 0, checked: 46 },
		elapsed_ms: 500
	};
}
const parsed = (value: unknown) => parseContextSelectionEventV1(value);

describe('attributeGlobalTurns', () => {
	it('attributes turns that all clearly name the same project; chit-chat is neutral', () => {
		expect(
			attributeGlobalTurns([
				parsed(receipt('a', 'projects', [{ id: REDLINE, p: 0.94 }])),
				parsed(receipt('b', 'none', [])),
				parsed(
					receipt('c', 'projects', [
						{ id: REDLINE, p: 0.9 },
						{ id: TACEMUS, p: 0.5 }
					])
				)
			])
		).toBe(REDLINE);
	});

	it('refuses mixed, weak, ambiguous, portfolio, failed or missing receipts', () => {
		const clear = parsed(receipt('a', 'projects', [{ id: REDLINE, p: 0.94 }]));
		expect(
			attributeGlobalTurns([
				clear,
				parsed(receipt('b', 'projects', [{ id: TACEMUS, p: 0.9 }]))
			])
		).toBeNull();
		expect(
			attributeGlobalTurns([parsed(receipt('a', 'projects', [{ id: REDLINE, p: 0.6 }]))])
		).toBeNull();
		expect(
			attributeGlobalTurns([
				parsed(
					receipt('a', 'projects', [
						{ id: REDLINE, p: 0.94 },
						{ id: TACEMUS, p: 0.86 }
					])
				)
			])
		).toBeNull();
		expect(
			attributeGlobalTurns([parsed(receipt('a', 'portfolio', [{ id: REDLINE, p: 0.9 }]))])
		).toBeNull();
		expect(
			attributeGlobalTurns([
				parsed(receipt('a', 'projects', [{ id: REDLINE, p: 0.9 }], 'unavailable'))
			])
		).toBeNull();
		expect(attributeGlobalTurns([clear, null])).toBeNull();
		expect(attributeGlobalTurns([parsed(receipt('a', 'none', []))])).toBeNull();
	});
});

describe('receiptsForMessages', () => {
	it('matches receipts by client turn id, preferring a retried turn’s later receipt', () => {
		const events = [
			{ payload: receipt('a', 'projects', [{ id: TACEMUS, p: 0.9 }]) },
			{ payload: receipt('a', 'projects', [{ id: REDLINE, p: 0.9 }]) },
			{ payload: { junk: true } }
		];
		const receipts = receiptsForMessages(
			[
				{ id: 'm1', clientTurnId: 'a' },
				{ id: 'm2', clientTurnId: null },
				{ id: 'm3', clientTurnId: 'zzz' }
			],
			events
		);
		expect(receipts[0]!.projects[0]!.id).toBe(REDLINE);
		expect(receipts.slice(1)).toEqual([null, null]);
	});
});

describe('globalCaptureUserIds', () => {
	it('keeps only uuid-shaped ids, lowercased', () => {
		expect(globalCaptureUserIds(' 255735AD-A34B-4CA9-942C-397ED8CC1435 , nope, ')).toEqual([
			'255735ad-a34b-4ca9-942c-397ed8cc1435'
		]);
		expect(globalCaptureUserIds(undefined)).toEqual([]);
	});
});
