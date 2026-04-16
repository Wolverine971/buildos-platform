// apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.test.ts
import { describe, expect, it } from 'vitest';
import { findDurableTextViolations } from './durable-text-validation';

describe('durable text validation', () => {
	it('detects internal parameter markup in nested durable payloads', () => {
		const violations = findDurableTextViolations({
			document: {
				content: 'Chapter 2 notes\n<parameter name="update_strategy">replace'
			}
		});

		expect(violations).toHaveLength(1);
		expect(violations[0]).toMatchObject({
			path: 'args.document.content',
			matchedPattern: 'parameter_tag'
		});
	});

	it('allows normal markdown and angle-bracket prose', () => {
		const violations = findDurableTextViolations({
			content: 'Use <aside> for notes and compare x < y in the example.'
		});

		expect(violations).toEqual([]);
	});
});
