// apps/web/src/lib/server/agent-call/agent-call-policy.test.ts
//
// Fail-closed guarantees for stored caller policies. A recorded allowed_ops
// list must never widen at read time: malformed values and unrecognized
// (renamed/removed) ops narrow the surface instead of falling back to the
// full mode default.
import { describe, expect, it } from 'vitest';
import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_SUPPORTED_OPS } from '@buildos/shared-types';
import { extractAllowedOpsFromPolicy } from './agent-call-policy';

describe('extractAllowedOpsFromPolicy', () => {
	it('returns mode defaults when the policy records no allowed_ops', () => {
		expect(extractAllowedOpsFromPolicy(null, 'read_only')).toEqual([...BUILDOS_AGENT_READ_OPS]);
		expect(extractAllowedOpsFromPolicy({}, 'read_write')).toEqual([
			...BUILDOS_AGENT_SUPPORTED_OPS
		]);
		expect(extractAllowedOpsFromPolicy({ allowed_ops: null }, 'read_only')).toEqual([
			...BUILDOS_AGENT_READ_OPS
		]);
	});

	it('preserves and dedupes a valid recorded allowlist', () => {
		expect(
			extractAllowedOpsFromPolicy(
				{ allowed_ops: ['onto.task.create', 'onto.task.update', 'onto.task.create'] },
				'read_write'
			)
		).toEqual(['onto.task.create', 'onto.task.update']);
	});

	it('drops an unrecognized op but keeps the rest of the whitelist (no widening)', () => {
		const extracted = extractAllowedOpsFromPolicy(
			{ allowed_ops: ['onto.task.create', 'onto.removed.legacy_op', 'onto.task.update'] },
			'read_write'
		);
		expect(extracted).toEqual(['onto.task.create', 'onto.task.update']);
		// Regression: this case used to fall back to defaultAllowedOpsForMode and
		// silently grant the entire read_write op surface.
		expect(extracted).not.toContain('onto.project.update');
		expect(extracted.length).toBeLessThan(BUILDOS_AGENT_SUPPORTED_OPS.length);
	});

	it('treats a non-array allowed_ops value as allow-nothing', () => {
		expect(extractAllowedOpsFromPolicy({ allowed_ops: 'all' }, 'read_write')).toEqual([]);
		expect(extractAllowedOpsFromPolicy({ allowed_ops: { op: 'x' } }, 'read_only')).toEqual([]);
	});

	it('drops write ops under read_only mode without discarding the read ops', () => {
		expect(
			extractAllowedOpsFromPolicy(
				{ allowed_ops: ['onto.task.get', 'onto.task.create'] },
				'read_only'
			)
		).toEqual(['onto.task.get']);
	});

	it('returns an empty surface for an explicitly empty allowlist', () => {
		expect(extractAllowedOpsFromPolicy({ allowed_ops: [] }, 'read_write')).toEqual([]);
	});
});
