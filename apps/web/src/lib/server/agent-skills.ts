// apps/web/src/lib/server/agent-skills.ts
import { SITE_URL } from '$lib/constants/seo';
import { AGENT_SKILLS_CATEGORY_KEY, loadAgentSkillPosts, type BlogPost } from '$lib/utils/blog';
import {
	getDisplayTitle,
	getFallbackGuardrails,
	getFallbackTryPrompts,
	getFallbackUseCases,
	getFallbackWorkflow,
	getOutputShapes,
	getSkillFamily,
	getSkillMetadata
} from '$lib/skills/skill-gallery';
import { previewSkillMetadataByRuntimeId } from '$lib/skills/skill-gallery-metadata';
import { getSkillExpertByName, getSkillExpertPath } from '$lib/skills/skill-experts';
import {
	getSkillByReference,
	listAllSkills
} from '$lib/services/agentic-chat/tools/skills/registry';
import { loadSkillReference } from '$lib/services/agentic-chat/tools/skills/skill-reference-load';
import { canReadSkillReference } from '$lib/services/agentic-chat/tools/skills/skill-reference-visibility';
import { stringify as stringifyYaml } from 'yaml';
import type {
	SkillDefinition,
	SkillLinkedResource,
	SkillReferenceLoadSurface
} from '$lib/services/agentic-chat/tools/skills/types';
import type {
	PublicSkillGalleryMetadata,
	RuntimeSkillGalleryPreview,
	SkillGalleryCoverage,
	SkillPublicationStatus
} from '$lib/skills/skill-gallery';

const agentSkillBlogModules = import.meta.glob<string>('/src/content/blogs/agent-skills/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

const agentSkillEvalModules = import.meta.glob(
	'/src/lib/services/agentic-chat/tools/skills/definitions/*/evals.md'
);

const PUBLIC_AGENT_SKILL_SURFACE: SkillReferenceLoadSurface = 'public_portable';

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
	lineage_profiles: Array<{
		name: string;
		slug: string;
		url: string;
	}>;
	lineage_sources?: BlogPost['lineageSources'];
	lineage_stats?: BlogPost['lineageStats'];
	gallery: PublicSkillGalleryMetadata;
	references: PublicAgentSkillReference[];
};

function getLineageProfileLinks(
	people: string[] | undefined
): AgentSkillIndexItem['lineage_profiles'] {
	return (people ?? []).flatMap((name) => {
		const expert = getSkillExpertByName(name);
		return expert
			? [
					{
						name: expert.name,
						slug: expert.slug,
						url: `${SITE_URL}${getSkillExpertPath(expert)}`
					}
				]
			: [];
	});
}

export type PublicRuntimeSkillResource = {
	id: string;
	name?: string;
	summary: string;
	when_to_load: string[];
};

