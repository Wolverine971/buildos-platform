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
};

export type SkillGalleryMetadata = {
	family?: string;
	outputs?: string[];
	workflow?: string[];
	useCases?: string[];
	guardrails?: string[];
	tryPrompts?: string[];
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
};
