// apps/web/src/lib/skills/skill-gallery.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildPackCards,
	buildPackLaunchPrompt,
	buildPreviewSkillLaunchPrompt,
	buildSkillLaunchPrompt,
	getFamilyId,
	getFamilyPath,
	getPreviewSearchText,
	getPreviewSkillPath,
	getSkillSearchMatches,
	getTryInBuildOsPath,
	getTryPackInBuildOsPath,
	groupSkillsByFamily,
	type GallerySkill,
	type RuntimeSkillGalleryPreview
} from './skill-gallery';

function gallerySkill(slug: string, overrides: Partial<GallerySkill> = {}): GallerySkill {
	return {
		slug,
		title: slug,
		description: `${slug} description`,
		skill_type: 'orchestration',
		skill_category: 'marketing-and-content',
		references: [],
		...overrides
	};
}

describe('skill gallery discovery helpers', () => {
	it('builds stable family IDs and routes', () => {
		expect(getFamilyId('Cold Outreach')).toBe('cold-outreach');
		expect(getFamilyPath({ name: 'Cold Outreach' })).toBe('/skills/family/cold-outreach');

		const [family] = groupSkillsByFamily([
			gallerySkill('cold-email-engagement-first-outreach', {
				skill_type: 'orchestration'
			})
		]);
		expect(family).toMatchObject({
			id: 'cold-outreach',
			name: 'Cold Outreach'
		});
	});

	it('preserves the selected starter prompt in the Try URL and launch draft', () => {
		const skill = gallerySkill('hook-craft-short-form', {
			title: 'Hook Craft For Short-Form'
		});
		const selectedPrompt = 'Audit this opener for clarity, curiosity, and payoff.';

		expect(getTryInBuildOsPath(skill, selectedPrompt)).toBe(
			`/skills/try/hook-craft-short-form?prompt=${encodeURIComponent(selectedPrompt)}`
		);
		expect(buildSkillLaunchPrompt(skill, undefined, selectedPrompt)).toContain(
			`Starting ask: ${selectedPrompt}`
		);
	});

	it('builds safe preview paths, search text, and launch drafts', () => {
		const preview = {
			publication_status: 'preview',
			slug: 'cold-email-offer-lab',
			title: 'Cold Email Offer Lab',
			description: 'Design a useful artifact offer.',
			runtime_skill_id: 'cold_email_offer_lab',
			domain_id: 'sales-and-growth',
			family: 'Cold Outreach',
			output_shapes: ['artifact offer'],
			workflow: ['Choose the smallest useful yes.'],
			use_cases: ['Repair a meeting-first ask.'],
			guardrails: ['Do not send automatically.'],
			starter_prompts: ['Repair this offer.'],
			trust: {
				eval_status: 'covered',
				last_updated: '2026-07-10',
				safety_notes: ['Editable draft only.']
			}
		} satisfies RuntimeSkillGalleryPreview;

		expect(getPreviewSkillPath(preview)).toBe('/skills/preview/cold-email-offer-lab');
		expect(getPreviewSearchText(preview)).toContain('meeting-first');
		expect(buildPreviewSkillLaunchPrompt(preview)).toContain(
			'Starting ask: Repair this offer.'
		);
		expect(buildPreviewSkillLaunchPrompt(preview)).toContain(
			'pause before any external action'
		);
	});

	it('builds a full ordered pack launch prompt with handoff rules', () => {
		const skills = [
			gallerySkill('hook-craft-short-form'),
			gallerySkill('story-driven-content-craft'),
			gallerySkill('viral-content-for-boring-brands')
		];
		const pack = buildPackCards(skills).find((item) => item.id === 'founder-content-pack');

		expect(pack).toBeTruthy();
		expect(getTryPackInBuildOsPath(pack!)).toBe('/skills/try/path/founder-content-pack');
		const prompt = buildPackLaunchPrompt(pack!);
		expect(prompt.length).toBeLessThan(2400);
		expect(prompt).toContain('Run the Founder Content Pack as one ordered pack workflow.');
		expect(prompt).toContain('1. Hook');
		expect(prompt).toContain('2. Story');
		expect(prompt).toContain('Handoff rules:');
		expect(prompt).toContain('Carry the chosen hook');
	});

	it('explains search matches from use cases and public reference summaries', () => {
		const skill = gallerySkill('hook-craft-short-form', {
			title: 'Hook Craft For Short-Form',
			references: [
				{
					id: 'hook.public-audit',
					name: 'Public Hook Audit',
					summary: 'Diagnose clarity and payoff before publishing.',
					path: 'references/public-hook-audit.md',
					url: '/agent-skills/hook/references/public-hook-audit.md',
					when_to_load: ['When an opener needs a diagnostic.']
				}
			]
		});

		expect(getSkillSearchMatches(skill, undefined, 'payoff')).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: 'Reference',
					value: expect.stringContaining('payoff')
				})
			])
		);
	});
});
