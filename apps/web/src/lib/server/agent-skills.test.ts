// apps/web/src/lib/server/agent-skills.test.ts
import { createHash } from 'node:crypto';
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
	AGENT_SKILLS_DISCOVERY_SCHEMA,
	buildAgentSkillBundleZip,
	buildAgentSkillsDiscoveryIndex,
	buildPublicSkillGalleryMetadata,
	buildPublicRuntimeSkill,
	buildPortableAgentSkillBundle,
	findAgentSkillPostByPortableName,
	findPortableInternalLeftovers,
	formatAgentSkillValidationReport,
	PORTABLE_FOOTER_DOWNLOADS_LABEL,
	PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL,
	getAgentSkillDownloadHeaders,
	resolvePublicSkillLink,
	validatePortableAgentSkillBundle,
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
import {
	AGENT_SKILLS_CATEGORY_KEY,
	loadAgentSkillPosts,
	loadBlogPostMetadata,
	type BlogPost
} from '$lib/utils/blog';

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

		const frontmatter = requireTestValue(bundle.files['SKILL.md']).match(
			/^---\n([\s\S]*?)\n---/
		)?.[1];
		expect(frontmatter).toBeTruthy();
		expect(parseYaml(frontmatter ?? '')).toEqual({
			name: 'ui-ux-quality-review',
			description:
				'Review product screens and flows for hierarchy, clarity, spacing, type, color, consistency, states, charts, and responsive fit. Use when auditing a screen, dashboard, landing page, or mobile flow, or when checking AI-generated UI before it ships. Returns evidence-backed findings with severity and concrete fixes.'
		});
		expect(bundle.files['SKILL.md']).toContain('## Portable References');
		expect(bundle.files['SKILL.md']).toContain('references/foundation-checks.md');

		const buildosMetadata = parseYaml(requireTestValue(bundle.files['buildos.yaml'])) as Record<
			string,
			unknown
		>;
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

function readFrontmatter(markdown: string): Record<string, unknown> {
	return parseYaml(markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '') as Record<string, unknown>;
}

