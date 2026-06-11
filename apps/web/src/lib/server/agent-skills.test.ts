import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
	buildPortableAgentSkillBundle,
	getAgentSkillMarkdown,
	getAgentSkillReference,
	loadAgentSkillIndex
} from './agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

describe('public agent skill serving', () => {
	it('builds a machine-readable index for published agent skills', async () => {
		const index = await loadAgentSkillIndex();

		expect(index.skills).toHaveLength(8);
		expect(index.skills.find((skill) => skill.slug === 'hook-craft-short-form')).toMatchObject({
			runtime_skill_id: 'hook_craft_short_form',
			skill_md_url: 'https://build-os.com/agent-skills/hook-craft-short-form/skill.md',
			portable_skill_md_url:
				'https://build-os.com/agent-skills/hook-craft-short-form/portable/SKILL.md',
			bundle_zip_url: 'https://build-os.com/agent-skills/hook-craft-short-form/bundle.zip'
		});
		expect(
			index.skills.find(
				(skill) => skill.slug === 'google-calendar-for-ai-agents-search-before-you-create'
			)
		).toMatchObject({
			runtime_skill_id: undefined,
			skill_md_url:
				'https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create/skill.md'
		});
	});

	it('serves runtime markdown when a public skill maps to a registered BuildOS skill', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'runtime',
			runtimeSkillId: 'hook_craft_short_form'
		});
		expect(result?.content).toContain('skill_id: hook-craft-short-form');
	});

	it('falls back to the embedded portable skill block when no runtime skill exists', async () => {
		const post = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'google-calendar-for-ai-agents-search-before-you-create'
		);
		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'embedded-portable'
		});
		expect(result?.content).toContain('name: google-calendar');
	});

	it('serves public reference modules and hides internal reference modules', async () => {
		const uiUxPost = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'ui-ux-quality-review');
		const publicReference = getAgentSkillReference(uiUxPost, 'foundation-checks.md');

		expect(publicReference).toMatchObject({
			runtimeSkillId: 'ui_ux_quality_review',
			referenceId: 'ui_ux_quality_review.foundation_checks'
		});
		expect(publicReference?.content).toContain('Foundation Checks');

		const coldEmailPost = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'cold-email-engagement-first-outreach'
		);
		expect(getAgentSkillReference(coldEmailPost, 'source-map.md')).toBeUndefined();
	});

	it('builds a portable skill bundle with clean frontmatter and local references', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'ui-ux-quality-review');
		const bundle = buildPortableAgentSkillBundle(post);

		expect(bundle.directory).toBe('ui-ux-quality-review');
		expect(Object.keys(bundle.files)).toEqual([
			'SKILL.md',
			'buildos.yaml',
			'references/foundation-checks.md',
			'references/polish-and-fit-checks.md',
			'references/ai-ui-smoke-test.md'
		]);

		const frontmatter = bundle.files['SKILL.md'].match(/^---\n([\s\S]*?)\n---/)?.[1];
		expect(frontmatter).toBeTruthy();
		expect(parseYaml(frontmatter ?? '')).toEqual({
			name: 'ui-ux-quality-review',
			description:
				'Child skill under Build Quality UI/UX for foundational screen and flow review across hierarchy, clarity, spacing, type, color, consistency, states, charts, and responsive fit. Returns evidence-backed findings with severity and concrete fixes; includes an AI-generated-UI smoke test.'
		});
		expect(bundle.files['SKILL.md']).toContain('## Portable References');
		expect(bundle.files['SKILL.md']).toContain('references/foundation-checks.md');

		const buildosMetadata = parseYaml(bundle.files['buildos.yaml']) as Record<string, unknown>;
		expect(buildosMetadata.runtime_skill_id).toBe('ui_ux_quality_review');
		expect(buildosMetadata.bundle_url).toBe(
			'https://build-os.com/agent-skills/ui-ux-quality-review/bundle.zip'
		);
	});
});
