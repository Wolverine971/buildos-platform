// apps/web/src/routes/skills/preview/[slug]/page.funnel.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { PageData } from './$types';
import PreviewPage from './+page.svelte';

const data = {
	preview: {
		publication_status: 'preview',
		slug: 'cold-email-offer-lab',
		title: 'Cold Email Offer Lab',
		description: 'Shape the offer before the email.',
		runtime_skill_id: 'cold_email_offer_lab',
		parent_id: 'cold_email_engagement_first_outreach',
		skill_type: 'child',
		domain_id: 'sales-and-growth',
		family: 'Cold Outreach',
		output_shapes: ['offer draft'],
		workflow: ['Name the outcome.'],
		use_cases: ['Tighten an offer.'],
		guardrails: ['Do not send anything.'],
		starter_prompts: ['Help me tighten this offer.'],
		trust: { eval_status: 'not-covered', last_updated: '2026-07-10', safety_notes: [] }
	},
	domain: null,
	relatedPreviews: [],
	coverage: { runtime_total: 1, public_total: 0, preview_total: 1, internal_total: 0 },
	catalogVersion: '2026-07-10'
} as unknown as PageData;

afterEach(() => {
	cleanup();
	document.head.innerHTML = '';
});

describe('skill preview page', () => {
	it('stays out of search and drops the eval / not-portable label', () => {
		render(PreviewPage, { props: { data } });

		expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute(
			'content',
			'noindex, follow'
		);
		expect(screen.queryByText(/not yet portable/i)).toBeNull();
		expect(screen.queryByText(/not-covered/)).toBeNull();
		expect(screen.getByText('Runs inside BuildOS')).toBeInTheDocument();
		expect(screen.getAllByText(/Free to start/).length).toBeGreaterThan(0);
	});
});
