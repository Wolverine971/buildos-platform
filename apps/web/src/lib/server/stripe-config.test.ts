// apps/web/src/lib/server/stripe-config.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import { isStripeEnabled } from './stripe-config';

describe('Stripe feature gate without the payment SDK', () => {
	it.each([
		{ config: {}, enabled: false },
		{ config: { PRIVATE_ENABLE_STRIPE: 'true' }, enabled: false },
		{ config: { PRIVATE_STRIPE_SECRET_KEY: 'sk_test_unit' }, enabled: false },
		{
			config: { PRIVATE_ENABLE_STRIPE: 'true', PRIVATE_STRIPE_SECRET_KEY: 'sk_test_unit' },
			enabled: true
		},
		{ config: { ENABLE_STRIPE: 'true', STRIPE_SECRET_KEY: 'sk_test_unit' }, enabled: true },
		{
			config: {
				PRIVATE_ENABLE_STRIPE: 'false',
				ENABLE_STRIPE: 'true',
				STRIPE_SECRET_KEY: 'sk_test_unit'
			},
			enabled: false
		},
		{
			config: {
				PRIVATE_ENABLE_STRIPE: 'true',
				PRIVATE_STRIPE_SECRET_KEY: '',
				STRIPE_SECRET_KEY: 'sk_test_unit'
			},
			enabled: false
		}
	])('preserves flag/key precedence: $config', ({ config, enabled }) => {
		expect(isStripeEnabled(config)).toBe(enabled);
	});
});
