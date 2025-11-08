// apps/web/src/lib/types/template-builder.ts
/**
 * Shared type definitions for the template builder flow.
 */

export type ScopeCatalogMeta = {
	scope: string;
	summary: {
		total_templates: number;
		abstract_templates: number;
		concrete_templates: number;
	};
	realms: Array<{
		realm: string;
		template_count: number;
		exemplar_names: string[];
	}>;
};

export type CatalogCascadeTemplate = {
	id: string;
	name: string;
	type_key: string;
	domain: string;
	deliverable: string;
	variant?: string;
	status: 'draft' | 'active' | 'deprecated';
	is_abstract: boolean;
	summary?: string;
	facet_defaults?: Record<string, unknown> | null;
};

export type CatalogCascade = {
	scope: string;
	realm: string;
	domains: Array<{ slug: string; label: string; template_count: number }>;
	deliverables: Array<{ slug: string; label: string; domains: string[] }>;
	variants: Array<{ slug: string; label: string; parent: string }>;
	templates: CatalogCascadeTemplate[];
};

export type BuilderSelection = {
	scope: string;
	realm: string;
	domain?: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	deliverable?: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	variant?: {
		slug: string;
		label: string;
		isNew?: boolean;
	};
	parent_template_id?: string;
	parent_type_key?: string;
};

export type TemplateAnalyzerSuggestion = {
	type_key: string;
	domain: string;
	deliverable: string;
	variant?: string;
	rationale: string;
	confidence: number;
	match_level: 'variant' | 'deliverable' | 'domain' | 'new';
	parent_template_id?: string;
	parent_type_key?: string;
	is_new_domain?: boolean;
	is_new_deliverable?: boolean;
	is_new_variant?: boolean;
};

export type TemplateBrainDumpPlan = {
	scope: string;
	entity_category: 'autonomous' | 'project_derived' | 'reference';
	realm?: string | null;
	type_key: string;
	type_key_rationale?: string;
	type_key_override_reason?: string | null;
	metadata?: {
		name?: string;
		summary?: string;
		keywords?: string[];
		exemplar_use_cases?: string[];
		output_type?: string;
		typical_scale?: string;
		[key: string]: unknown;
	} | null;
	facet_defaults?: Record<'context' | 'scale' | 'stage', string[]> | Record<string, string[]>;
	fsm?: {
		states?: Array<{
			key?: string;
			label?: string;
			initial?: boolean;
			final?: boolean;
			description?: string;
		}>;
		transitions?: Array<{
			id?: string;
			from: string;
			to: string;
			on?: string;
			label?: string;
			description?: string;
			guard?: string;
			actions?: string[];
		}>;
		metadata?: Record<string, unknown>;
	} | null;
	schema?: Array<{
		field: string;
		type: string;
		required?: boolean;
		description?: string;
		enum?: string[];
		example?: string;
	}> | null;
	open_questions?: string[] | null;
};

export type TemplateAnalyzerResponse = {
	scope: string;
	realm: string;
	primary: TemplateAnalyzerSuggestion | null;
	alternatives: TemplateAnalyzerSuggestion[];
	new_template_options: TemplateAnalyzerSuggestion[];
	structured_plan?: TemplateBrainDumpPlan | null;
};
