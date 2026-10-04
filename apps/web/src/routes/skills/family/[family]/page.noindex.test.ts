// apps/web/src/routes/skills/family/[family]/page.noindex.test.ts
// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import FamilyPage from './+page.svelte';
import { load } from './+page.server';

async function renderFamily(family: string) {
	const data = (await load({
		params: { family }
	} as unknown as Parameters<typeof load>[0])) as PageData;
	render(FamilyPage, { props: { data } });
	return document.head.querySelector('meta[name="robots"]')?.getAttribute('content');
}

afterEach(() => {
	cleanup();
	document.head.innerHTML = '';
});

describe('skill family page robots', () => {
	it('noindexes one-skill families and keeps real families indexable', async () => {
		expect(await renderFamily('connected-tools')).toBe('noindex, follow');
		cleanup();
		document.head.innerHTML = '';
		expect(await renderFamily('conversion-paths')).toBe('noindex, follow');
		cleanup();
		document.head.innerHTML = '';
		expect(await renderFamily('cold-outreach')).toBe('index, follow');
	});
});
