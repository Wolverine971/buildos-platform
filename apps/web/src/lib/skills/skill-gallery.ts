// apps/web/src/lib/skills/skill-gallery.ts
import {
	domainGuides as curatedDomainGuides,
	packDefinitions as curatedPackDefinitions,
	skillMetadataBySlug
} from './skill-gallery-metadata';
import type {
	DomainGuide,
	PackDefinition,
	PublicSkillGalleryMetadata,
	RuntimeSkillGalleryPreview,
	RuntimeSkillPreviewMetadata,
	SkillGalleryCoverage,
	SkillGalleryMetadata
} from './skill-gallery-types';
export type {
	DomainGuide,
	PackDefinition,
	PublicSkillGalleryMetadata,
	RuntimeSkillGalleryPreview,
	RuntimeSkillPreviewMetadata,
	SkillGalleryCoverage,
	SkillPublicationStatus,
	SkillGalleryMetadata
} from './skill-gallery-types';

export type GallerySkillReference = {
	id: string;
	name?: string;
	summary: string;
	path: string;
	url: string;
	when_to_load: string[];
};

export type GallerySkill = {
	slug: string;
	title: string;
	description: string;
	public_skill_id?: string;
	runtime_skill_id?: string;
	skill_type?: string;
	skill_category?: string;
	providers?: string[];
	compatible_agents?: string[];
	stack_with?: string[];
	lineage_people?: string[];
	lineage_sources?: unknown[];
	lineage_stats?: Record<string, number | string | boolean>;
	gallery?: PublicSkillGalleryMetadata;
	references: GallerySkillReference[];
};

export type GallerySkillPost = {
	slug: string;
	title?: string;
	description?: string;
	excerpt?: string;
	tags?: string[];
	readingTime?: number;
	date?: string;
	lastmod?: string;
	relatedSkills?: string[];
	lineageSources?: Array<{
		title: string;
		creator?: string;
	}>;
};

export type GallerySearchMatch = {
	label: string;
	value: string;
};

export type GalleryDomain<TSkill extends GallerySkill = GallerySkill> = DomainGuide & {
	skills: TSkill[];
};

export type GalleryPack<TSkill extends GallerySkill = GallerySkill> = PackDefinition & {
	skills: TSkill[];
};

export type GalleryFamily<TSkill extends GallerySkill = GallerySkill> = {
	id: string;
	name: string;
	skills: TSkill[];
};

export const domainGuides: DomainGuide[] = curatedDomainGuides;
export const packDefinitions: PackDefinition[] = curatedPackDefinitions;

function fromPublicGalleryMetadata(
	metadata?: PublicSkillGalleryMetadata
): SkillGalleryMetadata | undefined {
	if (!metadata) return undefined;
	return {
		family: metadata.family,
		outputs: metadata.output_shapes,
		workflow: metadata.workflow,
		useCases: metadata.use_cases,
		guardrails: metadata.guardrails,
		tryPrompts: metadata.starter_prompts
	};
}

export function getSkillMetadata(
	skill: Pick<GallerySkill, 'slug'> & Partial<Pick<GallerySkill, 'gallery'>>
): SkillGalleryMetadata | undefined {
	const generated = fromPublicGalleryMetadata(skill.gallery);
	const curated = skillMetadataBySlug[skill.slug];
	if (!generated) return curated;
	if (!curated) return generated;

	return {
		family: curated.family ?? generated.family,
		outputs: curated.outputs ?? generated.outputs,
		workflow: curated.workflow ?? generated.workflow,
		useCases: curated.useCases ?? generated.useCases,
		guardrails: curated.guardrails ?? generated.guardrails,
		tryPrompts: curated.tryPrompts ?? generated.tryPrompts
	};
}

