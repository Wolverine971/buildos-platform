// apps/web/src/lib/server/agent-skills.ts
import { SITE_URL } from '$lib/constants/seo';
import { AGENT_SKILLS_CATEGORY_KEY, loadAgentSkillPosts, type BlogPost } from '$lib/utils/blog';
import {
	getSkillByReference,
	listAllSkills
} from '$lib/services/agentic-chat/tools/skills/registry';
import { loadSkillReference } from '$lib/services/agentic-chat/tools/skills/skill-reference-load';
import { stringify as stringifyYaml } from 'yaml';
import type {
	SkillDefinition,
	SkillLinkedResource
} from '$lib/services/agentic-chat/tools/skills/types';

const agentSkillBlogModules = import.meta.glob<string>('/src/content/blogs/agent-skills/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

export type PublicAgentSkillReference = {
	id: string;
	name?: string;
	summary: string;
	path: string;
	url: string;
	when_to_load: string[];
};

export type AgentSkillIndexItem = {
	slug: string;
	title: string;
	description: string;
	url: string;
	skill_md_url: string;
	portable_skill_md_url: string;
	bundle_zip_url: string;
	public_skill_id?: string;
	runtime_skill_id?: string;
	skill_type?: string;
	skill_category?: string;
	providers?: string[];
	compatible_agents?: string[];
	stack_with?: string[];
	lineage_people?: string[];
	lineage_sources?: BlogPost['lineageSources'];
	lineage_stats?: BlogPost['lineageStats'];
	references: PublicAgentSkillReference[];
};

export type AgentSkillMarkdownResult = {
	content: string;
	source: 'runtime' | 'embedded-portable';
	runtimeSkillId?: string;
};

export type AgentSkillReferenceResult = {
	content: string;
	contentType: string;
	runtimeSkillId: string;
	referenceId: string;
};

export type PortableAgentSkillBundle = {
	slug: string;
	directory: string;
	files: Record<string, string>;
};

export type AgentSkillValidationSeverity = 'error' | 'warning';

export type AgentSkillValidationIssue = {
	severity: AgentSkillValidationSeverity;
	code: string;
	message: string;
	slug?: string;
};

export type AgentSkillValidationReport = {
	ok: boolean;
	total_skills: number;
	runtime_skill_count: number;
	embedded_portable_count: number;
	public_reference_count: number;
	errors: number;
	warnings: number;
	issues: AgentSkillValidationIssue[];
};

function kebabToSnake(value: string): string {
	return value.replace(/-/g, '_');
}

function getLastPathSegment(value: string): string {
	return value.split('/').filter(Boolean).at(-1) ?? value;
}

function getRuntimeIdFromSkillSource(skillSource?: string): string | undefined {
	return skillSource?.match(/\/definitions\/([^/]+)\/SKILL\.md$/)?.[1];
}

function getSkillReferenceCandidates(post: BlogPost): string[] {
	const publicSkillLeaf = post.skillId ? getLastPathSegment(post.skillId) : undefined;
	const sourceRuntimeId = getRuntimeIdFromSkillSource(post.skillSource);
	const candidates = [
		sourceRuntimeId,
		post.slug,
		kebabToSnake(post.slug),
		post.skillId,
		publicSkillLeaf,
		publicSkillLeaf ? kebabToSnake(publicSkillLeaf) : undefined,
		post.skillSource,
		post.lineagePath
	].filter((candidate): candidate is string => Boolean(candidate));

	return [...new Set(candidates)];
}

export function resolveRuntimeSkillForPost(post: BlogPost): SkillDefinition | undefined {
	for (const candidate of getSkillReferenceCandidates(post)) {
		const skill = getSkillByReference(candidate);
		if (skill) return skill;
	}

	const normalizedSlug = kebabToSnake(post.slug);
	return listAllSkills().find((skill) => skill.id === normalizedSlug);
}

function getRawBlogContent(post: BlogPost): string | undefined {
	return agentSkillBlogModules[`/src/content/blogs/${AGENT_SKILLS_CATEGORY_KEY}/${post.slug}.md`];
}

function extractEmbeddedPortableSkillMarkdown(post: BlogPost): string | undefined {
	const rawContent = getRawBlogContent(post);
	if (!rawContent) return undefined;

	const portableSectionIndex = rawContent.indexOf('## The portable skill definition');
	const searchableContent =
		portableSectionIndex >= 0 ? rawContent.slice(portableSectionIndex) : rawContent;
	const markdownBlock = searchableContent.match(/```markdown\s*\n([\s\S]*?)\n```/);
	const content = markdownBlock?.[1]?.trim();
	return content && content.startsWith('---') ? content : undefined;
}

function stripFrontmatter(markdown: string): string {
	return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*/, '').trim();
}

