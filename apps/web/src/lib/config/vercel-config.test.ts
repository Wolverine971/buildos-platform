import { describe, expect, it } from 'vitest';
import vercelConfig from '../../../../../vercel.json';

describe('Vercel compatibility redirects', () => {
	it('aliases the unsized legacy precomposed Apple touch icon', () => {
		expect(vercelConfig.redirects).toContainEqual({
			source: '/apple-touch-icon-precomposed.png',
			destination: '/apple-touch-icon.png',
			permanent: true
		});
	});
});
