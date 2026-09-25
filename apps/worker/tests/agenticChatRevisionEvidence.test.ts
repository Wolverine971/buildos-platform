// apps/worker/tests/agenticChatRevisionEvidence.test.ts
import { describe, expect, it } from 'vitest';
import { buildMutationBatch } from '@buildos/agentic-chat-runtime/loop';
import type { JsonObject } from '@buildos/shared-types';
import { checkMutationBatchRevisionEvidence } from '../src/workers/agentic-chat/provider/review/revision-evidence';

const batch = buildMutationBatch([
	{
		id: 'create-1',
		name: 'create_onto_task',
		canonicalProviderArguments: JSON.stringify({
			priority: 2,
			title: 'Permit',
			props: { enabled: false, value: null }
		})
	}
]);
const check = (required: unknown, path: string[] = ['priority']) => ({
	call: 1,
	argument_path: path,
	required_value: required
});
const inspect = (checks: unknown) =>
	checkMutationBatchRevisionEvidence({ argument_checks: checks } as JsonObject, batch);

describe('revision evidence against exact held arguments', () => {
	it('detects the Case 2 priority 2 to priority 2 contradiction without changing the batch', () => {
		const before = JSON.stringify(batch);
		expect(inspect([check(2)])).toBe('revision_value_unchanged');
		expect(JSON.stringify(batch)).toBe(before);
	});
	it('keeps a real correction that sits next to an already-satisfied check', () => {
		expect(inspect([check(2), check('Permit application', ['title'])])).toBeNull();
		expect(inspect([check(2), check('Permit', ['title'])])).toBe('revision_value_unchanged');
	});
	it('preserves real corrections, exact scalar types, and structural/prose rejection', () => {
		expect(inspect([check(1)])).toBeNull();
		expect(inspect([check('2')])).toBeNull();
		expect(inspect([check('permit', ['title'])])).toBeNull();
		expect(inspect([])).toBeNull();
		expect(
			checkMutationBatchRevisionEvidence({ reason: 'Uncommissioned description edit' }, batch)
		).toBeNull();
	});
	it.each([
		[false, ['props', 'enabled']],
		[null, ['props', 'value']]
	])('compares nested falsy values exactly (%s)', (value, path) => {
		expect(inspect([check(value, path as string[])])).toBe('revision_value_unchanged');
	});
	it.each([
		null,
		{},
		Array(21).fill(check(1)),
		[{ ...check(2), call: 0 }],
		[{ ...check(2), call: 2 }],
		[{ ...check(2), call: 1.5 }],
		[check(2, [])],
		[check(2, ['missing'])],
		[check(2, ['__proto__'])],
		[check({}, ['priority'])],
		[check('x'.repeat(161))],
		[{ call: 1, argument_path: ['priority'] }],
		[check(2), check(2, ['missing'])]
	])('rejects malformed or unbound comparison evidence %#', (checks) => {
		expect(inspect(checks)).toBe('revision_evidence_invalid');
	});
});
