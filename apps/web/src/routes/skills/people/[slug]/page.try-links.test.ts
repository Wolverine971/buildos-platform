// apps/web/src/routes/skills/people/[slug]/page.try-links.test.ts
// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { getSkillExpertBySlug } from '$lib/skills/skill-experts';
import type { PageData } from './$types';
import ExpertPage from './+page.svelte';

const data = {
	expert: getSkillExpertBySlug('kane-kallaway'),
	relatedSkills: [
		{
			slug: 'hook-craft-short-form',
			title: 'Hook Craft For Short-Form',
			description: 'Draft and audit hooks.',
			sourceCount: 4
		}
	],
	reviewedSources: []
} as unknown as PageData;

afterEach(cleanup);

describe('skill expert page', () => {
	it('offers a Try link for each skill built from the expert’s work', () => {
		render(ExpertPage, { props: { data } });

		expect(
			screen.getByRole('heading', { name: "Skills built from this person's work" })
		).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Try in BuildOS' })).toHaveAttribute(
			'href',
			'/skills/try/hook-craft-short-form'
		);
		expect(screen.getByRole('link', { name: /Hook Craft For Short-Form/ })).toHaveAttribute(
			'href',
			'/agent-skills/hook-craft-short-form'
		);
	});
});