export type PublicRuntimeSkill = {
	id: string;
	name: string;
	summary: string;
	when_to_use: string[];
	workflow: string[];
	guardrails: string[];
	examples: NonNullable<SkillDefinition['examples']>;
	output_contract?: string;
	notes: string[];
	child_skills: PublicRuntimeSkillResource[];
	reference_modules: PublicRuntimeSkillResource[];
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

function runtimeSkillIdToPreviewSlug(skillId: string): string {
	return skillId.replace(/_/g, '-');
}

export function getRuntimeSkillPublicationStatus(
	skillId: string,
	publicRuntimeSkillIds: ReadonlySet<string>
): SkillPublicationStatus {
	if (publicRuntimeSkillIds.has(skillId)) return 'public';
	if (previewSkillMetadataByRuntimeId[skillId]) return 'preview';
	return 'internal';
}

export function buildRuntimeSkillGalleryPreview(
	skill: SkillDefinition
): RuntimeSkillGalleryPreview | null {
	const metadata = previewSkillMetadataByRuntimeId[skill.id];
	if (!metadata) return null;

	return {
		publication_status: 'preview',
		slug: runtimeSkillIdToPreviewSlug(skill.id),
		title: metadata.displayTitle,
		description: metadata.description,
		runtime_skill_id: skill.id,
		parent_id: skill.parentId,
		skill_type: skill.skillType,
		domain_id: metadata.domainId,
		family: metadata.family,
		family_start: metadata.familyStart,
		output_shapes: metadata.outputShapes,
		workflow: metadata.workflow,
		use_cases: metadata.useCases,
		guardrails: metadata.guardrails,
		starter_prompts: metadata.starterPrompts,
		trust: {
			eval_status: hasRuntimeSkillEval(skill) ? 'covered' : 'not-covered',
			last_updated: metadata.lastUpdated,
			safety_notes: [
				'This preview is a reviewed public synopsis, not the complete internal skill definition.',
				'BuildOS opens an editable draft and does not perform external actions automatically.'
			]
		}
	};
}

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

function cleanRuntimeText(value: string): string {
	return value
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/\s+\*\*\[here\]\*\*/gi, '')
		.replace(/\s+\[here\]/gi, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

function cleanRuntimeList(values: string[] | undefined): string[] {
	return (values ?? []).map(cleanRuntimeText).filter(Boolean);
}

function hasRuntimeSkillEval(skill?: SkillDefinition): boolean {
	if (!skill) return false;
	return Boolean(
		agentSkillEvalModules[
			`/src/lib/services/agentic-chat/tools/skills/definitions/${skill.id}/evals.md`
		]
	);
}

function mapPublicRuntimeResource(resource: SkillLinkedResource): PublicRuntimeSkillResource {
	const payload: PublicRuntimeSkillResource = {
		id: resource.id,
		summary: cleanRuntimeText(resource.summary),
		when_to_load: cleanRuntimeList(resource.whenToLoad)
	};
	if (resource.name) payload.name = resource.name;
	return payload;
}

export function buildPublicRuntimeSkill(
	skill: SkillDefinition | undefined
): PublicRuntimeSkill | null {
	if (!skill) return null;

	return {
		id: skill.id,
		name: skill.name,
		summary: cleanRuntimeText(skill.summary),
		when_to_use: cleanRuntimeList(skill.whenToUse),
		workflow: cleanRuntimeList(skill.workflow),
		guardrails: cleanRuntimeList(skill.guardrails),
		examples: (skill.examples ?? []).map((example) => ({
			description: cleanRuntimeText(example.description),
			next_steps: cleanRuntimeList(example.next_steps)
		})),
		output_contract: skill.outputContract ? cleanRuntimeText(skill.outputContract) : undefined,
		notes: cleanRuntimeList(skill.notes),
		child_skills: (skill.childSkills ?? []).map(mapPublicRuntimeResource),
		reference_modules: (skill.referenceModules ?? [])
			.filter((resource) => canReadSkillReference(resource, PUBLIC_AGENT_SKILL_SURFACE))
			.map(mapPublicRuntimeResource)
	};
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

const INTERNAL_REPO_PATH_PREFIX_PATTERN =
	'(?:apps/web/src|docs/research|docs/technical|docs/marketing|packages|supabase|scripts|tasker)/';
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const HTML_COMMENT_TEST_PATTERN = /<!--[\s\S]*?-->/;
const INTERNAL_REPO_PATH_PATTERN = new RegExp(
	'\\b' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^\\s)\\]`]+',
	'g'
);
const BACKTICKED_INTERNAL_REPO_PATH_PATTERN = new RegExp(
	'`' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^`]*`',
	'g'
);
const MARKDOWN_LINK_INTERNAL_REPO_PATH_PATTERN = new RegExp(
	'\\[([^\\]]+)\\]\\(' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^)]+\\)',
	'g'
);
const INTERNAL_REPO_PATH_ONLY_LINE_PATTERN = new RegExp(
	'^\\s*(?:[-*]\\s+)?`?' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^`\\s)]*`?\\s*\\.?\\s*$'
);
const INTERNAL_REPO_PATH_REPLACEMENT = 'internal BuildOS source notes';

function removeBlocksContainingMarkers(body: string, markers: string[]): string {
	if (markers.length === 0) return body;

	return body
		.split(/\n{2,}/)
		.filter((block) => !markers.some((marker) => block.includes(marker)))
		.join('\n\n');
}

