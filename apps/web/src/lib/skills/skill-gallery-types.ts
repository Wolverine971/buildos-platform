// apps/web/src/lib/skills/skill-gallery-types.ts

export type DomainGuide = {
	id: string;
	name: string;
	shortName: string;
	description: string;
	promise: string;
	startSlug?: string;
	path: string[];
};

export type PackDefinition = {
	id: string;
	name: string;
	kind: 'Pack' | 'Stack';
	job: string;
	description: string;
	slugs: string[];
	order: string[];
	tryPrompt: string;
	handoff: string[];
};

export type SkillGalleryMetadata = {
	family?: string;
	outputs?: string[];
	workflow?: string[];
	useCases?: string[];
	guardrails?: string[];
	tryPrompts?: string[];
};

export type SkillPublicationStatus = 'public' | 'preview' | 'internal';

export type RuntimeSkillPreviewMetadata = {
	displayTitle: string;
	description: string;
	domainId: string;
	family: string;
	familyStart?: boolean;
	outputShapes: string[];
	workflow: string[];
	useCases: string[];
	guardrails: string[];
	starterPrompts: string[];
	lastUpdated: string;
};

export type RuntimeSkillGalleryPreview = {
	publication_status: 'preview';
	slug: string;
	title: string;
	description: string;
	runtime_skill_id: string;
	parent_id?: string;
	skill_type?: string;
	domain_id: string;
	family: string;
	family_start?: boolean;
	output_shapes: string[];
	workflow: string[];
	use_cases: string[];
	guardrails: string[];
	starter_prompts: string[];
	trust: {
		eval_status: 'covered' | 'not-covered';
		last_updated: string;
		safety_notes: string[];
	};
};

export type SkillGalleryCoverage = {
	runtime_total: number;
	public_total: number;
	preview_total: number;
	internal_total: number;
};

export type PublicSkillGalleryMetadata = {
	display_title: string;
	family: string;
	domain_id?: string;
	output_shapes: string[];
	workflow: string[];
	use_cases: string[];
	guardrails: string[];
	starter_prompts: string[];
	source: {
		curated: boolean;
		runtime: boolean;
		blog: boolean;
		fallback: boolean;
	};
	trust: {
		eval_status: 'covered' | 'not-covered';
		last_updated: string;
		safety_notes: string[];
	};
};
