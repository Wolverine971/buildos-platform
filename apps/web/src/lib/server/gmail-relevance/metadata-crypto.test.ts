// apps/web/src/lib/server/gmail-relevance/metadata-crypto.test.ts
import { describe, expect, it } from 'vitest';
import {
	decryptEmailRelevanceValue,
	encryptEmailRelevanceValue,
	hashEmailRelevanceValue
} from './metadata-crypto';

const secret = 'invented-gmail-relevance-secret-with-at-least-32-bytes';
const context = {
	userId: '11111111-1111-4111-8111-111111111111',
	connectionScopeId: '22222222-2222-4222-8222-222222222222',
	kind: 'provider_message' as const
};

describe('email relevance protected values', () => {
	it('encrypts with authenticated user/scope/kind context', () => {
		const envelope = encryptEmailRelevanceValue('synthetic_provider_id', context, { secret });
		expect(envelope).toMatch(/^enc:gmail-relevance:v1\./);
		expect(envelope).not.toContain('synthetic_provider_id');
		expect(decryptEmailRelevanceValue(envelope, context, { secret })).toBe(
			'synthetic_provider_id'
		);
		expect(() =>
			decryptEmailRelevanceValue(
				envelope,
				{ ...context, connectionScopeId: '33333333-3333-4333-8333-333333333333' },
				{ secret }
			)
		).toThrow('protected value is unavailable');
	});

	it('creates deterministic keyed per-user/scope hashes without exposing the value', () => {
		const first = hashEmailRelevanceValue('synthetic_provider_id', context, { secret });
		const second = hashEmailRelevanceValue('synthetic_provider_id', context, { secret });
		expect(first).toBe(second);
		expect(first).toMatch(/^[a-f0-9]{64}$/);
		expect(
			hashEmailRelevanceValue(
				'synthetic_provider_id',
				{ ...context, userId: '44444444-4444-4444-8444-444444444444' },
				{ secret }
			)
		).not.toBe(first);
	});
});
