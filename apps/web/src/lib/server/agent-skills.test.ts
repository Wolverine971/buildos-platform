// apps/web/src/lib/server/agent-skills.test.ts
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
	buildPortableAgentSkillBundle,
	formatAgentSkillValidationReport,
	getAgentSkillMarkdown,
	getAgentSkillReference,
	loadAgentSkillIndex,
	validateAgentSkillCatalogPosts,
	validatePublicAgentSkillCatalog
} from './agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata, type BlogPost } from '$lib/utils/blog';

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
			runtime_skill_id: 'google_calendar',
			skill_md_url:
				'https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create/skill.md',
			portable_skill_md_url:
				'https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create/portable/SKILL.md',
			bundle_zip_url:
				'https://build-os.com/agent-skills/google-calendar-for-ai-agents-search-before-you-create/bundle.zip'
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

	it('serves dedicated runtime markdown for the Google Calendar public skill', async () => {
		const post = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'google-calendar-for-ai-agents-search-before-you-create'
		);
		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'runtime',
			runtimeSkillId: 'google_calendar'
		});
		expect(result?.content).toContain('name: Google Calendar');
		expect(result?.content.toLowerCase()).toContain('search before create');
	});

	it('serves public reference modules and hides internal reference modules', async () => {
		const uiUxPost = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'ui-ux-quality-review'
		);
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
		const publicColdEmailReference = getAgentSkillReference(
			coldEmailPost,
			'public-mode-router.md'
		);
		expect(publicColdEmailReference).toMatchObject({
			runtimeSkillId: 'cold_email_engagement_first_outreach',
			referenceId: 'cold_email_engagement_first_outreach.public_mode_router'
		});
		expect(publicColdEmailReference?.content).toContain('Public Outreach Mode Router');
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

	it('validates the current public skill catalog without blocking errors', async () => {
		const report = await validatePublicAgentSkillCatalog();

		expect(report).toMatchObject({
			ok: true,
			total_skills: 8,
			runtime_skill_count: 8,
			embedded_portable_count: 0,
			public_reference_count: 13,
			errors: 0,
			warnings: 0
		});
		expect(report.issues).toEqual([]);
		expect(formatAgentSkillValidationReport(report).join('\n')).toContain('Result: passed.');
	});

	it('reports blocking errors for malformed public skill posts', () => {
		const brokenPost: BlogPost = {
			slug: 'broken-agent-skill',
			category: AGENT_SKILLS_CATEGORY_KEY,
			title: '',
			description: '',
			author: 'BuildOS Team',
			date: '2026-06-11',
			lastmod: '2026-06-11',
			changefreq: 'monthly',
			priority: '0.7',
			published: true,
			tags: [],
			readingTime: 1
		};

		const report = validateAgentSkillCatalogPosts([brokenPost, brokenPost]);

		expect(report.ok).toBe(false);
		expect(report.errors).toBeGreaterThan(0);
		expect(report.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ severity: 'error', code: 'duplicate_slug' }),
				expect.objectContaining({ severity: 'error', code: 'missing_title' }),
				expect.objectContaining({ severity: 'error', code: 'missing_description' }),
				expect.objectContaining({ severity: 'error', code: 'missing_public_skill_id' }),
				expect.objectContaining({ severity: 'error', code: 'missing_agent_markdown' })
			])
		);
	});
});
