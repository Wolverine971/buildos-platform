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
import { strToU8, zipSync } from 'fflate';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
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

/** Schema URI for the Agent Skills well-known discovery index (Cloudflare RFC v0.2.0). */
export const AGENT_SKILLS_DISCOVERY_SCHEMA =
	'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
export const CONNECT_AGENTS_DOCS_URL = `${SITE_URL}/docs/connect-agents`;
/** Heading that opens the generated footer at the end of every downloadable SKILL.md. */
export const PORTABLE_SKILL_FOOTER_HEADING = '## More From BuildOS';
/** Agent Skills spec: 1-64 chars, lowercase alphanumerics and single hyphens, no edge hyphens. */
const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const AGENT_SKILL_DESCRIPTION_MAX_LENGTH = 1024;

/**
 * Strings that only make sense inside the BuildOS repo. The sanitizer removes them from
 * downloads and `agent-skills:check` fails if any survive in a published file.
 */
export const PORTABLE_INTERNAL_LEFTOVER_STRINGS = [
	'internal BuildOS source notes',
	'This is the runtime BuildOS skill',
	'should point back to this file',
	'internal-default',
	'not available at runtime',
	'internal source analyses',
	'the upcoming `',
	'dated analyses linked below'
] as const;

/**
 * Router vocabulary that opens some runtime skill summaries ("Root skill for…", "Child skill
 * under…"). It means nothing to a downloader, so a portable `description` must not open with it;
 * set `portableDescription` in the post frontmatter instead. Fixed-prefix check on our own copy.
 */
export const PORTABLE_DESCRIPTION_INTERNAL_OPENERS = ['Root skill', 'Child skill'] as const;

/** Section labels in the generated download footer; the validator parses the footer by them. */
export const PORTABLE_FOOTER_DOWNLOADS_LABEL = 'Also free to download:';
export const PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL =
	'Run inside BuildOS (free to start; each page has a Try in BuildOS link):';

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

type RuntimeSkillLookupPost = Pick<BlogPost, 'slug' | 'skillId' | 'skillSource' | 'lineagePath'>;