describe('portable skill downloads lead back to BuildOS', () => {
	it('names the Google Calendar bundle folder after its SKILL.md name', async () => {
		const post = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'google-calendar-for-ai-agents-search-before-you-create'
		);
		const bundle = buildPortableAgentSkillBundle(post);

		expect(bundle.directory).toBe('google-calendar');
		expect(readFrontmatter(requireTestValue(bundle.files['SKILL.md'])).name).toBe(
			'google-calendar'
		);
		expect(await findAgentSkillPostByPortableName('google-calendar')).toMatchObject({
			slug: 'google-calendar-for-ai-agents-search-before-you-create'
		});
	});

	it('appends a footer with the canonical link, unbundled skills, and connect-agents docs', async () => {
		const root = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'cold-email-engagement-first-outreach'
		);
		const skillMd = requireTestValue(buildPortableAgentSkillBundle(root).files['SKILL.md']);
		const footer = skillMd.slice(skillMd.indexOf('## More From BuildOS'));

		expect(footer).toContain(
			'https://build-os.com/agent-skills/cold-email-engagement-first-outreach?utm_source=skill_md&utm_medium=download&utm_campaign=cold-email-engagement-first-outreach'
		);
		expect(footer).toContain(
			'https://build-os.com/docs/connect-agents?utm_source=skill_md&utm_medium=download&utm_campaign=cold-email-engagement-first-outreach'
		);
		// Free downloads and BuildOS-only previews sit in separate, honestly labelled lists.
		const downloadsAt = footer.indexOf(PORTABLE_FOOTER_DOWNLOADS_LABEL);
		const runAt = footer.indexOf(PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL);
		expect(downloadsAt).toBeGreaterThan(0);
		expect(runAt).toBeGreaterThan(downloadsAt);
		const downloads = footer.slice(downloadsAt, runAt);
		const runInBuildOs = footer.slice(runAt);
		expect(downloads).toContain(
			'- `cold_email_icp_signal_design` — Cold Email ICP And Signal Design: <https://build-os.com/agent-skills/cold-email-icp-signal-design?utm_source=skill_md'
		);
		for (const child of [
			'cold_email_offer_lab',
			'cold_email_research_anchors',
			'cold_email_outreach_compiler',
			'cold_email_taste_review',
			'cold_email_deliverability_readiness',
			'cold_email_reply_os',
			'cold_email_learning_review'
		]) {
			expect(runInBuildOs).toContain(`\`${child}\``);
			expect(runInBuildOs).toContain(
				`/skills/preview/${child.replace(/_/g, '-')}?utm_source=skill_md`
			);
		}
		expect(footer).not.toContain('(free SKILL.md download)');
		expect(footer).not.toContain('not bundled here run inside BuildOS');

		const hook = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const hookMd = requireTestValue(buildPortableAgentSkillBundle(hook).files['SKILL.md']);
		const hookFooter = hookMd.slice(hookMd.indexOf('## More From BuildOS'));
		// A referenced skill with no public page is left out of the footer entirely.
		expect(hookFooter).not.toContain('viral_video_script_structure');
		expect(hookFooter).not.toContain(PORTABLE_FOOTER_DOWNLOADS_LABEL);
		expect(hookFooter).toContain(PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL);
		expect(hookMd).not.toContain('the upcoming `viral-video-script-structure`');
	});

	it('leads every portable description with what the skill does, not router vocabulary', async () => {
		for (const post of await loadAgentSkillPosts()) {
			const skillMd = requireTestValue(buildPortableAgentSkillBundle(post).files['SKILL.md']);
			const description = String(readFrontmatter(skillMd).description ?? '');
			expect(description, post.slug).not.toMatch(/^(Root|Child) skill/);
			expect(description.length, post.slug).toBeLessThanOrEqual(1024);
		}
	});

	it('drops pointers at stripped repo-only material', async () => {
		const hook = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const hookMd = requireTestValue(buildPortableAgentSkillBundle(hook).files['SKILL.md']);

		expect(hookMd).not.toContain('linked below');
		expect(hookMd).not.toContain('Underlying Kallaway analyses live at:');
		expect(hookMd).toContain("Kane Kallaway's four videos are the **PRIMARY** creator source;");
		// The YouTube source list that is actually shipped stays.
		expect(hookMd).toContain('Distilled from four Kallaway videos:');
	});

	it('ships no repo-only leftovers in any downloadable file', async () => {
		const posts = await loadAgentSkillPosts();

		for (const post of posts) {
			const bundle = buildPortableAgentSkillBundle(post);
			for (const [path, content] of Object.entries(bundle.files)) {
				expect(findPortableInternalLeftovers(content), `${post.slug}/${path}`).toEqual([]);
				expect(content, `${post.slug}/${path}`).not.toContain('<!--');
				expect(content, `${post.slug}/${path}`).not.toContain('apps/web/src/');
			}
		}

		const icp = await loadBlogPostMetadata(
			AGENT_SKILLS_CATEGORY_KEY,
			'cold-email-icp-signal-design'
		);
		const icpMd = requireTestValue(buildPortableAgentSkillBundle(icp).files['SKILL.md']);
		expect(icpMd).toContain('are BuildOS defaults (assembled, not sourced).');
		expect(icpMd).not.toContain('root source map');
	});

	it('flags name/folder mismatches, leftovers, and unlisted skill references', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const issues = validatePortableAgentSkillBundle(
			post,
			{
				slug: post.slug,
				directory: 'hook-craft',
				files: {
					'SKILL.md': [
						'---',
						'name: hook-craft-short-form',
						'description: Test skill.',
						'---',
						'',
						'Pair with `story-driven-content-craft`. See internal BuildOS source notes.',
						'',
						'## More From BuildOS',
						'',
						'No links here.'
					].join('\n'),
					'references/notes.md': '<!-- apps/web/src/notes.md -->\nNotes.\n'
				}
			},
			undefined
		);

		expect(issues.map((issue) => issue.code)).toEqual(
			expect.arrayContaining([
				'portable_name_folder_mismatch',
				'incomplete_portable_footer',
				'portable_unlisted_skill_reference',
				'portable_internal_leftover',
				'portable_reference_internal_infrastructure_leak'
			])
		);
	});

	it('only lets the footer promise pages that exist, in the right section', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const issues = validatePortableAgentSkillBundle(
			post,
			{
				slug: post.slug,
				directory: 'hook-craft-short-form',
				files: {
					'SKILL.md': [
						'---',
						'name: hook-craft-short-form',
						'description: Draft and audit hooks.',
						'---',
						'',
						'Pair with `content-strategy-beyond-blogging` and `viral-video-script-structure`.',
						'',
						'## More From BuildOS',
						'',
						'Guide: <https://build-os.com/agent-skills/hook-craft-short-form?utm_source=skill_md>',
						'',
						PORTABLE_FOOTER_DOWNLOADS_LABEL,
						'',
						'- `content_strategy_beyond_blogging` — Content Strategy: <https://build-os.com/skills/preview/content-strategy-beyond-blogging?utm_source=skill_md>',
						'- `made_up_skill` — Made Up: <https://build-os.com/agent-skills/made-up-skill?utm_source=skill_md>',
						'',
						PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL,
						'',
						'- `viral_video_script_structure` — Viral Video Script Structure',
						'',
						'Connect: <https://build-os.com/docs/connect-agents?utm_source=skill_md>'
					].join('\n')
				}
			},
			undefined
		);

		expect(issues.map((issue) => issue.code).sort()).toEqual([
			'portable_footer_misfiled_link',
			'portable_footer_unknown_link',
			'portable_footer_unlinked_skill'
		]);
	});

	it('fails empty frontmatter, router-vocabulary descriptions, bad stack slugs, and duplicate names', async () => {
		const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const emptyIssues = validatePortableAgentSkillBundle(
			post,
			{
				slug: post.slug,
				directory: 'hook-craft-short-form',
				files: { 'SKILL.md': "---\nname: ''\ndescription: '  '\n---\n\nBody.\n" }
			},
			undefined
		).map((issue) => issue.code);
		expect(emptyIssues).toEqual(
			expect.arrayContaining(['missing_portable_name', 'missing_portable_description'])
		);

		const jargonIssues = validatePortableAgentSkillBundle(
			post,
			{
				slug: post.slug,
				directory: 'hook-craft-short-form',
				files: {
					'SKILL.md':
						'---\nname: hook-craft-short-form\ndescription: Child skill for hooks.\n---\n'
				}
			},
			undefined
		).map((issue) => issue.code);
		expect(jargonIssues).toContain('portable_description_internal_jargon');

		const hook = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, 'hook-craft-short-form');
		const report = validateAgentSkillCatalogPosts([
			{
				...hook,
				stackWith: [
					'story-driven-content-craft',
					'content-strategy-beyond-blogging',
					'viral-video-script-structure',
					'accessibility-and-inclusive-ui-review',
					'OAuth 2.0 for agents'
				]
			},
			// A second post whose SKILL.md name collides with hook-craft's.
			{ ...hook, slug: 'hook-craft-copy' }
		]);
		const stackIssues = report.issues.filter(
			(issue) => issue.code === 'unknown_stack_with_skill'
		);
		expect(stackIssues.map((issue) => issue.message)).toEqual([
			expect.stringContaining('"accessibility-and-inclusive-ui-review"'),
			expect.stringContaining('"OAuth 2.0 for agents"')
		]);
		expect(report.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: 'duplicate_portable_name',
					slug: 'hook-craft-copy'
				})
			])
		);
	});

	it('links stack slugs only when a public page exists', () => {
		expect(resolvePublicSkillLink('hook-craft-short-form')).toMatchObject({
			href: '/agent-skills/hook-craft-short-form',
			kind: 'agent-skill'
		});
		expect(resolvePublicSkillLink('content-strategy-beyond-blogging')).toMatchObject({
			href: '/skills/preview/content-strategy-beyond-blogging',
			kind: 'preview'
		});
		expect(resolvePublicSkillLink('viral-video-script-structure')).toBeNull();
		expect(resolvePublicSkillLink('OAuth 2.0 for agents')).toBeNull();
	});

	it('marks raw downloads noindex with a canonical link to the skill page', () => {
		expect(getAgentSkillDownloadHeaders('hook-craft-short-form')).toEqual({
			'x-robots-tag': 'noindex',
			link: '<https://build-os.com/agent-skills/hook-craft-short-form>; rel="canonical"'
		});
	});

	it('publishes a well-known discovery index whose digests match the archives', async () => {
		const index = await buildAgentSkillsDiscoveryIndex();
		const posts = await loadAgentSkillPosts();

		expect(index.$schema).toBe(AGENT_SKILLS_DISCOVERY_SCHEMA);
		expect(index.skills).toHaveLength(posts.length);

		for (const entry of index.skills) {
			// Same validation the `skills` CLI applies to v0.2.0 entries.
			expect(entry.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
			expect(entry.name.length).toBeLessThanOrEqual(64);
			expect(entry.description.length).toBeGreaterThan(0);
			expect(entry.description.length).toBeLessThanOrEqual(1024);
			expect(entry.type).toBe('archive');
			expect(entry.url).toBe(`/.well-known/agent-skills/${entry.name}.zip`);
			expect(entry.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

			const post = requireTestValue(await findAgentSkillPostByPortableName(entry.name));
			const archive = buildAgentSkillBundleZip(post, 'root');
			expect(`sha256:${createHash('sha256').update(archive.bytes).digest('hex')}`).toBe(
				entry.digest
			);

			const files = unzipSync(archive.bytes);
			const skillMd = strFromU8(requireTestValue(files['SKILL.md']));
			expect(readFrontmatter(skillMd)).toMatchObject({
				name: entry.name,
				description: entry.description
			});
		}

		const directoryZip = unzipSync(
			buildAgentSkillBundleZip(requireTestValue(posts[0]), 'directory').bytes
		);
		expect(Object.keys(directoryZip).every((path) => path.includes('/'))).toBe(true);
	});
});
