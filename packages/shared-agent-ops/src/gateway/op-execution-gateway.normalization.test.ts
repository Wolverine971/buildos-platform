// packages/shared-agent-ops/src/gateway/op-execution-gateway.normalization.test.ts
import { describe, expect, it } from 'vitest';
import { applyArchivedFilter } from './op-execution-gateway.normalization';

function recorder() {
	const calls: unknown[][] = [];
	const query = {
		is: (...args: unknown[]) => (calls.push(['is', ...args]), query),
		not: (...args: unknown[]) => (calls.push(['not', ...args]), query)
	};
	return { query, calls };
}

describe('applyArchivedFilter', () => {
	it('reads archived tasks whether or not deleted_at is set', () => {
		const { query, calls } = recorder();
		applyArchivedFilter(query, true, 'task');
		expect(calls).toEqual([['not', 'archived_at', 'is', null]]);
	});

	it('keeps deleted rows out of every other archive read', () => {
		const { query, calls } = recorder();
		applyArchivedFilter(query, true);
		expect(calls).toEqual([
			['is', 'deleted_at', null],
			['not', 'archived_at', 'is', null]
		]);
	});

	it('active reads exclude both deleted and archived rows', () => {
		const { query, calls } = recorder();
		applyArchivedFilter(query, false, 'task');
		expect(calls).toEqual([
			['is', 'deleted_at', null],
			['is', 'archived_at', null]
		]);
	});
});