function getSkillReferenceCandidates(post: RuntimeSkillLookupPost): string[] {
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

export function resolveRuntimeSkillForPost(
	post: RuntimeSkillLookupPost
): SkillDefinition | undefined {
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
const MARKDOWN_LINK_INTERNAL_REPO_PATH_PATTERN = new RegExp(
	'\\[([^\\]]+)\\]\\(' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^)]+\\)',
	'g'
);
const INTERNAL_REPO_PATH_ONLY_LINE_PATTERN = new RegExp(
	'^\\s*(?:[-*]\\s+)?`?' + INTERNAL_REPO_PATH_PREFIX_PATTERN + '[^`\\s)]*`?\\s*\\.?\\s*$'
);
const INTERNAL_REPO_PATH_TEST_PATTERN = new RegExp('\\b' + INTERNAL_REPO_PATH_PREFIX_PATTERN);
const LIST_ITEM_PREFIX_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+)/;
// Splits a markdown line into sentences at terminal punctuation followed by whitespace. Used
// only to drop maintainer notes that cite repo paths or the fixed markers below; a misfire
// just keeps or drops one maintainer-facing sentence.
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?]["')\]_*]*)\s+(?=\S)/;

/**
 * Fixed asides in runtime skill sources that point at repo-only material the sanitizer strips
 * (e.g. dated analyses under docs/). Removed verbatim; the surrounding sentence stays.
 */
const PORTABLE_STRIPPED_CONTENT_ASIDES = [' (dated analyses linked below)'];

/** Fixed maintainer notes in runtime skill sources that mean nothing outside the repo. */
const PORTABLE_MAINTAINER_NOTE_MARKERS = [
	'This is the runtime BuildOS skill',
	'should point back to this file',
	'internal source analyses',
	'not available at runtime',
	"match the draft's `lineage.yaml`"
];

function removeBlocksContainingMarkers(body: string, markers: string[]): string {
	if (markers.length === 0) return body;

	return body
		.split(/\n{2,}/)
		.filter((block) => !markers.some((marker) => block.includes(marker)))
		.join('\n\n');
}

function isMaintainerOnlySentence(sentence: string): boolean {
	return (
		INTERNAL_REPO_PATH_TEST_PATTERN.test(sentence) ||
		PORTABLE_MAINTAINER_NOTE_MARKERS.some((marker) => sentence.includes(marker))
	);
}

/**
 * Drops sentences that point at repo-only material (internal paths, maintainer notes) while
 * keeping the rest of the line. Returns null when nothing user-facing is left.
 */
function dropMaintainerOnlySentences(line: string): string | null {
	if (!isMaintainerOnlySentence(line)) return line;

	const prefix = line.match(LIST_ITEM_PREFIX_PATTERN)?.[1] ?? '';
	const kept = line
		.slice(prefix.length)
		.split(SENTENCE_BOUNDARY_PATTERN)
		.filter((sentence) => !isMaintainerOnlySentence(sentence));

	if (kept.length === 0) return null;
	return `${prefix}${kept.join(' ')}`;
}

function isRepoPathOnlyBlock(block: string): boolean {
	const lines = block.split(/\r?\n/).filter((line) => line.trim());
	return (
		lines.length > 0 &&
		lines.every((line) => INTERNAL_REPO_PATH_ONLY_LINE_PATTERN.test(line.trim()))
	);
}

/**
 * Drops a one-line lead-in ending in ":" when the block after it is nothing but repo paths: once
 * the paths are stripped, the lead-in ("Underlying analyses live at:") introduces nothing.
 */
function dropLeadInsToRepoPathLists(body: string): string {
	const blocks = body.split(/\n{2,}/);
	return blocks
		.filter((block, index) => {
			const next = blocks[index + 1];
			const isLeadIn = !block.trim().includes('\n') && block.trimEnd().endsWith(':');
			return !(isLeadIn && next !== undefined && isRepoPathOnlyBlock(next));
		})
		.join('\n\n');
}

function scrubInternalRepoPaths(body: string): string {
	return dropLeadInsToRepoPathLists(body)
		.split(/\r?\n/)
		.filter((line) => !INTERNAL_REPO_PATH_ONLY_LINE_PATTERN.test(line.trim()))
		.map((line) => line.replace(MARKDOWN_LINK_INTERNAL_REPO_PATH_PATTERN, '$1'))
		.map(dropMaintainerOnlySentences)
		.filter((line): line is string => line !== null)
		.join('\n');
}

/**
 * Rewrites repo vocabulary into words a downloader can read. `internal-default` is a provenance
 * tag in the runtime sources meaning "BuildOS's own default, not a sourced threshold".
 */
function rewriteInternalVocabulary(body: string): string {
	const withoutStrippedAsides = PORTABLE_STRIPPED_CONTENT_ASIDES.reduce(
		(text, aside) => text.replaceAll(aside, ''),
		body
	);
	return withoutStrippedAsides
		.replace(/\binternal-default\b/g, 'BuildOS default')
		.replace(/\binternal (default)(s?)\b/g, 'BuildOS $1$2')
		.replace(/\bthe upcoming (`[a-z0-9_-]+`)/g, 'the $1');
}

function sanitizePortableSkillBody(body: string, runtimeSkill?: SkillDefinition): string {
	const withoutComments = body.replace(HTML_COMMENT_PATTERN, '').trim();
	const withoutPrivateReferenceBlocks = removeBlocksContainingMarkers(
		withoutComments,
		getInternalReferenceLeakMarkers(runtimeSkill)
	);

	return rewriteInternalVocabulary(scrubInternalRepoPaths(withoutPrivateReferenceBlocks))
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Reference files ship as-is apart from repo-only comments, paths, and vocabulary. */
function sanitizePortableReferenceContent(content: string): string {
	const sanitized = rewriteInternalVocabulary(
		scrubInternalRepoPaths(content.replace(HTML_COMMENT_PATTERN, '').trim())
	)
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	return `${sanitized}\n`;
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

type PublicAgentSkillEntry = {
	slug: string;
	title: string;
	runtimeSkillId?: string;
};

export type PublicSkillLink = {
	/** Runtime skill id (snake_case) when one exists, else the public slug. */
	id: string;
	title: string;
	/** Site-relative path to the skill's public page. */
	href: string;
	kind: 'agent-skill' | 'preview';
};

let publicAgentSkillEntriesCache: PublicAgentSkillEntry[] | null = null;

/**
 * Published agent-skill posts, resolved synchronously from the raw markdown so the SKILL.md
 * generator can link sibling skills without an async catalog load.
 */
function listPublicAgentSkillEntries(): PublicAgentSkillEntry[] {
	if (publicAgentSkillEntriesCache) return publicAgentSkillEntriesCache;

	const entries: PublicAgentSkillEntry[] = [];
	for (const [path, rawContent] of Object.entries(agentSkillBlogModules)) {
		const slug = path.split('/').at(-1)?.replace(/\.md$/, '');
		const frontmatterSource = rawContent.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
		if (!slug || !frontmatterSource) continue;

		let frontmatter: Record<string, unknown> | null = null;
		try {
			frontmatter = parseYaml(frontmatterSource) as Record<string, unknown> | null;
		} catch {
			continue;
		}
		if (!frontmatter || frontmatter.published !== true) continue;

		const lookupPost: RuntimeSkillLookupPost = { slug };
		if (typeof frontmatter.skillId === 'string') lookupPost.skillId = frontmatter.skillId;
		if (typeof frontmatter.skillSource === 'string') {
			lookupPost.skillSource = frontmatter.skillSource;
		}
		if (typeof frontmatter.lineagePath === 'string') {
			lookupPost.lineagePath = frontmatter.lineagePath;
		}

		entries.push({
			slug,
			title: getDisplayTitle({
				title: typeof frontmatter.title === 'string' ? frontmatter.title : slug
			}),
			runtimeSkillId: resolveRuntimeSkillForPost(lookupPost)?.id
		});
	}

	publicAgentSkillEntriesCache = entries;
	return entries;
}

/**
 * Resolves a skill slug or runtime id to its public page: the long-form agent-skill article when
 * the skill is published, else its gallery preview. Returns null when no public page exists.
 */
export function resolvePublicSkillLink(reference: string): PublicSkillLink | null {
	const runtimeId = kebabToSnake(reference.trim());
	const slug = runtimeId.replace(/_/g, '-');
	const publicEntry = listPublicAgentSkillEntries().find(
		(entry) => entry.slug === slug || entry.runtimeSkillId === runtimeId
	);
	if (publicEntry) {
		return {
			id: publicEntry.runtimeSkillId ?? publicEntry.slug,
			title: publicEntry.title,
			href: `/agent-skills/${publicEntry.slug}`,
			kind: 'agent-skill'
		};
	}

	const preview = previewSkillMetadataByRuntimeId[runtimeId];
	if (preview) {
		return {
			id: runtimeId,
			title: preview.displayTitle,
			href: `/skills/preview/${runtimeSkillIdToPreviewSlug(runtimeId)}`,
			kind: 'preview'
		};
	}

	return null;
}

const BACKTICKED_IDENTIFIER_PATTERN = /`([a-z0-9]+(?:[_-][a-z0-9]+)+)`/g;
const SNAKE_CASE_IDENTIFIER_PATTERN = /\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g;

/**
 * Other BuildOS skills a SKILL.md body points at: declared child skills plus any registered
 * runtime skill id (snake_case, or its kebab-case form in backticks) that appears in the text.
 * Matches structured identifiers against the registry, never free-text meaning.
 */
export function listReferencedRuntimeSkillIds(
	body: string,
	runtimeSkill?: Pick<SkillDefinition, 'id' | 'childSkills'>
): string[] {
	const registeredIds = new Set(listAllSkills().map((skill) => skill.id));
	const referenced = new Set<string>();

	for (const child of runtimeSkill?.childSkills ?? []) {
		if (registeredIds.has(child.id)) referenced.add(child.id);
	}
	for (const match of body.matchAll(BACKTICKED_IDENTIFIER_PATTERN)) {
		const candidate = kebabToSnake(match[1] ?? '');
		if (registeredIds.has(candidate)) referenced.add(candidate);
	}
	for (const match of body.matchAll(SNAKE_CASE_IDENTIFIER_PATTERN)) {
		if (registeredIds.has(match[0])) referenced.add(match[0]);
	}

	if (runtimeSkill?.id) referenced.delete(runtimeSkill.id);
	return [...referenced];
}

function withSkillMdAttribution(url: string, slug: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set('utm_source', 'skill_md');
	parsed.searchParams.set('utm_medium', 'download');
	parsed.searchParams.set('utm_campaign', slug);
	return parsed.toString();
}

function formatFooterSkillLine(skillId: string, link: PublicSkillLink, slug: string): string {
	return `- \`${skillId}\` — ${link.title}: <${withSkillMdAttribution(`${SITE_URL}${link.href}`, slug)}>`;
}

/**
 * Generated footer for every downloadable SKILL.md: where the skill lives, which mentioned skills
 * are also free to download, which run inside BuildOS (preview pages with a Try path), and how to
 * connect BuildOS projects to the reader's agent. Mentioned skills with no public page are left
 * out: the footer only lists what a reader can actually open.
 */
function buildPortableSkillFooter(post: BlogPost, referencedSkillIds: string[]): string {
	const canonicalUrl = withSkillMdAttribution(`${SITE_URL}/agent-skills/${post.slug}`, post.slug);
	const lines = [
		PORTABLE_SKILL_FOOTER_HEADING,
		'',
		`This skill is part of the BuildOS skill library. Guide, updates, and source lineage: <${canonicalUrl}>`
	];

	const linked = referencedSkillIds.flatMap((skillId) => {
		const link = resolvePublicSkillLink(skillId);
		return link ? [{ skillId, link }] : [];
	});
	const sections = [
		{ label: PORTABLE_FOOTER_DOWNLOADS_LABEL, kind: 'agent-skill' },
		{ label: PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL, kind: 'preview' }
	] as const;
	for (const section of sections) {
		const entries = linked.filter((entry) => entry.link.kind === section.kind);
		if (entries.length === 0) continue;
		lines.push('', section.label, '');
		for (const { skillId, link } of entries) {
			lines.push(formatFooterSkillLine(skillId, link, post.slug));
		}
	}

	lines.push(
		'',
		`Connect your BuildOS projects to Claude Code, Codex, or another agent: <${withSkillMdAttribution(CONNECT_AGENTS_DOCS_URL, post.slug)}>`
	);

	return lines.join('\n');
}

function buildPortableSkillMarkdown(
	post: BlogPost,
	runtimeSkill: SkillDefinition | undefined,
	references: PublicAgentSkillReference[]
): string {
	const embeddedPortable = extractEmbeddedPortableSkillMarkdown(post);
	if (!runtimeSkill && embeddedPortable) {
		const embeddedBody = embeddedPortable.trim();
		const footer = buildPortableSkillFooter(
			post,
			listReferencedRuntimeSkillIds(stripFrontmatter(embeddedBody))
		);
		return `${embeddedBody}\n\n${footer}\n`;
	}

	const name = toPortableSkillName(post, runtimeSkill);
	// Runtime summaries are written for the in-product router; posts can override them with copy
	// that says what the skill does and when to use it.
	const description =
		post.portableDescription?.trim() || runtimeSkill?.summary || post.description;
	const sourceMarkdown = runtimeSkill?.rawMarkdown ?? embeddedPortable;
	const body = sourceMarkdown
		? stripFrontmatter(sourceMarkdown)
		: `# ${post.title}\n\n${post.description}`;
	const rewrittenBody = sanitizePortableSkillBody(
		rewriteReferenceLoadLanguage(body, references),
		runtimeSkill
	);
	const referenceSection = buildPortableReferenceSection(references);
	const footer = buildPortableSkillFooter(
		post,
		listReferencedRuntimeSkillIds(`${rewrittenBody}\n${referenceSection}`, runtimeSkill)
	);

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
		referenceSection ? `\n${referenceSection}` : '',
		`\n${footer}`
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
			content: buildPortableSkillMarkdown(post, undefined, []),
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

/**
 * The SKILL.md `name`. The Agent Skills spec requires it to match the install folder, so the
 * bundle directory and the well-known archive name both use this value.
 */
export function getPortableAgentSkillName(post: BlogPost): string {
	return resolvePortableSkillName(post, resolveRuntimeSkillForPost(post));
}

function resolvePortableSkillName(post: BlogPost, runtimeSkill?: SkillDefinition): string {
	if (!runtimeSkill) {
		// Portable-only skills ship their embedded SKILL.md as written, so its name is the folder.
		const embedded = extractEmbeddedPortableSkillMarkdown(post);
		const declared = embedded ? readPortableFrontmatter(embedded).name : undefined;
		if (typeof declared === 'string' && AGENT_SKILL_NAME_PATTERN.test(declared)) {
			return declared;
		}
	}
	return toPortableSkillName(post, runtimeSkill);
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
			files[reference.path] = sanitizePortableReferenceContent(content);
		}
	}

	return {
		slug: post.slug,
		directory: resolvePortableSkillName(post, runtimeSkill),
		files
	};
}

const FALLBACK_BUNDLE_MTIME = new Date(2026, 0, 1, 12, 0, 0);

/** Zip entries carry a fixed timestamp so identical content always yields identical bytes. */
function getBundleMtime(post: BlogPost): Date {
	const day = (post.lastmod || post.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (!day) return FALLBACK_BUNDLE_MTIME;
	const mtime = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12, 0, 0);
	return Number.isNaN(mtime.getTime()) || mtime.getFullYear() < 1980
		? FALLBACK_BUNDLE_MTIME
		: mtime;
}

export type AgentSkillZipLayout = 'directory' | 'root';

/**
 * Deterministic zip of a portable bundle. `directory` nests files under `<name>/` so the
 * download unzips straight into a skills folder; `root` puts SKILL.md at the archive root as the
 * well-known discovery RFC requires.
 */
export function buildAgentSkillBundleZip(
	post: BlogPost,
	layout: AgentSkillZipLayout = 'directory',
	bundle: PortableAgentSkillBundle = buildPortableAgentSkillBundle(post)
): { name: string; bytes: Uint8Array<ArrayBuffer> } {
	const mtime = getBundleMtime(post);
	const files: Record<string, Uint8Array> = {};

	for (const [path, content] of Object.entries(bundle.files)) {
		files[layout === 'directory' ? `${bundle.directory}/${path}` : path] = strToU8(content);
	}

	return {
		name: bundle.directory,
		bytes: new Uint8Array(zipSync(files, { level: 6, mtime }))
	};
}

async function sha256Digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
	const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
	const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0'));
	return `sha256:${hex.join('')}`;
}

function readPortableFrontmatter(markdown: string): Record<string, unknown> {
	const source = markdown.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
	if (!source) return {};
	try {
		const parsed = parseYaml(source);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export function getWellKnownAgentSkillArchivePath(name: string): string {
	return `/.well-known/agent-skills/${name}.zip`;
}

export type AgentSkillsDiscoveryIndex = {
	$schema: typeof AGENT_SKILLS_DISCOVERY_SCHEMA;
	skills: Array<{
		name: string;
		type: 'archive';
		description: string;
		url: string;
		digest: string;
	}>;
};

/**
 * `/.well-known/agent-skills/index.json` per the Agent Skills discovery RFC v0.2.0, so tools
 * like `npx skills add https://build-os.com` can list and install the public skills.
 */
export async function buildAgentSkillsDiscoveryIndex(): Promise<AgentSkillsDiscoveryIndex> {
	const posts = await loadAgentSkillPosts();
	const skills = await Promise.all(
		posts.map(async (post) => {
			const bundle = buildPortableAgentSkillBundle(post);
			const archive = buildAgentSkillBundleZip(post, 'root', bundle);
			const frontmatter = readPortableFrontmatter(bundle.files['SKILL.md'] ?? '');
			const description =
				typeof frontmatter.description === 'string'
					? frontmatter.description
					: post.description;

			return {
				name: archive.name,
				type: 'archive' as const,
				description: description.slice(0, AGENT_SKILL_DESCRIPTION_MAX_LENGTH),
				url: getWellKnownAgentSkillArchivePath(archive.name),
				digest: await sha256Digest(archive.bytes)
			};
		})
	);

	return {
		$schema: AGENT_SKILLS_DISCOVERY_SCHEMA,
		skills
	};
}

export async function findAgentSkillPostByPortableName(
	name: string
): Promise<BlogPost | undefined> {
	const posts = await loadAgentSkillPosts();
	return posts.find((post) => getPortableAgentSkillName(post) === name);
}

/**
 * Raw downloads (.md, .yaml, .zip, references) stay out of search results and point search
 * engines at the skill's one canonical page.
 */
export function getAgentSkillDownloadHeaders(slug: string): Record<string, string> {
	return {
		'x-robots-tag': 'noindex',
		link: `<${SITE_URL}/agent-skills/${slug}>; rel="canonical"`
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
		content: sanitizePortableReferenceContent(payload.content),
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

/** Catalog version = the most recent content change across published skills (YYYY-MM-DD). */
function getAgentSkillCatalogVersion(posts: BlogPost[]): string {
	return posts.reduce((latest, post) => {
		const changed = post.lastmod || post.date || '';
		return changed > latest ? changed : latest;
	}, '2026-07-10');
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
		version: getAgentSkillCatalogVersion(posts),
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

export function findPortableInternalLeftovers(content: string): string[] {
	return PORTABLE_INTERNAL_LEFTOVER_STRINGS.filter((marker) => content.includes(marker));
}

/**
 * The public pages a download footer may link: published agent-skill articles and gallery
 * previews. Built from the catalog being validated, not from the footer generator.
 */
export type PublicSkillPageIndex = {
	agentSkillSlugs: ReadonlySet<string>;
	/** Runtime skill ids (snake_case) that have a published agent-skill article. */
	agentSkillRuntimeIds: ReadonlySet<string>;
	previewSlugs: ReadonlySet<string>;
};

export function buildPublicSkillPageIndex(
	agentSkills: Array<{ slug: string; runtimeSkillId?: string }>
): PublicSkillPageIndex {
	const agentSkillRuntimeIds = new Set(
		agentSkills
			.map((skill) => skill.runtimeSkillId)
			.filter((skillId): skillId is string => Boolean(skillId))
	);
	const registeredIds = new Set(listAllSkills().map((skill) => skill.id));
	const previewSlugs = new Set(
		Object.keys(previewSkillMetadataByRuntimeId)
			.filter((skillId) => registeredIds.has(skillId) && !agentSkillRuntimeIds.has(skillId))
			.map(runtimeSkillIdToPreviewSlug)
	);

	return {
		agentSkillSlugs: new Set(agentSkills.map((skill) => skill.slug)),
		agentSkillRuntimeIds,
		previewSlugs
	};
}

function hasPublicSkillPage(skillId: string, pages: PublicSkillPageIndex): boolean {
	const slug = runtimeSkillIdToPreviewSlug(skillId);
	return (
		pages.agentSkillRuntimeIds.has(skillId) ||
		pages.agentSkillSlugs.has(slug) ||
		pages.previewSlugs.has(slug)
	);
}

/**
 * Download-quality gate for one bundle: Agent Skills spec (`name` and `description` present and
 * well formed, `name` === folder), the BuildOS footer (canonical link, connect-agents link, every
 * listed skill links a real public page in the right section, every mentioned skill that has a
 * page is listed), and no repo-only leftovers in any shipped file.
 */
export function validatePortableAgentSkillBundle(
	post: BlogPost,
	bundle: PortableAgentSkillBundle,
	runtimeSkill: SkillDefinition | undefined,
	pages: PublicSkillPageIndex = buildPublicSkillPageIndex(listPublicAgentSkillEntries())
): AgentSkillValidationIssue[] {
	const issues: AgentSkillValidationIssue[] = [];
	const slug = post.slug || '(missing-slug)';
	const portableSkill = bundle.files['SKILL.md'];

	if (portableSkill?.trim()) {
		validatePortableSkillSpec(issues, slug, portableSkill, bundle.directory);
		validatePortableSkillFooter(issues, post, portableSkill, runtimeSkill, pages);
	}

	for (const [path, content] of Object.entries(bundle.files)) {
		const leftovers = findPortableInternalLeftovers(content);
		if (leftovers.length > 0) {
			addValidationIssue(
				issues,
				'error',
				'portable_internal_leftover',
				`${path} still contains repo-only text: ${leftovers.join(', ')}.`,
				slug
			);
		}
		if (path === 'SKILL.md' || path === 'buildos.yaml') continue;
		const referenceLeaks = findPortableInfrastructureLeaks(content);
		if (referenceLeaks.length > 0) {
			addValidationIssue(
				issues,
				'error',
				'portable_reference_internal_infrastructure_leak',
				`${path} exposes internal infrastructure markers: ${referenceLeaks.join(', ')}.`,
				slug
			);
		}
	}

	return issues;
}

/** Agent Skills spec: `name` and `description` present, `name` format and folder, length. */
function validatePortableSkillSpec(
	issues: AgentSkillValidationIssue[],
	slug: string,
	portableSkill: string,
	folder: string
) {
	const frontmatter = readPortableFrontmatter(portableSkill);
	const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
	const description =
		typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '';

	if (!name) {
		addValidationIssue(
			issues,
			'error',
			'missing_portable_name',
			'Portable SKILL.md frontmatter is missing a non-empty name.',
			slug
		);
	} else if (name.length > 64 || !AGENT_SKILL_NAME_PATTERN.test(name)) {
		addValidationIssue(
			issues,
			'error',
			'invalid_portable_name',
			`Portable SKILL.md name "${name}" must be 1-64 lowercase letters, digits, and single hyphens.`,
			slug
		);
	}
	if (name && name !== folder) {
		addValidationIssue(
			issues,
			'error',
			'portable_name_folder_mismatch',
			`Portable SKILL.md name "${name}" must match its folder "${folder}".`,
			slug
		);
	}
	if (!description) {
		addValidationIssue(
			issues,
			'error',
			'missing_portable_description',
			'Portable SKILL.md frontmatter is missing a non-empty description.',
			slug
		);
	}
	if (description.length > AGENT_SKILL_DESCRIPTION_MAX_LENGTH) {
		addValidationIssue(
			issues,
			'error',
			'portable_description_too_long',
			`Portable SKILL.md description is ${description.length} characters; the limit is ${AGENT_SKILL_DESCRIPTION_MAX_LENGTH}.`,
			slug
		);
	}
	const jargonOpener = PORTABLE_DESCRIPTION_INTERNAL_OPENERS.find((opener) =>
		description.startsWith(opener)
	);
	if (jargonOpener) {
		addValidationIssue(
			issues,
			'error',
			'portable_description_internal_jargon',
			`Portable SKILL.md description opens with BuildOS router vocabulary ("${jargonOpener}"); set portableDescription in the post frontmatter.`,
			slug
		);
	}
}

const FOOTER_LINK_PATTERN = /<(https?:\/\/[^>\s]+)>/g;
const FOOTER_SKILL_ID_PATTERN = /^- `([a-z0-9_-]+)`/;

/**
 * Every download must lead back to BuildOS, and its footer may only promise pages that exist:
 * each listed skill links a published agent-skill article (under "Also free to download") or a
 * gallery preview with a Try path (under "Run inside BuildOS"), and every mentioned skill that
 * has such a page is listed.
 */
function validatePortableSkillFooter(
	issues: AgentSkillValidationIssue[],
	post: BlogPost,
	portableSkill: string,
	runtimeSkill: SkillDefinition | undefined,
	pages: PublicSkillPageIndex
) {
	const slug = post.slug || '(missing-slug)';
	const footerIndex = portableSkill.lastIndexOf(`\n${PORTABLE_SKILL_FOOTER_HEADING}\n`);
	if (footerIndex < 0) {
		addValidationIssue(
			issues,
			'error',
			'missing_portable_footer',
			`Portable SKILL.md is missing the "${PORTABLE_SKILL_FOOTER_HEADING}" footer.`,
			slug
		);
		return;
	}

	const body = portableSkill.slice(0, footerIndex);
	const footer = portableSkill.slice(footerIndex);
	const canonicalLink = `${SITE_URL}/agent-skills/${post.slug}?utm_source=skill_md`;
	if (!footer.includes(canonicalLink) || !footer.includes(CONNECT_AGENTS_DOCS_URL)) {
		addValidationIssue(
			issues,
			'error',
			'incomplete_portable_footer',
			'Portable SKILL.md footer must link the canonical skill page and the connect-agents docs.',
			slug
		);
	}

	const listedSkillIds = new Set<string>();
	let section: 'download' | 'run' | null = null;
	for (const line of footer.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === PORTABLE_FOOTER_DOWNLOADS_LABEL) section = 'download';
		if (trimmed === PORTABLE_FOOTER_RUN_IN_BUILDOS_LABEL) section = 'run';
		if (!trimmed.startsWith('- ')) continue;

		const skillId = trimmed.match(FOOTER_SKILL_ID_PATTERN)?.[1];
		if (skillId) listedSkillIds.add(skillId);
		const links = [...trimmed.matchAll(FOOTER_LINK_PATTERN)].map((match) => match[1] ?? '');
		if (links.length === 0) {
			addValidationIssue(
				issues,
				'error',
				'portable_footer_unlinked_skill',
				`Portable SKILL.md footer lists a skill with no public page: ${trimmed}`,
				slug
			);
			continue;
		}

		for (const link of links) {
			const problem = getFooterSkillLinkProblem(link, section, pages);
			if (problem) {
				addValidationIssue(
					issues,
					'error',
					problem,
					problem === 'portable_footer_misfiled_link'
						? `Portable SKILL.md footer files ${link} under the wrong section.`
						: `Portable SKILL.md footer links ${link}, which is not a public skill page.`,
					slug
				);
			}
		}
	}

	const unlisted = listReferencedRuntimeSkillIds(stripFrontmatter(body), runtimeSkill).filter(
		(skillId) => hasPublicSkillPage(skillId, pages) && !listedSkillIds.has(skillId)
	);
	if (unlisted.length > 0) {
		addValidationIssue(
			issues,
			'error',
			'portable_unlisted_skill_reference',
			`Portable SKILL.md mentions skills with a public page that the footer does not list: ${unlisted.join(', ')}.`,
			slug
		);
	}
}

function getFooterSkillLinkProblem(
	link: string,
	section: 'download' | 'run' | null,
	pages: PublicSkillPageIndex
): 'portable_footer_unknown_link' | 'portable_footer_misfiled_link' | null {
	let pathname: string;
	try {
		const url = new URL(link);
		if (url.origin !== new URL(SITE_URL).origin) return 'portable_footer_unknown_link';
		pathname = url.pathname;
	} catch {
		return 'portable_footer_unknown_link';
	}

	const agentSkillSlug = pathname.match(/^\/agent-skills\/([a-z0-9-]+)$/)?.[1];
	if (agentSkillSlug && pages.agentSkillSlugs.has(agentSkillSlug)) {
		return section === 'download' ? null : 'portable_footer_misfiled_link';
	}
	const previewSlug = pathname.match(/^\/skills\/preview\/([a-z0-9-]+)$/)?.[1];
	if (previewSlug && pages.previewSlugs.has(previewSlug)) {
		return section === 'run' ? null : 'portable_footer_misfiled_link';
	}
	return 'portable_footer_unknown_link';
}

/**
 * `stackWith` entries are slugs: a published skill, a gallery preview, or a registered BuildOS
 * skill (kebab-case of its runtime id). Free text and typos fail.
 */
function isKnownSkillSlug(reference: string, pages: PublicSkillPageIndex): boolean {
	if (!AGENT_SKILL_NAME_PATTERN.test(reference)) return false;
	if (pages.agentSkillSlugs.has(reference) || pages.previewSlugs.has(reference)) return true;
	const runtimeId = kebabToSnake(reference);
	return listAllSkills().some((skill) => skill.id === runtimeId);
}

export function validateAgentSkillCatalogPosts(posts: BlogPost[]): AgentSkillValidationReport {
	const issues: AgentSkillValidationIssue[] = [];
	const slugs = new Set<string>();
	const portableNameOwners = new Map<string, string>();
	const pages = buildPublicSkillPageIndex(
		posts.map((post) => ({
			slug: post.slug,
			runtimeSkillId: resolveRuntimeSkillForPost(post)?.id
		}))
	);
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
		for (const reference of post.stackWith ?? []) {
			if (!isKnownSkillSlug(reference, pages)) {
				addValidationIssue(
					issues,
					'error',
					'unknown_stack_with_skill',
					`stackWith entry "${reference}" is not the slug of a published skill, preview, or registered BuildOS skill.`,
					slug
				);
			}
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
		issues.push(...validatePortableAgentSkillBundle(post, bundle, runtimeSkill, pages));

		const portableName = readPortableFrontmatter(portableSkill ?? '').name;
		if (typeof portableName === 'string' && portableName.trim()) {
			const owner = portableNameOwners.get(portableName);
			if (owner && owner !== slug) {
				addValidationIssue(
					issues,
					'error',
					'duplicate_portable_name',
					`Portable SKILL.md name "${portableName}" is also used by ${owner}; installs would overwrite each other.`,
					slug
				);
			} else {
				portableNameOwners.set(portableName, slug);
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
