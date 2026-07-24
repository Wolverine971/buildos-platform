import { describe, expect, it } from 'vitest';
import { toJsonValue } from './prompt-json';

describe('toJsonValue', () => {
	it('maps undefined to null and preserves JSON primitives', () => {
		expect(toJsonValue(undefined)).toBeNull();
		expect(toJsonValue(null)).toBeNull();
		expect(toJsonValue('value')).toBe('value');
		expect(toJsonValue(42)).toBe(42);
		expect(toJsonValue(false)).toBe(false);
	});

	it('creates a JSON-safe copy of arrays and objects', () => {
		const input = {
			label: 'test',
			omitted: undefined,
			nested: [{ createdAt: new Date('2026-07-24T00:00:00.000Z') }]
		};

		expect(toJsonValue(input)).toEqual({
			label: 'test',
			nested: [{ createdAt: '2026-07-24T00:00:00.000Z' }]
		});
		expect(toJsonValue(input)).not.toBe(input);
	});

	it('stringifies non-JSON scalar values', () => {
		expect(toJsonValue(Symbol.for('prompt-eval'))).toBe('Symbol(prompt-eval)');
	});
});