export function normalizeSearchText(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export function humanize(value?: string): string {
	if (!value) return 'Uncategorized';
	return value
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function getNumericStat(skill: GallerySkill, key: string): number {
	const value = skill.lineage_stats?.[key];
	return typeof value === 'number' ? value : 0;
}

export function getSkillPath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/skills/${skill.slug}`;
}

export function getPreviewSkillPath(preview: Pick<RuntimeSkillGalleryPreview, 'slug'>): string {
	return `/skills/preview/${preview.slug}`;
}

export function getDomainPath(domain: Pick<DomainGuide, 'id'> | string): string {
	const domainId = typeof domain === 'string' ? domain : domain.id;
	return `/skills/domain/${domainId}`;
}

export function getFamilyId(name: string): string {
	return normalizeSearchText(name).replace(/\s+/g, '-');
}

export function getFamilyPath(family: { name: string } | string): string {
	const familyName = typeof family === 'string' ? family : family.name;
	return `/skills/family/${getFamilyId(familyName)}`;
}

export function getPackPath(pack: Pick<PackDefinition, 'id'> | string): string {
	const packId = typeof pack === 'string' ? pack : pack.id;
	return `/skills/path/${packId}`;
}

export function getTryInBuildOsPath(
	skill: Pick<GallerySkill, 'slug'>,
	starterPrompt?: string
): string {
	const path = `/skills/try/${skill.slug}`;
	if (!starterPrompt?.trim()) return path;
	return `${path}?prompt=${encodeURIComponent(starterPrompt.trim())}`;
}

export function getTryPackInBuildOsPath(pack: Pick<PackDefinition, 'id'> | string): string {
	const packId = typeof pack === 'string' ? pack : pack.id;
	return `/skills/try/path/${packId}`;
}

export function getAgentRepositoryPath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/agent-skills/${skill.slug}`;
}

export function getAgentFilePath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/agent-skills/${skill.slug}/portable/SKILL.md`;
}

export function getBuildOsSkillPath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/agent-skills/${skill.slug}/skill.md`;
}