function scrubInternalRepoPaths(body: string): string {
	return body
		.split(/\r?\n/)
		.filter((line) => !INTERNAL_REPO_PATH_ONLY_LINE_PATTERN.test(line.trim()))
		.join('\n')
		.replace(MARKDOWN_LINK_INTERNAL_REPO_PATH_PATTERN, '$1')
		.replace(BACKTICKED_INTERNAL_REPO_PATH_PATTERN, INTERNAL_REPO_PATH_REPLACEMENT)
		.replace(INTERNAL_REPO_PATH_PATTERN, INTERNAL_REPO_PATH_REPLACEMENT);
}

function sanitizePortableSkillBody(body: string, runtimeSkill?: SkillDefinition): string {
	const withoutComments = body.replace(HTML_COMMENT_PATTERN, '').trim();
	const withoutPrivateReferenceBlocks = removeBlocksContainingMarkers(
		withoutComments,
		getInternalReferenceLeakMarkers(runtimeSkill)
	);

	return scrubInternalRepoPaths(withoutPrivateReferenceBlocks)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
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
	const rewrittenBody = sanitizePortableSkillBody(
		rewriteReferenceLoadLanguage(body, references),
		runtimeSkill
	);
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
	const gallery = buildPublicSkillGalleryMetadata(post, runtimeSkill);
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
		lineage_profiles: getLineageProfileLinks(post.lineagePeople),
		lineage_sources: post.lineageSources,
		lineage_stats: post.lineageStats,
		gallery,
		references: references.map((reference) => ({
			id: reference.id,
			path: reference.path,
			summary: reference.summary,
			when_to_load: reference.when_to_load
		}))
	};

	return `${stringifyYaml(metadata).trim()}\n`;
}

function firstNonEmptyList(...lists: Array<string[] | undefined>): string[] {
	return lists.find((list) => list && list.length > 0) ?? [];
}

export function buildPublicSkillGalleryMetadata(
	post: BlogPost,
	runtimeSkill = resolveRuntimeSkillForPost(post)
): PublicSkillGalleryMetadata {
	const runtime = buildPublicRuntimeSkill(runtimeSkill);
	const curated = getSkillMetadata({ slug: post.slug });

	const workflow = firstNonEmptyList(
		curated?.workflow,
		runtime?.workflow,
		getFallbackWorkflow({ slug: post.slug })
	);
	const useCases = firstNonEmptyList(
		curated?.useCases,
		runtime?.when_to_use,
		getFallbackUseCases({ slug: post.slug })
	);
	const guardrails = firstNonEmptyList(
		curated?.guardrails,
		runtime?.guardrails,
		getFallbackGuardrails({ slug: post.slug })
	);
	const starterPrompts = firstNonEmptyList(
		curated?.tryPrompts,
		runtime?.examples.map((example) => example.description),
		getFallbackTryPrompts({ slug: post.slug })
	);

	return {
		display_title: getDisplayTitle({ title: post.title }),
		family: getSkillFamily({ slug: post.slug, skill_type: post.skillType }),
		domain_id: post.skillCategory,
		output_shapes: firstNonEmptyList(curated?.outputs, getOutputShapes({ slug: post.slug })),
		workflow,
		use_cases: useCases,
		guardrails,
		starter_prompts: starterPrompts,
		source: {
			curated: Boolean(curated),
			runtime: Boolean(runtime),
			blog: true,
			fallback:
				!curated?.workflow?.length ||
				!curated?.useCases?.length ||
				!curated?.guardrails?.length ||
				!curated?.tryPrompts?.length ||
				!curated?.outputs?.length
		},
		trust: {
			eval_status: hasRuntimeSkillEval(runtimeSkill) ? 'covered' : 'not-covered',
			last_updated: post.lastmod,
			safety_notes: guardrails
		}
	};
}

