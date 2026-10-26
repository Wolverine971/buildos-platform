// apps/web/src/lib/components/builder-profile/SocialIcon.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { PLATFORM_LABELS, type SocialPlatform } from '$lib/builder-profile/links';
import SocialIcon from './SocialIcon.svelte';

afterEach(cleanup);

const brands = (Object.keys(PLATFORM_LABELS) as SocialPlatform[]).filter((p) => p !== 'website');

describe('SocialIcon', () => {
	it('draws the real X mark, not a plain cross', () => {
		const { container } = render(SocialIcon, { platform: 'x' });
		const path = container.querySelector('svg path')?.getAttribute('d') ?? '';
		expect(path.startsWith('M14.234 10.162')).toBe(true);
		expect(path).not.toContain('M4 4l16 16');
	});

	it.each(brands)('draws a filled brand mark for %s', (platform) => {
		const { container } = render(SocialIcon, { platform });
		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('fill')).toBe('currentColor');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
		expect(svg?.querySelector('path')?.getAttribute('d')?.length).toBeGreaterThan(40);
	});

	it('draws a globe for a plain website', () => {
		const { container } = render(SocialIcon, { platform: 'website' });
		expect(container.querySelector('svg')?.getAttribute('class')).toContain('lucide');
	});
});