export function getBundlePath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/agent-skills/${skill.slug}/bundle.zip`;
}

export function getBuildOsMetadataPath(skill: Pick<GallerySkill, 'slug'>): string {
	return `/agent-skills/${skill.slug}/portable/buildos.yaml`;
}

export function getDisplayTitle(
	skill: Pick<GallerySkill, 'title'> & Partial<Pick<GallerySkill, 'gallery'>>
): string {
	if (skill.gallery?.display_title) return skill.gallery.display_title;

	return skill.title
		.replace(/:\s*An Agent Skill.*$/i, '')
		.replace(/:\s*Agent Skill.*$/i, '')
		.replace(/\s*\|\s*BuildOS.*$/i, '')
		.trim();
}

export function getSkillFamily(skill: Pick<GallerySkill, 'slug' | 'skill_type'>): string {
	const metadataFamily = getSkillMetadata(skill)?.family;
	if (metadataFamily) return metadataFamily;

	if (skill.slug.startsWith('cold-email')) return 'Cold Outreach';
	if (
		skill.slug.includes('hook') ||
		skill.slug.includes('story') ||
		skill.slug.includes('viral')
	) {
		return 'Content Craft';
	}
	if (skill.slug.includes('landing-page')) return 'Conversion Paths';
	if (skill.slug.includes('ui-ux')) return 'Interface Quality';
	if (skill.slug.includes('calendar')) return 'Connected Tools';
	return humanize(skill.skill_type);
}

export function getOutputShapes(skill: Pick<GallerySkill, 'slug'>): string[] {
	const metadataOutputs = getSkillMetadata(skill)?.outputs;
	if (metadataOutputs?.length) return metadataOutputs;

	const slug = skill.slug;
	if (slug.includes('cold-email-icp')) return ['segment map', 'signal thesis', 'disqualifiers'];
	if (slug.includes('cold-email')) return ['campaign plan', 'email draft', 'reply routes'];
	if (slug.includes('calendar')) return ['safe action plan', 'event mutation checklist'];
	if (slug.includes('hook')) return ['hook options', 'rewrite pass', 'diagnostic'];
	if (slug.includes('story')) return ['beat map', 'rewrite plan', 'retention audit'];
	if (slug.includes('landing-page')) return ['funnel map', 'questionnaire', 'routing plan'];
	if (slug.includes('ui-ux')) return ['interface audit', 'fix list', 'agent checks'];
	if (slug.includes('viral')) return ['content audit', 'format choice', 'six-filter pass'];
	return ['playbook', 'checklist', 'agent brief'];
}

export function getSkillPromise(skill: GallerySkill, post?: GallerySkillPost): string {
	if (post?.excerpt) return post.excerpt;
	return skill.description;
}

export function buildSkillLaunchPrompt(
	skill: GallerySkill,
	post?: GallerySkillPost,
	starterPrompt?: string
): string {
	const [fallbackPrompt] = getFallbackTryPrompts(skill);
	const prompt = starterPrompt?.trim() || fallbackPrompt;
	const promise = getSkillPromise(skill, post);
	return [
		`Use the ${getDisplayTitle(skill)} skill.`,
		promise ? `Context: ${promise}` : '',
		prompt ? `Starting ask: ${prompt}` : 'Help me run this skill on my current work.'
	]
		.filter(Boolean)
		.join('\n\n');
}

export function buildPreviewSkillLaunchPrompt(
	preview: RuntimeSkillGalleryPreview,
	starterPrompt?: string
): string {
	const prompt =
		preview.starter_prompts.find((candidate) => candidate === starterPrompt?.trim()) ??
		preview.starter_prompts[0];

	return [
		`Use the ${preview.title} skill preview.`,
		`Context: ${preview.description}`,
		prompt ? `Starting ask: ${prompt}` : 'Help me run this workflow on my current work.',
		'Keep the result as an editable draft and pause before any external action.'
	].join('\n\n');
}

export function getPreviewSearchText(preview: RuntimeSkillGalleryPreview): string {
	return [
		preview.title,
		preview.description,
		preview.slug,
		preview.runtime_skill_id,
		preview.skill_type,
		preview.domain_id,
		preview.family,
		...preview.output_shapes,
		...preview.workflow,
		...preview.use_cases,
		...preview.guardrails,
		...preview.starter_prompts
	]
		.filter((value): value is string => Boolean(value))
		.join(' ');
}

export function buildPackLaunchPrompt<TSkill extends GallerySkill>(
	pack: GalleryPack<TSkill>,
	posts: GallerySkillPost[] = []
): string {
	const postBySlug = buildPostBySlug(posts);
	const stages = pack.skills.map((skill, index) => {
		const stage = pack.order[index] ?? getSkillFamily(skill);
		const promise =
			getSkillMetadata(skill)?.useCases?.[0] ??
			getSkillPromise(skill, postBySlug.get(skill.slug));
		return `${index + 1}. ${stage} — ${getDisplayTitle(skill)}${promise ? `: ${promise}` : ''}`;
	});

	return [
		`Run the ${pack.name} as one ordered ${pack.kind.toLowerCase()} workflow.`,
		`Job: ${pack.job}`,
		`Starting ask: ${pack.tryPrompt}`,
		['Stages:', ...stages].join('\n'),
		['Handoff rules:', ...pack.handoff.map((rule) => `- ${rule}`)].join('\n'),
		'Complete each stage in order, carry approved outputs forward, and return one integrated final result.'
	].join('\n\n');
}

export function getSearchText(skill: GallerySkill, post?: GallerySkillPost): string {
	const metadata = getSkillMetadata(skill);
	return [
		skill.title,
		skill.description,
		skill.slug,
		skill.public_skill_id,
		skill.runtime_skill_id,
		skill.skill_type,
		skill.skill_category,
		getSkillFamily(skill),
		...(post?.tags ?? []),
		...(skill.providers ?? []),
		...(skill.compatible_agents ?? []),
		...(skill.stack_with ?? []),
		...(skill.lineage_people ?? []),
		...(post?.relatedSkills ?? []),
		...(post?.lineageSources?.flatMap((source) => [source.title, source.creator]) ?? []),
		...skill.references.flatMap((reference) => [
			reference.name,
			reference.summary,
			reference.path,
			...reference.when_to_load
		]),
		...getOutputShapes(skill),
		...(metadata?.workflow ?? []),
		...(metadata?.useCases ?? []),
		...(metadata?.guardrails ?? []),
		...(metadata?.tryPrompts ?? [])
	]
		.filter((value): value is string => Boolean(value))
		.join(' ');
}

export function getSkillSearchMatches(
	skill: GallerySkill,
	post: GallerySkillPost | undefined,
	query: string
): GallerySearchMatch[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return [];
	const metadata = getSkillMetadata(skill);
	const candidates: Array<{ label: string; values: Array<string | undefined> }> = [
		{ label: 'Name', values: [getDisplayTitle(skill), skill.title] },
		{ label: 'Promise', values: [getSkillPromise(skill, post), skill.description] },
		{ label: 'Domain', values: [humanize(skill.skill_category), skill.skill_category] },
		{ label: 'Family', values: [getSkillFamily(skill)] },
		{ label: 'Output', values: getOutputShapes(skill) },
		{ label: 'Use case', values: metadata?.useCases ?? [] },
		{ label: 'Procedure', values: metadata?.workflow ?? [] },
		{ label: 'Activation', values: metadata?.tryPrompts ?? [] },
		{
			label: 'Related skill',
			values: [...(skill.stack_with ?? []), ...(post?.relatedSkills ?? [])]
		},
		{ label: 'Lineage', values: [...(skill.lineage_people ?? [])] },
		{
			label: 'Source',
			values: post?.lineageSources?.flatMap((source) => [source.title, source.creator]) ?? []
		},
		{
			label: 'Reference',
			values: skill.references.flatMap((reference) => [
				reference.name,
				reference.summary,
				reference.path,
				...reference.when_to_load
			])
		}
	];

	return candidates
		.flatMap(({ label, values }) => {
			const value = values.find(
				(candidate): candidate is string =>
					Boolean(candidate) &&
					normalizeSearchText(candidate ?? '').includes(normalizedQuery)
			);
			return value ? [{ label, value }] : [];
		})
		.slice(0, 3);
}

export function buildSkillBySlug<TSkill extends GallerySkill>(
	skills: TSkill[]
): Map<string, TSkill> {
	return new Map(skills.map((skill) => [skill.slug, skill]));
}

export function buildPostBySlug<TPost extends GallerySkillPost>(
	posts: TPost[]
): Map<string, TPost> {
	return new Map(posts.map((post) => [post.slug, post]));
}

export function buildDomainCards<TSkill extends GallerySkill>(
	skills: TSkill[]
): GalleryDomain<TSkill>[] {
	const domainCards = domainGuides
		.map((domain) => ({
			...domain,
			skills: skills.filter((skill) => skill.skill_category === domain.id)
		}))
		.filter((domain) => domain.skills.length > 0);

	const uncategorizedDomains = Array.from(
		new Set(
			skills
				.map((skill) => skill.skill_category)
				.filter(
					(category): category is string =>
						Boolean(category) && !domainGuides.some((domain) => domain.id === category)
				)
		)
	);

	return [
		...domainCards,
		...uncategorizedDomains.map((category) => ({
			id: category,
			name: humanize(category),
			shortName: humanize(category),
			description: 'Additional public skills in this domain.',
			promise: 'Browse the public skills that share this operating context.',
			path: ['Browse', 'Open skill', 'Use agent files'],
			skills: skills.filter((skill) => skill.skill_category === category)
		}))
	];
}

export function buildPackCards<TSkill extends GallerySkill>(
	skills: TSkill[]
): GalleryPack<TSkill>[] {
	const skillBySlug = buildSkillBySlug(skills);
	return packDefinitions
		.map((pack) => ({
			...pack,
			skills: pack.slugs
				.map((slug) => skillBySlug.get(slug))
				.filter((skill): skill is TSkill => Boolean(skill))
		}))
		.filter((pack) => pack.skills.length > 0);
}

export function getSelectedPackSlugSet<TSkill extends GallerySkill>(
	packCards: GalleryPack<TSkill>[],
	activePack: string
): Set<string> {
	return new Set(
		packCards.find((pack) => pack.id === activePack)?.skills.map((skill) => skill.slug) ?? []
	);
}

export function groupSkillsByFamily<TSkill extends GallerySkill>(
	skills: TSkill[]
): GalleryFamily<TSkill>[] {
	const families = new Map<string, TSkill[]>();
	for (const skill of skills) {
		const family = getSkillFamily(skill);
		const familySkills = families.get(family) ?? [];
		familySkills.push(skill);
		families.set(family, familySkills);
	}
	return Array.from(families.entries()).map(([name, familySkills]) => ({
		id: getFamilyId(name),
		name,
		skills: familySkills
	}));
}

export function getFallbackWorkflow(skill: Pick<GallerySkill, 'slug'>): string[] {
	const metadataWorkflow = getSkillMetadata(skill)?.workflow;
	if (metadataWorkflow?.length) return metadataWorkflow;

	const slug = skill.slug;
	if (slug.includes('cold-email-icp')) {
		return [
			'Define the segment and disqualifiers.',
			'Name the buying signal and timing thesis.',
			'Map the committee and right-person path.',
			'Approve or reject the segment before outreach.'
		];
	}
	if (slug.includes('cold-email')) {
		return [
			'Choose the outreach mode.',
			'Validate deliverability and segmentation.',
			'Draft the offer and researched bridge.',
			'Audit the ask, cadence, and reply routes.'
		];
	}
	if (slug.includes('calendar')) {
		return [
			'Choose the calendar scope.',
			'Search before creating or changing events.',
			'Use exact event IDs for mutations.',
			'Treat recurrence and time zones as high-risk.'
		];
	}
	if (slug.includes('ui-ux')) {
		return [
			'Map the surface region by region.',
			'Check alignment, hierarchy, overflow, and interaction.',
			'Name the highest-leverage fixes.',
			'Turn findings into agent-runnable checks.'
		];
	}
	if (slug.includes('landing-page')) {
		return [
			'Define the scorecard promise.',
			'Map the landing page and questionnaire.',
			'Design the result and routing logic.',
			'Audit whether every step qualifies the lead.'
		];
	}
	if (slug.includes('hook')) {
		return [
			'Name the audience and viewing context.',
			'Select the hook archetype.',
			'Draft multiple opener options.',
			'Audit clarity, curiosity, and payoff alignment.'
		];
	}
	if (slug.includes('story') || slug.includes('viral')) {
		return [
			'Identify the audience belief or attention gap.',
			'Choose the structure and opening beat.',
			'Draft or audit the content path.',
			'Rewrite the weakest retention break.'
		];
	}
	return [
		'Frame the job.',
		'Load the procedure.',
		'Run the checks.',
		'Return a usable artifact.'
	];
}

export function getFallbackUseCases(skill: Pick<GallerySkill, 'slug'>): string[] {
	const metadataUseCases = getSkillMetadata(skill)?.useCases;
	if (metadataUseCases?.length) return metadataUseCases;

	const slug = skill.slug;
	if (slug.includes('cold-email-icp')) {
		return [
			'Turn a broad target list into a usable ICP segment.',
			'Find buying signals before drafting outreach.',
			'Reject weak or mixed segments before a campaign ships.'
		];
	}
	if (slug.includes('cold-email')) {
		return [
			'Plan a cold outbound campaign.',
			'Draft a strategic one-to-one cold email.',
			'Audit an outreach sequence before sending.'
		];
	}
	if (slug.includes('calendar')) {
		return [
			'Prevent duplicate calendar event creation.',
			'Update events with exact IDs and scope.',
			'Handle recurring events with appropriate caution.'
		];
	}
	if (slug.includes('ui-ux')) {
		return [
			'Audit a product screen or dashboard.',
			'Turn visual feedback into concrete fixes.',
			'Give an agent checkable UI quality rules.'
		];
	}
	if (slug.includes('landing-page')) {
		return [
			'Design a scorecard funnel.',
			'Audit a landing page for qualification strength.',
			'Route leads by answers and fit.'
		];
	}
	if (slug.includes('hook')) {
		return [
			'Draft stronger short-form openers.',
			'Audit a blog, video, or social lead.',
			'Generate hook variations for one idea.'
		];
	}
	if (slug.includes('story') || slug.includes('viral')) {
		return [
			'Make founder content hold attention.',
			'Diagnose why a brand post feels flat.',
			'Rewrite content around a clearer retention path.'
		];
	}
	return ['Run the skill as a workflow.', 'Audit an artifact.', 'Create a reusable output.'];
}

export function getFallbackGuardrails(skill: Pick<GallerySkill, 'slug'>): string[] {
	const metadataGuardrails = getSkillMetadata(skill)?.guardrails;
	if (metadataGuardrails?.length) return metadataGuardrails;

	const slug = skill.slug;
	if (slug.includes('cold-email')) {
		return [
			'Do not send outreach automatically.',
			'Do not mix personas or segments in one campaign.',
			'Do not use this for opted-in newsletter or lifecycle email.'
		];
	}
	if (slug.includes('calendar')) {
		return [
			'Do not create events before searching.',
			'Do not mutate recurring events casually.',
			'Do not guess event IDs.'
		];
	}
	if (slug.includes('ui-ux')) {
		return [
			'Do not treat subjective taste as enough.',
			'Do not skip mobile or overflow checks.',
			'Do not add decoration before fixing hierarchy.'
		];
	}
	return [
		'Keep the human in approval-sensitive decisions.',
		'Name assumptions before acting on them.',
		'Return a concrete artifact, not vague advice.'
	];
}

export function getFallbackTryPrompts(skill: Pick<GallerySkill, 'slug'>): string[] {
	const metadataPrompts = getSkillMetadata(skill)?.tryPrompts;
	if (metadataPrompts?.length) return metadataPrompts;

	const slug = skill.slug;
	if (slug.includes('cold-email-icp')) {
		return [
			'Help me define the ICP, buying signal, and disqualifiers for this outbound campaign.',
			'Audit this target segment before I write cold outreach.'
		];
	}
	if (slug.includes('cold-email')) {
		return [
			'Help me design an engagement-first cold outreach campaign for this ICP.',
			'Audit this cold email and tell me what must change before sending.'
		];
	}
	if (slug.includes('calendar')) {
		return [
			'Help me safely create a calendar event without duplicating anything.',
			'Audit this calendar update plan for recurrence, time zone, and exact-ID risk.'
		];
	}
	if (slug.includes('ui-ux')) {
		return [
			'Audit this screen region by region and return the highest-leverage fixes.',
			'Turn this UI critique into agent-checkable rules.'
		];
	}
	if (slug.includes('landing-page')) {
		return [
			'Design a scorecard funnel for this offer and ICP.',
			'Audit this landing page and tell me where the qualification path breaks.'
		];
	}
	if (slug.includes('hook')) {
		return [
			'Generate 12 hook options for this idea and audience.',
			'Audit this opener for clarity, curiosity, and payoff.'
		];
	}
	if (slug.includes('story') || slug.includes('viral')) {
		return [
			'Audit this draft for the first attention break and rewrite that section.',
			'Help me turn this product update into a brand-account post people would actually watch.'
		];
	}
	return ['Run this skill on my current draft.', 'Audit this workflow and return a fix list.'];
}
