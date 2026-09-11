// packages/shared-agent-ops/src/gateway/task-estimate.test.ts
import { describe, expect, it } from 'vitest';
import { reconcileLegacyTaskEstimate } from './task-estimate';

describe('legacy task estimate correction', () => {
	const description = 'Allow 90 minutes. Depends on Permit. Keep the 90-day warranty.';
	const existing = {
		description,
		props: { duration_minutes: 90, description, retained: { exact: true } }
	};
	it('corrects only the generated prefix and its legacy mirror', () => {
		const updates = { props: { ...existing.props, duration_minutes: 120 } };
		expect(reconcileLegacyTaskEstimate(existing, updates)).toBe(true);
		expect(updates).toEqual({
			description: description.replace('Allow 90', 'Allow 120'),
			props: {
				...existing.props,
				duration_minutes: 120,
				description: description.replace('Allow 90', 'Allow 120')
			}
		});
		expect(existing.description).toBe(description);
	});
	it('preserves explicit replacement text and synchronizes the old mirror', () => {
		const updates = {
			description: 'Depends on Permit.',
			props: { ...existing.props, duration_minutes: 120 }
		};
		expect(reconcileLegacyTaskEstimate(existing, updates)).toBe(false);
		expect(updates.props.description).toBe('Depends on Permit.');
	});
	it('does not infer missing estimates or rewrite incidental prose', () => {
		for (const previous of [
			{ description, props: {} },
			{ ...existing, description: 'The meeting was 90 minutes. Allow 90 minutes.' }
		]) {
			const updates = { props: { duration_minutes: 120, retained: true } };
			expect(reconcileLegacyTaskEstimate(previous, updates)).toBe(false);
			expect(updates).toEqual({ props: { duration_minutes: 120, retained: true } });
		}
	});
});
