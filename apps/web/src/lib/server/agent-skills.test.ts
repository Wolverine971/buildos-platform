// apps/web/src/lib/server/agent-skills.test.ts
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
	buildPublicSkillGalleryMetadata,
	buildPublicRuntimeSkill,
	buildPortableAgentSkillBundle,
	formatAgentSkillValidationReport,
	getAgentSkillMarkdown,
	getAgentSkillReference,
	getRuntimeSkillPublicationStatus,
	listPublicAgentSkillReferences,
	loadAgentSkillIndex,
	resolveRuntimeSkillForPost,
	validateAgentSkillCatalogPosts,
	validatePublicAgentSkillCatalog
} from './agent-skills';
import type { SkillDefinition } from '$lib/services/agentic-chat/tools/skills/types';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata, type BlogPost } from '$lib/utils/blog';

describe('public agent skill serving', () => {
	it('builds a machine-readable index for published agent skills', async () => {
		const index = await loadAgentSkillIndex();

		expect(index.skills).toHaveLength(8);
		expect(index.skills.find((skill) => skill.slug === 'hook-craft-short-form')).toMatchObject({
			runtime_skill_id: 'hook_craft_short_form',
			lineage_profiles: [
				{
					name: 'Kane Kallaway',
					slug: 'kane-kallaway',
					url: 'https://build-os.com/skills/people/kane-kallaway'
				}
			],
			skill_md_url: 'https://build-os.com/agent-skills/hook-craft-short-form/skill.md',
			portable_skill_md_url:
				'https://build-os.com/agent-skills/hook-craft-short-form/portable/SKILL.md',
			bundle_zip_url: 'https://build-os.com/agent-skills/hook-craft-short-form/bundle.zip',
			gallery: {
				display_title: 'Hook Craft For Short-Form',
				family: 'Content Craft',
				output_shapes: ['hook options', 'rewrite pass', 'diagnostic'],
				source: {
					curated: true,
					runtime: true,
					blog: true,
					fallback: false
				},
				trust: {
					eval_status: 'covered',
					last_updated: '2026-05-02'
				}
			}
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
		expect(index.previews).toHaveLength(31);
		expect(
			index.previews.find((preview) => preview.runtime_skill_id === 'cold_email_offer_lab')
		).toMatchObject({
			publication_status: 'preview',
			slug: 'cold-email-offer-lab',
			title: 'Cold Email Offer Lab',
			parent_id: 'cold_email_engagement_first_outreach',
			domain_id: 'sales-and-growth',
			family: 'Cold Outreach'
		});
		expect(index.coverage).toMatchObject({
			public_total: 8,
			preview_total: 31
		});
		expect(index.coverage.internal_total).toBe(index.coverage.runtime_total - 39);
		expect(index.coverage.runtime_total).toBe(
			index.coverage.public_total +
				index.coverage.preview_total +
				index.coverage.internal_total
		);
		expect(index.coverage.internal_total).toBeGreaterThan(0);
		expect(new Set(index.previews.map((preview) => preview.slug)).size).toBe(
			index.previews.length
		);
		const familyStartPreviews = index.previews.filter((preview) => preview.family_start);
		const familyStartCounts = new Map<string, number>();
		for (const preview of familyStartPreviews) {
			familyStartCounts.set(preview.family, (familyStartCounts.get(preview.family) ?? 0) + 1);
		}
		expect(familyStartPreviews.every((preview) => !preview.parent_id)).toBe(true);
		expect([...familyStartCounts.values()].every((count) => count === 1)).toBe(true);
		expect(
			index.previews.find((preview) => preview.runtime_skill_id === 'build_quality_ui_ux')
		).toMatchObject({
			publication_status: 'preview',
			slug: 'build-quality-ui-ux',
			title: 'Build Quality UI/UX',
			domain_id: 'product-and-design',
			family: 'Interface Quality',
			family_start: true,
			parent_id: undefined
		});
		for (const runtimeSkillId of [
			'calm_software_design_review',
			'delightful_product_review',
			'design_system_architecture_review',
			'usability_quick_research'
		]) {
			expect(
				index.previews.find((preview) => preview.runtime_skill_id === runtimeSkillId)
			).toMatchObject({
				publication_status: 'preview',
				domain_id: 'product-and-design',
				family: 'Interface Quality',
				parent_id: 'build_quality_ui_ux'
			});
		}
		expect(
			index.previews.find(
				(preview) => preview.runtime_skill_id === 'content_strategy_beyond_blogging'
			)
		).toMatchObject({
			family: 'Content Craft',
			family_start: true,
			parent_id: undefined
		});
		expect(
			index.previews.find(
				(preview) => preview.runtime_skill_id === 'content_creation_pipeline'
			)
		).toMatchObject({
			publication_status: 'preview',
			slug: 'content-creation-pipeline',
			title: 'Content Creation Pipeline',
			domain_id: 'marketing-and-content',
			family: 'Content Craft',
			parent_id: undefined
		});
		expect(
			index.previews.find((preview) => preview.runtime_skill_id === 'medium_tailoring')
		).toMatchObject({
			parent_id: 'content_creation_pipeline',
			family: 'Content Craft'
		});
		expect(
			index.previews.find((preview) => preview.runtime_skill_id === 'project_creation')
		).toMatchObject({
			publication_status: 'preview',
			slug: 'project-creation',
			title: 'Project Creation',
			domain_id: 'planning-and-ops',
			family: 'Project Operations',
			family_start: true,
			parent_id: undefined
		});
		expect(
			index.previews.find((preview) => preview.runtime_skill_id === 'task_state_updates')
		).toMatchObject({
			parent_id: 'task_management',
			family: 'Project Operations'
		});
		expect(JSON.stringify(index.previews)).not.toContain('rawMarkdown');
		expect(JSON.stringify(index.previews)).not.toContain('referenceModules');
	});

	it('keeps unreviewed runtime skills internal by default', () => {
		const publicRuntimeSkillIds = new Set(['hook_craft_short_form']);

		expect(
			getRuntimeSkillPublicationStatus('hook_craft_short_form', publicRuntimeSkillIds)
		).toBe('public');
		expect(
			getRuntimeSkillPublicationStatus('cold_email_offer_lab', publicRuntimeSkillIds)
		).toBe('preview');
		expect(getRuntimeSkillPublicationStatus('project_management', publicRuntimeSkillIds)).toBe(
			'internal'
		);
	});

	it('serves runtime markdown when a public skill maps to a registered BuildOS skill', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'runtime',
			runtimeSkillId: 'hook_craft_short_form'
		});
		expect(result?.content).toContain('name: hook-craft-short-form');
		expect(result?.content).toContain('## Portable References');
		expect(result?.content).not.toContain('visibility: internal');
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
		expect(result?.content).toContain('name: google-calendar');
		expect(result?.content.toLowerCase()).toContain('search before create');
	});

	it('serves public skill markdown without raw internal reference metadata', async () => {
		const post = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'cold-email-engagement-first-outreach'
		);
		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'runtime',
			runtimeSkillId: 'cold_email_engagement_first_outreach'
		});
		expect(result?.content).toContain('references/public-mode-router.md');
		expect(result?.content).not.toContain('visibility: internal');
		expect(result?.content).not.toContain('references/source-map.md');
		expect(result?.content).not.toContain('references/internal-operating-system.md');
		expect(result?.content).not.toContain('references/internal-skill-architecture.md');
		expect(result?.content).not.toContain('references/child-skill-source-plan.md');
		expect(result?.content).not.toContain('references/source-acquisition-queue.md');
	});

	it('serves portable runtime markdown without authoring comments or internal repo paths', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'ui-ux-quality-review');
		const runtime = resolveRuntimeSkillForPost(post);

		expect(runtime?.rawMarkdown).toContain('<!--');
		expect(runtime?.rawMarkdown).toContain('docs/research/');

		const result = getAgentSkillMarkdown(post);

		expect(result).toMatchObject({
			source: 'runtime',
			runtimeSkillId: 'ui_ux_quality_review'
		});
		expect(result?.content).toContain('references/foundation-checks.md');
		expect(result?.content).not.toContain('<!--');
		expect(result?.content).not.toContain('docs/research/');
		expect(result?.content).not.toContain('apps/web/src/');
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

	it('projects runtime skill metadata for public pages without internal reference modules', async () => {
		const post = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'cold-email-engagement-first-outreach'
		);
		const runtime = buildPublicRuntimeSkill(resolveRuntimeSkillForPost(post));

		expect(runtime?.reference_modules.map((reference) => reference.id)).toEqual([
			'cold_email_engagement_first_outreach.public_mode_router'
		]);
		expect(JSON.stringify(runtime)).not.toContain('source-map.md');
		expect(JSON.stringify(runtime)).not.toContain('visibility');
		expect(JSON.stringify(runtime)).not.toContain('apps/web/src/lib/services');
	});

	it('builds user-first gallery metadata from curated and runtime skill sources', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'ui-ux-quality-review');
		const gallery = buildPublicSkillGalleryMetadata(post);

		expect(gallery).toMatchObject({
			display_title: 'UI/UX Quality Review',
			family: 'Interface Quality',
			domain_id: 'product-and-design',
			output_shapes: ['interface audit', 'fix list', 'agent checks'],
			source: {
				curated: true,
				runtime: true,
				blog: true,
				fallback: false
			},
			trust: {
				eval_status: 'covered',
				last_updated: '2026-05-03'
			}
		});
		expect(gallery.workflow).toContain('Map the surface region by region.');
		expect(gallery.guardrails).toContain('Do not skip mobile or overflow checks.');
		expect(gallery.starter_prompts[0]).toContain('Audit this screen region by region');
		expect(gallery.trust.safety_notes).toContain('Do not skip mobile or overflow checks.');

		const calendarPost = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'google-calendar-for-ai-agents-search-before-you-create'
		);
		expect(buildPublicSkillGalleryMetadata(calendarPost).trust.eval_status).toBe('not-covered');
	});

	it('does not treat implicit reference visibility as public', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const skill = {
			id: 'test_public_skill',
			name: 'Test Public Skill',
			summary: 'Test public skill.',
			legacyPaths: [],
			relatedOps: [],
			whenToUse: [],
			workflow: [],
			referenceModules: [
				{
					id: 'test_public_skill.implicit',
					summary: 'Implicit visibility should stay internal.',
					whenToLoad: [],
					path: 'references/implicit.md'
				},
				{
					id: 'test_public_skill.public',
					summary: 'Explicit public reference.',
					whenToLoad: [],
					path: 'references/public.md',
					visibility: 'public'
				}
			]
		} satisfies SkillDefinition;

		expect(
			listPublicAgentSkillReferences(post, skill).map((reference) => reference.id)
		).toEqual(['test_public_skill.public']);
		expect(
			buildPublicRuntimeSkill(skill)?.reference_modules.map((reference) => reference.id)
		).toEqual(['test_public_skill.public']);
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
		expect(buildosMetadata.lineage_profiles).toEqual([
			{
				name: 'Kole Jain',
				slug: 'kole-jain',
				url: 'https://build-os.com/skills/people/kole-jain'
			},
			{
				name: 'Nesrine Changuel',
				slug: 'nesrine-changuel',
				url: 'https://build-os.com/skills/people/nesrine-changuel'
			},
			{
				name: 'Lenny Rachitsky',
				slug: 'lenny-rachitsky',
				url: 'https://build-os.com/skills/people/lenny-rachitsky'
			}
		]);
		expect(buildosMetadata.gallery).toMatchObject({
			display_title: 'UI/UX Quality Review',
			family: 'Interface Quality',
			output_shapes: ['interface audit', 'fix list', 'agent checks']
		});
	});

	it('validates the current public skill catalog without blocking errors', async () => {
		const report = await validatePublicAgentSkillCatalog();

		expect(report.issues).toEqual([]);
		expect(report).toMatchObject({
			ok: true,
			total_skills: 8,
			runtime_skill_count: 8,
			embedded_portable_count: 0,
			public_reference_count: 13,
			errors: 0,
			warnings: 0
		});
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
