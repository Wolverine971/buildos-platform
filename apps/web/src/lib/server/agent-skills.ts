import { SITE_URL } from '$lib/constants/seo';
import { AGENT_SKILLS_CATEGORY_KEY, loadAgentSkillPosts, type BlogPost } from '$lib/utils/blog';
import { getSkillByReference, listAllSkills } from '$lib/services/agentic-chat/tools/skills/registry';
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
			.replace(
				new RegExp(`load\\s+\`${safeId}\``, 'gi'),
				`read \`${localPath}\``
			)
			.replace(
				new RegExp(`load\\s+\`${safePath}\``, 'gi'),
				`read \`${localPath}\``
			)
			.replace(
				new RegExp(`Load\\s+\`${safeId}\``, 'g'),
				`Read \`${localPath}\``
			)
			.replace(
				new RegExp(`Load\\s+\`${safePath}\``, 'g'),
				`Read \`${localPath}\``
			);
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
	const body = sourceMarkdown ? stripFrontmatter(sourceMarkdown) : `# ${post.title}\n\n${post.description}`;
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

function isPublicReferenceModule(reference: SkillLinkedResource): reference is SkillLinkedResource & {
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

	const contentType = filePath.endsWith('.yaml') || filePath.endsWith('.yml')
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

	const reference = getPublicReferenceModules(runtimeSkill).find(
		(module) => candidatePaths.has(normalizeReferencePath(module.path) ?? '')
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
