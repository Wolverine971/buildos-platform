// packages/agentic-chat-runtime/src/loop/mutation-batch.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildMutationBatch,
	describeMutationBatchCall,
	mutationBatchFulfilment,
	mutationBatchSha256,
	mutationBatchesMatch,
	parseApprovedMutationBatch,
	serializeMutationBatchForReview
} from './mutation-batch';
import type { WriteLedgerEntry } from './write-ledger';

function streamed(name: string, args: Record<string, unknown>, id = `${name}-1`) {
	return { id, name, canonicalProviderArguments: JSON.stringify(args) };
}

function success(toolName: string): WriteLedgerEntry {
	return { toolName, status: 'success' };
}

function failure(toolName: string): WriteLedgerEntry {
	return { toolName, status: 'failure' };
}

describe('mutation batch digest', () => {
	it('covers tool names, arguments and ordering', () => {
		const base = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);
		const differentValue = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-19' })
		]);
		const differentTool = buildMutationBatch([
			streamed('create_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);

		expect(mutationBatchSha256(base)).not.toBe(mutationBatchSha256(differentValue));
		expect(mutationBatchSha256(base)).not.toBe(mutationBatchSha256(differentTool));
	});

	it('changes when two calls swap order, because order expresses dependency', () => {
		const forward = buildMutationBatch([
			streamed('create_onto_task', { title: 'Permit' }, 'a'),
			streamed('create_onto_task', { title: 'Cabinets' }, 'b')
		]);
		const reversed = buildMutationBatch([
			streamed('create_onto_task', { title: 'Cabinets' }, 'b'),
			streamed('create_onto_task', { title: 'Permit' }, 'a')
		]);

		expect(mutationBatchSha256(forward)).not.toBe(mutationBatchSha256(reversed));
	});

	// A provider retry re-streams the same proposal with fresh call ids. That is
	// the same batch and must not force a second paid review.
	it('ignores provider call ids so a re-streamed proposal keeps its approval', () => {
		const first = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1' }, 'call_1')
		]);
		const retried = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1' }, 'call_9')
		]);

		expect(mutationBatchesMatch(first, retried)).toBe(true);
	});

	it('shows the reviewer the real arguments, not a description of them', () => {
		const batch = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);

		expect(serializeMutationBatchForReview(batch)).toEqual([
			{
				call: 1,
				tool: 'update_onto_task',
				arguments: '{"task_id":"t1","due_at":"2026-09-18"}'
			}
		]);
	});
});

describe('mutation batch fulfilment', () => {
	it('counts each approved call against one successful write', () => {
		const batch = buildMutationBatch([
			streamed('create_onto_task', { title: 'One' }, 'a'),
			streamed('create_onto_task', { title: 'Two' }, 'b'),
			streamed('link_onto_entities', { rel: 'depends_on' }, 'c')
		]);

		const fulfilment = mutationBatchFulfilment(batch, [
			success('create_onto_task'),
			success('create_onto_task'),
			failure('link_onto_entities')
		]);

		expect(fulfilment.executed).toHaveLength(2);
		expect(fulfilment.unfulfilled.map((call) => call.name)).toEqual(['link_onto_entities']);
		expect(fulfilment.descriptions).toEqual(['link_onto_entities']);
	});

	it('needs two successes when the batch proposes the same call twice', () => {
		const batch = buildMutationBatch([
			streamed('create_onto_task', { title: 'One' }, 'a'),
			streamed('create_onto_task', { title: 'Two' }, 'b')
		]);

		expect(
			mutationBatchFulfilment(batch, [success('create_onto_task')].slice()).unfulfilled
		).toHaveLength(1);
	});

	// The contract lane reported a correct "nothing to change" turn as an
	// unfinished write because fulfilment was inferred from declared
	// postconditions. With no approved batch there is nothing owed.
	it('owes nothing when no batch was approved', () => {
		expect(mutationBatchFulfilment(null, [success('update_onto_task')])).toEqual({
			executed: [],
			unfulfilled: [],
			descriptions: []
		});
	});

	it('names the entity in an unfulfilled call so the disclosure is specific', () => {
		expect(
			describeMutationBatchCall({
				id: 'a',
				name: 'create_onto_task',
				canonicalArguments: JSON.stringify({ title: 'Pull the permit' })
			})
		).toBe('create_onto_task (Pull the permit)');
	});
});

describe('approved batch round trip', () => {
	it('rebuilds an approved batch from its durable record', () => {
		const batch = buildMutationBatch([
			streamed('update_onto_task', { task_id: 't1', due_at: '2026-09-18' })
		]);
		const restored = parseApprovedMutationBatch(JSON.parse(JSON.stringify(batch)));

		expect(restored).not.toBeNull();
		expect(mutationBatchSha256(restored!)).toBe(mutationBatchSha256(batch));
	});

	it('refuses a malformed or unversioned record instead of guessing', () => {
		expect(parseApprovedMutationBatch(null)).toBeNull();
		expect(parseApprovedMutationBatch({ version: 2, calls: [] })).toBeNull();
		expect(parseApprovedMutationBatch({ version: 1, calls: [{ name: 'x' }] })).toBeNull();
		expect(parseApprovedMutationBatch({ version: 1, calls: 'nope' })).toBeNull();
	});
});