function toPortableSkillName(post: BlogPost, runtimeSkill?: SkillDefinition): string {
	const fromPublicId = post.skillId ? getLastPathSegment(post.skillId) : undefined;
	const fromRuntimeId = runtimeSkill?.id ? runtimeSkill.id.replace(/_/g, '-') : undefined;
	return fromPublicId ?? fromRuntimeId ?? post.slug;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewriteReferenceLoadLanguage(
	body: string,
	references: PublicAgentSkillReference[]
): string {
	let nextBody = body.replaceAll(
		'skill_reference_load',
		'read the referenced file under `references/`'
	);

	for (const reference of references) {
		const safeId = escapeRegExp(reference.id);
		const safePath = escapeRegExp(reference.path);
		const localPath = reference.path;
		nextBody = nextBody
			.replace(new RegExp(`load\\s+\`${safeId}\``, 'gi'), `read \`${localPath}\``)
			.replace(new RegExp(`load\\s+\`${safePath}\``, 'gi'), `read \`${localPath}\``)
			.replace(new RegExp(`Load\\s+\`${safeId}\``, 'g'), `Read \`${localPath}\``)
			.replace(new RegExp(`Load\\s+\`${safePath}\``, 'g'), `Read \`${localPath}\``);
	}

	return nextBody;
}

function buildPortableReferenceSection(references: PublicAgentSkillReference[]): string {
	if (references.length === 0) return '';

	const lines = [
		'## Portable References',
		'',
		'This skill ships with local reference files. Read them only when the current task matches the trigger.'
	];

	for (const reference of references) {
		const label = reference.name ? `${reference.name} (${reference.id})` : reference.id;
		lines.push('', `- \`${reference.path}\` — ${label}: ${reference.summary}`);
		for (const trigger of reference.when_to_load) {
			lines.push(`  - Read when: ${trigger}`);
		}
	}

	return lines.join('\n');
}

function buildPortableSkillMarkdown(
	post: BlogPost,
	runtimeSkill: SkillDefinition | undefined,
	references: PublicAgentSkillReference[]
): string {
	const embeddedPortable = extractEmbeddedPortableSkillMarkdown(post);
	if (!runtimeSkill && embeddedPortable) {
		return `${embeddedPortable.trim()}\n`;
	}

	const name = toPortableSkillName(post, runtimeSkill);
	const description = runtimeSkill?.summary ?? post.description;
	const sourceMarkdown = runtimeSkill?.rawMarkdown ?? embeddedPortable;
	const body = sourceMarkdown
		? stripFrontmatter(sourceMarkdown)
		: `# ${post.title}\n\n${post.description}`;
	const rewrittenBody = rewriteReferenceLoadLanguage(body, references);
	const referenceSection = buildPortableReferenceSection(references);

	const frontmatter = stringifyYaml({
		name,
		description
	}).trim();

	return [
		'---',
		frontmatter,
		'---',
		'',
		rewrittenBody,
		referenceSection ? `\n${referenceSection}` : ''
	]
		.join('\n')
		.trimEnd()
		.concat('\n');
}

function buildBuildOsMetadataYaml(
	post: BlogPost,
	runtimeSkill: SkillDefinition | undefined,
	references: PublicAgentSkillReference[]
): string {
	const skillUrl = `${SITE_URL}/agent-skills/${post.slug}`;
	const metadata = {
		id: post.skillId ?? runtimeSkill?.id ?? post.slug,
		slug: post.slug,
		title: post.title,
		description: post.description,
		public_url: skillUrl,
		raw_skill_url: `${skillUrl}/skill.md`,
		portable_skill_url: `${skillUrl}/portable/SKILL.md`,
		bundle_url: `${skillUrl}/bundle.zip`,
		runtime_skill_id: runtimeSkill?.id,
		skill_type: post.skillType,
		skill_category: post.skillCategory,
		providers: post.providers,
		compatible_agents: post.compatibleAgents,
		stack_with: post.stackWith,
		lineage_people: post.lineagePeople,
		lineage_sources: post.lineageSources,
		lineage_stats: post.lineageStats,
		references: references.map((reference) => ({
			id: reference.id,
			path: reference.path,
			summary: reference.summary,
			when_to_load: reference.when_to_load
		}))
	};

	return `${stringifyYaml(metadata).trim()}\n`;
}

export function getAgentSkillMarkdown(post: BlogPost): AgentSkillMarkdownResult | undefined {
	const runtimeSkill = resolveRuntimeSkillForPost(post);
	if (runtimeSkill?.rawMarkdown) {
		return {
			content: runtimeSkill.rawMarkdown,
			source: 'runtime',
			runtimeSkillId: runtimeSkill.id
		};
	}

	const embeddedPortableSkill = extractEmbeddedPortableSkillMarkdown(post);
	if (embeddedPortableSkill) {
		return {
			content: embeddedPortableSkill,
			source: 'embedded-portable'
		};
	}

	return undefined;
}

function isPublicReferenceModule(
	reference: SkillLinkedResource
): reference is SkillLinkedResource & {
	path: string;
} {
	return Boolean(reference.path) && reference.visibility !== 'internal';
}

function normalizeReferencePath(path: string): string | null {
	if (!path || path.startsWith('/') || path.startsWith('\\')) return null;
	if (path.includes('\0')) return null;
	const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
	const segments = normalized.split('/').filter(Boolean);
	if (segments.some((segment) => segment === '.' || segment === '..')) return null;
	return segments.join('/');
}

function getPublicReferenceModules(skill?: SkillDefinition): Array<
	SkillLinkedResource & {
		path: string;
	}
> {
	return skill?.referenceModules?.filter(isPublicReferenceModule) ?? [];
}

function buildReferenceUrl(post: BlogPost, referencePath: string): string {
	return `${SITE_URL}/agent-skills/${post.slug}/${referencePath}`;
}

export function listPublicAgentSkillReferences(
	post: BlogPost,
	skill = resolveRuntimeSkillForPost(post)
): PublicAgentSkillReference[] {
	return getPublicReferenceModules(skill).map((reference) => ({
		id: reference.id,
		name: reference.name,
		summary: reference.summary,
		path: reference.path,
		url: buildReferenceUrl(post, reference.path),
		when_to_load: reference.whenToLoad
	}));
}

function loadPublicReferenceContent(
	runtimeSkill: SkillDefinition | undefined,
	reference: PublicAgentSkillReference
): string | undefined {
	if (!runtimeSkill) return undefined;
	const payload = loadSkillReference(runtimeSkill.id, reference.id);
	if (payload.type !== 'skill_reference' || typeof payload.content !== 'string') {
		return undefined;
	}
	return payload.content;
}

export function buildPortableAgentSkillBundle(post: BlogPost): PortableAgentSkillBundle {
	const runtimeSkill = resolveRuntimeSkillForPost(post);
	const references = listPublicAgentSkillReferences(post, runtimeSkill);
	const files: Record<string, string> = {
		'SKILL.md': buildPortableSkillMarkdown(post, runtimeSkill, references),
		'buildos.yaml': buildBuildOsMetadataYaml(post, runtimeSkill, references)
	};

	for (const reference of references) {
		const content = loadPublicReferenceContent(runtimeSkill, reference);
		if (content) {
			files[reference.path] = content.endsWith('\n') ? content : `${content}\n`;
		}
	}

	return {
		slug: post.slug,
		directory: post.slug,
		files
	};
}

export function getPortableAgentSkillFile(
	post: BlogPost,
	path: string
): { content: string; contentType: string } | undefined {
	const normalizedPath = normalizeReferencePath(path);
	if (!normalizedPath) return undefined;

	const bundle = buildPortableAgentSkillBundle(post);
	const candidates = new Set([
		normalizedPath,
		normalizedPath === 'skill.md' ? 'SKILL.md' : normalizedPath,
		normalizedPath.startsWith('references/') ? normalizedPath : `references/${normalizedPath}`
	]);
	const filePath = Object.keys(bundle.files).find((candidate) => candidates.has(candidate));
	if (!filePath) return undefined;
	const content = bundle.files[filePath];
	if (typeof content !== 'string') return undefined;

	const contentType =
		filePath.endsWith('.yaml') || filePath.endsWith('.yml')
			? 'application/yaml; charset=utf-8'
			: 'text/markdown; charset=utf-8';

	return {
		content,
		contentType
	};
}

export function getAgentSkillReference(
	post: BlogPost,
	referencePath: string
): AgentSkillReferenceResult | undefined {
	const runtimeSkill = resolveRuntimeSkillForPost(post);
	if (!runtimeSkill) return undefined;

	const normalizedPath = normalizeReferencePath(referencePath);
	if (!normalizedPath) return undefined;
	const candidatePaths = new Set([
		normalizedPath,
		normalizedPath.startsWith('references/') ? normalizedPath : `references/${normalizedPath}`
	]);

	const reference = getPublicReferenceModules(runtimeSkill).find((module) =>
		candidatePaths.has(normalizeReferencePath(module.path) ?? '')
	);
	if (!reference) return undefined;

	const payload = loadSkillReference(runtimeSkill.id, reference.id);
	if (payload.type !== 'skill_reference' || typeof payload.content !== 'string') {
		return undefined;
	}

	return {
		content: payload.content,
		contentType: 'text/markdown; charset=utf-8',
		runtimeSkillId: runtimeSkill.id,
		referenceId: reference.id
	};
}

export function buildAgentSkillIndexItem(post: BlogPost): AgentSkillIndexItem {
	const runtimeSkill = resolveRuntimeSkillForPost(post);
	const skillUrl = `${SITE_URL}/agent-skills/${post.slug}`;

	return {
		slug: post.slug,
		title: post.title,
		description: post.description,
		url: skillUrl,
		skill_md_url: `${skillUrl}/skill.md`,
		portable_skill_md_url: `${skillUrl}/portable/SKILL.md`,
		bundle_zip_url: `${skillUrl}/bundle.zip`,
		public_skill_id: post.skillId,
		runtime_skill_id: runtimeSkill?.id,
		skill_type: post.skillType,
		skill_category: post.skillCategory,
		providers: post.providers,
		compatible_agents: post.compatibleAgents,
		stack_with: post.stackWith,
		lineage_people: post.lineagePeople,
		lineage_sources: post.lineageSources,
		lineage_stats: post.lineageStats,
		references: listPublicAgentSkillReferences(post, runtimeSkill)
	};
}

export async function loadAgentSkillIndex(): Promise<{
	version: string;
	generated_at: string;
	skills: AgentSkillIndexItem[];
}> {
	const posts = await loadAgentSkillPosts();

	return {
		version: '2026-06-11',
		generated_at: new Date().toISOString(),
		skills: posts.map(buildAgentSkillIndexItem)
	};
}

function addValidationIssue(
	issues: AgentSkillValidationIssue[],
	severity: AgentSkillValidationSeverity,
	code: string,
	message: string,
	slug?: string
) {
	issues.push({
		severity,
		code,
		message,
		slug
	});
}

function hasPositiveNumericStat(post: BlogPost, key: string): boolean {
	const value = post.lineageStats?.[key];
	return typeof value === 'number' && value > 0;
}

function validateRequiredUrl(
	issues: AgentSkillValidationIssue[],
	slug: string,
	label: string,
	url: string | undefined,
	expectedPath: string
) {
	if (!url) {
		addValidationIssue(issues, 'error', `missing_${label}`, `Missing ${label}.`, slug);
		return;
	}

	if (!url.startsWith(`${SITE_URL}${expectedPath}`)) {
		addValidationIssue(
			issues,
			'error',
			`invalid_${label}`,
			`${label} should start with ${SITE_URL}${expectedPath}.`,
			slug
		);
	}
}

export function validateAgentSkillCatalogPosts(posts: BlogPost[]): AgentSkillValidationReport {
	const issues: AgentSkillValidationIssue[] = [];
	const slugs = new Set<string>();
	let runtimeSkillCount = 0;
	let embeddedPortableCount = 0;
	let publicReferenceCount = 0;

	for (const post of posts) {
		const slug = post.slug || '(missing-slug)';
		if (!post.slug) {
			addValidationIssue(issues, 'error', 'missing_slug', 'Post is missing a slug.');
		} else if (slugs.has(post.slug)) {
			addValidationIssue(
				issues,
				'error',
				'duplicate_slug',
				`Duplicate skill slug ${post.slug}.`,
				slug
			);
		} else {
			slugs.add(post.slug);
		}

		if (!post.title.trim()) {
			addValidationIssue(issues, 'error', 'missing_title', 'Skill is missing a title.', slug);
		}
		if (!post.description.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_description',
				'Skill is missing a description.',
				slug
			);
		}
		if (!post.skillId) {
			addValidationIssue(
				issues,
				'error',
				'missing_public_skill_id',
				'Skill is missing public skillId metadata.',
				slug
			);
		}
		if (!post.skillType) {
			addValidationIssue(
				issues,
				'warning',
				'missing_skill_type',
				'Skill is missing skillType metadata.',
				slug
			);
		}
		if (!post.skillCategory) {
			addValidationIssue(
				issues,
				'warning',
				'missing_skill_category',
				'Skill is missing skillCategory metadata.',
				slug
			);
		}
		if (!post.compatibleAgents?.length) {
			addValidationIssue(
				issues,
				'warning',
				'missing_compatible_agents',
				'Skill is missing compatibleAgents metadata.',
				slug
			);
		}

		const indexItem = buildAgentSkillIndexItem(post);
		validateRequiredUrl(issues, slug, 'url', indexItem.url, `/agent-skills/${post.slug}`);
		validateRequiredUrl(
			issues,
			slug,
			'skill_md_url',
			indexItem.skill_md_url,
			`/agent-skills/${post.slug}/skill.md`
		);
		validateRequiredUrl(
			issues,
			slug,
			'portable_skill_md_url',
			indexItem.portable_skill_md_url,
			`/agent-skills/${post.slug}/portable/SKILL.md`
		);
		validateRequiredUrl(
			issues,
			slug,
			'bundle_zip_url',
			indexItem.bundle_zip_url,
			`/agent-skills/${post.slug}/bundle.zip`
		);

		const runtimeSkill = resolveRuntimeSkillForPost(post);
		if (runtimeSkill) {
			runtimeSkillCount += 1;
			if (!runtimeSkill.rawMarkdown?.trim()) {
				addValidationIssue(
					issues,
					'error',
					'missing_runtime_markdown',
					'Runtime skill is registered but does not expose rawMarkdown.',
					slug
				);
			}
		}

		const markdown = getAgentSkillMarkdown(post);
		if (!markdown?.content.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_agent_markdown',
				'Skill has neither runtime SKILL.md markdown nor an embedded portable skill block.',
				slug
			);
		} else if (markdown.source === 'embedded-portable') {
			embeddedPortableCount += 1;
		}

		const references = listPublicAgentSkillReferences(post, runtimeSkill);
		publicReferenceCount += references.length;
		if (!runtimeSkill) {
			addValidationIssue(
				issues,
				'warning',
				'missing_runtime_skill',
				'Skill is portable-only and does not currently map to a registered BuildOS runtime skill.',
				slug
			);
		}
		if (references.length === 0) {
			addValidationIssue(
				issues,
				'warning',
				'missing_public_references',
				'Skill has no public reference modules in its portable bundle.',
				slug
			);
		}

		if (!hasPositiveNumericStat(post, 'sources')) {
			addValidationIssue(
				issues,
				'warning',
				'missing_lineage_source_count',
				'Skill is missing lineageStats.sources.',
				slug
			);
		}
		if (!post.lineagePeople?.length && !post.lineageSources?.length) {
			addValidationIssue(
				issues,
				'warning',
				'missing_lineage_people_or_sources',
				'Skill is missing lineagePeople or lineageSources metadata.',
				slug
			);
		}

		const bundle = buildPortableAgentSkillBundle(post);
		const portableSkill = bundle.files['SKILL.md'];
		const buildOsMetadata = bundle.files['buildos.yaml'];
		if (!portableSkill?.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_portable_skill_file',
				'Portable bundle is missing SKILL.md.',
				slug
			);
		} else {
			if (!portableSkill.startsWith('---\n')) {
				addValidationIssue(
					issues,
					'error',
					'invalid_portable_frontmatter',
					'Portable SKILL.md must start with YAML frontmatter.',
					slug
				);
			}
			if (!portableSkill.includes('\nname:') && !portableSkill.includes('\nname: ')) {
				addValidationIssue(
					issues,
					'error',
					'missing_portable_name',
					'Portable SKILL.md frontmatter is missing name.',
					slug
				);
			}
			if (
				!portableSkill.includes('\ndescription:') &&
				!portableSkill.includes('\ndescription: ')
			) {
				addValidationIssue(
					issues,
					'error',
					'missing_portable_description',
					'Portable SKILL.md frontmatter is missing description.',
					slug
				);
			}
			if (portableSkill.includes('skill_reference_load')) {
				addValidationIssue(
					issues,
					'error',
					'unrewritten_reference_loader',
					'Portable SKILL.md still references BuildOS-only skill_reference_load.',
					slug
				);
			}
		}

		if (!buildOsMetadata?.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_buildos_metadata',
				'Portable bundle is missing buildos.yaml.',
				slug
			);
		}

		for (const reference of references) {
			if (!bundle.files[reference.path]?.trim()) {
				addValidationIssue(
					issues,
					'error',
					'missing_portable_reference_file',
					`Portable bundle is missing ${reference.path}.`,
					slug
				);
			}
		}
	}

	const errors = issues.filter((issue) => issue.severity === 'error').length;
	const warnings = issues.filter((issue) => issue.severity === 'warning').length;

	return {
		ok: errors === 0,
		total_skills: posts.length,
		runtime_skill_count: runtimeSkillCount,
		embedded_portable_count: embeddedPortableCount,
		public_reference_count: publicReferenceCount,
		errors,
		warnings,
		issues
	};
}