export function getAgentSkillMarkdown(post: BlogPost): AgentSkillMarkdownResult | undefined {
	const runtimeSkill = resolveRuntimeSkillForPost(post);
	if (runtimeSkill?.rawMarkdown) {
		const references = listPublicAgentSkillReferences(post, runtimeSkill);
		return {
			content: buildPortableSkillMarkdown(post, runtimeSkill, references),
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
	return Boolean(reference.path) && canReadSkillReference(reference, PUBLIC_AGENT_SKILL_SURFACE);
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

function uniqueSkillsById(skills: SkillDefinition[]): SkillDefinition[] {
	const byId = new Map<string, SkillDefinition>();
	for (const skill of skills) {
		byId.set(skill.id, skill);
	}
	return [...byId.values()];
}

function getInternalReferenceLeakMarkers(skill?: SkillDefinition): string[] {
	const markers = new Set<string>();
	for (const candidateSkill of uniqueSkillsById([
		...(skill ? [skill] : []),
		...listAllSkills()
	])) {
		for (const reference of candidateSkill.referenceModules ?? []) {
			if (canReadSkillReference(reference, PUBLIC_AGENT_SKILL_SURFACE)) continue;
			markers.add(reference.id);
			const path = reference.path ? normalizeReferencePath(reference.path) : null;
			if (path) markers.add(path);
		}
	}
	return [...markers].filter((marker) => marker.length > 0);
}

function findInternalReferenceLeaks(content: string, skill?: SkillDefinition): string[] {
	return getInternalReferenceLeakMarkers(skill).filter((marker) => content.includes(marker));
}

function findInternalRepoPathLeaks(content: string): string[] {
	return [...new Set(content.match(INTERNAL_REPO_PATH_PATTERN) ?? [])];
}

function findPortableInfrastructureLeaks(content: string): string[] {
	const leaks = findInternalRepoPathLeaks(content);
	if (HTML_COMMENT_TEST_PATTERN.test(content)) {
		leaks.push('html_comment');
	}
	return leaks;
}

function buildReferenceUrl(post: BlogPost, referencePath: string): string {
	return `${SITE_URL}/agent-skills/${post.slug}/${referencePath}`;
}

export function listPublicAgentSkillReferences(
	post: BlogPost,
	skill = resolveRuntimeSkillForPost(post)
): PublicAgentSkillReference[] {
	return getPublicReferenceModules(skill)
		.map((reference): PublicAgentSkillReference | null => {
			const path = normalizeReferencePath(reference.path);
			if (!path) return null;
			return {
				id: reference.id,
				name: reference.name,
				summary: reference.summary,
				path,
				url: buildReferenceUrl(post, path),
				when_to_load: reference.whenToLoad
			};
		})
		.filter((reference): reference is PublicAgentSkillReference => Boolean(reference));
}

function loadPublicReferenceContent(
	runtimeSkill: SkillDefinition | undefined,
	reference: PublicAgentSkillReference
): string | undefined {
	if (!runtimeSkill) return undefined;
	const payload = loadSkillReference(runtimeSkill.id, reference.id, {
		surface: PUBLIC_AGENT_SKILL_SURFACE
	});
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

	const payload = loadSkillReference(runtimeSkill.id, reference.id, {
		surface: PUBLIC_AGENT_SKILL_SURFACE
	});
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
		lineage_profiles: getLineageProfileLinks(post.lineagePeople),
		lineage_sources: post.lineageSources,
		lineage_stats: post.lineageStats,
		gallery: buildPublicSkillGalleryMetadata(post, runtimeSkill),
		references: listPublicAgentSkillReferences(post, runtimeSkill)
	};
}

export async function loadAgentSkillIndex(): Promise<{
	version: string;
	generated_at: string;
	skills: AgentSkillIndexItem[];
	previews: RuntimeSkillGalleryPreview[];
	coverage: SkillGalleryCoverage;
}> {
	const posts = await loadAgentSkillPosts();
	const skills = posts.map(buildAgentSkillIndexItem);
	const runtimeSkills = listAllSkills();
	const publicRuntimeSkillIds = new Set(
		skills
			.map((skill) => skill.runtime_skill_id)
			.filter((skillId): skillId is string => Boolean(skillId))
	);
	const previews = runtimeSkills
		.filter(
			(skill) =>
				getRuntimeSkillPublicationStatus(skill.id, publicRuntimeSkillIds) === 'preview'
		)
		.map(buildRuntimeSkillGalleryPreview)
		.filter((preview): preview is RuntimeSkillGalleryPreview => Boolean(preview));
	const coverage: SkillGalleryCoverage = {
		runtime_total: runtimeSkills.length,
		public_total: publicRuntimeSkillIds.size,
		preview_total: previews.length,
		internal_total: runtimeSkills.length - publicRuntimeSkillIds.size - previews.length
	};

	return {
		version: '2026-07-10',
		generated_at: new Date().toISOString(),
		skills,
		previews,
		coverage
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
		if (!indexItem.gallery.display_title.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_display_title',
				'Skill gallery metadata is missing display_title.',
				slug
			);
		}
		if (!indexItem.gallery.family.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_family',
				'Skill gallery metadata is missing family.',
				slug
			);
		}
		if (indexItem.gallery.output_shapes.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_output_shapes',
				'Skill gallery metadata is missing output_shapes.',
				slug
			);
		}
		if (indexItem.gallery.workflow.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_workflow',
				'Skill gallery metadata is missing workflow.',
				slug
			);
		}
		if (indexItem.gallery.use_cases.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_use_cases',
				'Skill gallery metadata is missing use_cases.',
				slug
			);
		}
		if (indexItem.gallery.guardrails.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_guardrails',
				'Skill gallery metadata is missing guardrails.',
				slug
			);
		}
		if (indexItem.gallery.starter_prompts.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_starter_prompts',
				'Skill gallery metadata is missing starter_prompts.',
				slug
			);
		}
		if (!indexItem.gallery.trust.last_updated.trim()) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_last_updated',
				'Skill gallery trust metadata is missing last_updated.',
				slug
			);
		}
		if (indexItem.gallery.trust.safety_notes.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'missing_gallery_safety_notes',
				'Skill gallery trust metadata is missing safety_notes.',
				slug
			);
		}
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
		const publicMarkdownInternalReferenceLeaks = markdown?.content
			? findInternalReferenceLeaks(markdown.content, runtimeSkill)
			: [];
		if (publicMarkdownInternalReferenceLeaks.length > 0) {
			addValidationIssue(
				issues,
				'error',
				'public_skill_markdown_internal_reference_leak',
				`Public skill markdown exposes internal reference markers: ${publicMarkdownInternalReferenceLeaks.join(', ')}.`,
				slug
			);
		}
		const publicMarkdownInfrastructureLeaks = markdown?.content
			? findPortableInfrastructureLeaks(markdown.content)
			: [];
		if (publicMarkdownInfrastructureLeaks.length > 0) {
			addValidationIssue(
				issues,
				'error',
				'public_skill_markdown_internal_infrastructure_leak',
				`Public skill markdown exposes internal infrastructure markers: ${publicMarkdownInfrastructureLeaks.join(', ')}.`,
				slug
			);
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
			const portableSkillInternalReferenceLeaks = findInternalReferenceLeaks(
				portableSkill,
				runtimeSkill
			);
			if (portableSkillInternalReferenceLeaks.length > 0) {
				addValidationIssue(
					issues,
					'error',
					'portable_skill_internal_reference_leak',
					`Portable SKILL.md exposes internal reference markers: ${portableSkillInternalReferenceLeaks.join(', ')}.`,
					slug
				);
			}
			const portableSkillInfrastructureLeaks = findPortableInfrastructureLeaks(portableSkill);
			if (portableSkillInfrastructureLeaks.length > 0) {
				addValidationIssue(
					issues,
					'error',
					'portable_skill_internal_infrastructure_leak',
					`Portable SKILL.md exposes internal infrastructure markers: ${portableSkillInfrastructureLeaks.join(', ')}.`,
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
		} else if (!buildOsMetadata.includes('\ngallery:\n')) {
			addValidationIssue(
				issues,
				'error',
				'missing_buildos_gallery_metadata',
				'Portable buildos.yaml is missing generated gallery metadata.',
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
