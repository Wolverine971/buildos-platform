import { describe, expect, it } from 'vitest';
import { normalizeAgentRunAllowedOps } from './normalization';

describe('normalizeAgentRunAllowedOps', () => {
	it('treats an omitted allowlist as unrestricted by this field', () => {
		expect(normalizeAgentRunAllowedOps(undefined)).toEqual({ allowedOps: null });
		expect(normalizeAgentRunAllowedOps(null)).toEqual({ allowedOps: null });
	});

	it('trims operation names while preserving order and duplicates', () => {
		expect(
			normalizeAgentRunAllowedOps([' onto.task.get ', 'onto.task.update', 'onto.task.get'])
		).toEqual({
			allowedOps: ['onto.task.get', 'onto.task.update', 'onto.task.get']
		});
	});

	it('accepts an explicit empty allowlist', () => {
		expect(normalizeAgentRunAllowedOps([])).toEqual({ allowedOps: [] });
	});

	it('rejects non-arrays and invalid array entries', () => {
		expect(normalizeAgentRunAllowedOps('onto.task.get')).toEqual({
			allowedOps: null,
			error: '`allowed_ops` must be an array of strings'
		});
		expect(normalizeAgentRunAllowedOps(['onto.task.get', '  '])).toEqual({
			allowedOps: null,
			error: '`allowed_ops` must contain only non-empty strings'
		});
		expect(normalizeAgentRunAllowedOps(['onto.task.get', 42])).toEqual({
			allowedOps: null,
			error: '`allowed_ops` must contain only non-empty strings'
		});
	});
});