export async function validatePublicAgentSkillCatalog(): Promise<AgentSkillValidationReport> {
	const posts = await loadAgentSkillPosts();
	return validateAgentSkillCatalogPosts(posts);
}

export function formatAgentSkillValidationReport(
	report: AgentSkillValidationReport,
	options: { strictWarnings?: boolean } = {}
): string[] {
	const strictWarnings = options.strictWarnings === true;
	const lines = [
		'AGENT SKILL CATALOG CHECK',
		'',
		`Skills: ${report.total_skills}`,
		`Runtime-backed skills: ${report.runtime_skill_count}`,
		`Embedded portable skills: ${report.embedded_portable_count}`,
		`Public reference files: ${report.public_reference_count}`,
		`Errors: ${report.errors}`,
		`Warnings: ${report.warnings}`
	];

	if (report.issues.length > 0) {
		lines.push('', 'Issues:');
		for (const issue of report.issues) {
			const slug = issue.slug ? `${issue.slug}: ` : '';
			lines.push(`- [${issue.severity}] ${slug}${issue.code} - ${issue.message}`);
		}
	}

	lines.push('');
	if (report.errors > 0) {
		lines.push('Result: failed with blocking errors.');
	} else if (strictWarnings && report.warnings > 0) {
		lines.push('Result: failed because strict mode treats warnings as blocking.');
	} else if (report.warnings > 0) {
		lines.push('Result: passed with warnings.');
	} else {
		lines.push('Result: passed.');
	}

	return lines;
}
