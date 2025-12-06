// apps/web/src/lib/services/ontology/find-or-create-template.service.ts
/**
 * Find or Create Template Service
 *
 * Unified utility for dynamically finding or creating ontology templates.
 * Consolidates logic from:
 * - TemplateDiscoveryEngine (migration)
 * - ProjectTemplateInferenceService (project-specific)
 * - TemplateAnalyzerService (brain dump analysis)
 *
 * Key Features:
 * - LLM-powered semantic matching and scoring
 * - 70% match threshold for template reuse
 * - Dynamic template creation following family-based taxonomy
 * - Support for all 8 entity types: project, task, plan, goal, document, output, risk, event
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import { TemplateCrudService } from './template-crud.service';
import { resolveTemplateWithClient, type ResolvedTemplate } from './template-resolver.service';

// ============================================
// TYPE DEFINITIONS
// ============================================

type TemplateRow = Database['public']['Tables']['onto_templates']['Row'];

export type EntityScope =
	| 'project'
	| 'task'
	| 'plan'
	| 'goal'
	| 'document'
	| 'output'
	| 'risk'
	| 'event';

export interface PropertyDefinition {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	required?: boolean;
	default?: unknown;
	enum?: string[];
	example?: unknown;
}

export interface WorkflowState {
	key: string;
	label: string;
	description?: string;
	initial?: boolean;
	final?: boolean;
}

export interface WorkflowTransition {
	from: string;
	to: string;
	event: string;
	guards?: unknown[];
	actions?: unknown[];
}

export interface FindOrCreateTemplateOptions {
	/** Entity scope (required) */
	scope: EntityScope;

	/**
	 * Context describing what template is needed.
	 * Can be:
	 * - User brain dump text
	 * - Entity description/narrative
	 * - Keywords describing the work
	 */
	context: string;

	/** User ID for LLM logging and template ownership */
	userId: string;

	/** Optional: Specific type_key to look for first */
	preferredTypeKey?: string;

	/** Optional: Realm/domain hint (e.g., "writer", "developer") */
	realm?: string;

	/** Optional: Facet hints to narrow search */
	facets?: {
		context?: string;
		scale?: string;
		stage?: string;
	};

	/**
	 * Threshold for template match (0-1 scale).
	 * If best match < threshold, create new template.
	 * Default: 0.70 (70%)
	 */
	matchThreshold?: number;

	/**
	 * If false, only return suggestion without creating.
	 * Useful for dry-run/preview scenarios.
	 * Default: true
	 */
	allowCreate?: boolean;

	/**
	 * Optional: Additional schema properties to include
	 * Useful when caller knows specific fields needed
	 */
	additionalProperties?: Record<string, PropertyDefinition>;

	/**
	 * Optional: Example props from the entity being created
	 * Helps LLM infer schema structure
	 */
	exampleProps?: Record<string, unknown>;
}

export interface TemplateSuggestion {
	typeKey: string;
	name: string;
	description: string;
	parentTypeKey?: string | null;
	matchScore: number;
	rationale: string;
	properties: Record<string, PropertyDefinition>;
	workflowStates?: WorkflowState[];
	facetDefaults?: Record<string, string>;
}

export interface FindOrCreateResult {
	/** The template (existing or newly created) */
	template: TemplateRow;

	/** Whether a new template was created */
	created: boolean;

	/** Match score (0-1) for best matching template */
	matchScore?: number;

	/** LLM rationale for match/creation decision */
	matchRationale?: string;

	/** If created, the suggestion that was used */
	suggestion?: TemplateSuggestion;

	/** Resolved template with inheritance applied */
	resolvedTemplate?: ResolvedTemplate | null;
}

interface TemplateSearchResult {
	template: TemplateRow;
	score: number;
	rationale?: string;
}

interface ScopeDefinition {
	typeKeyPattern: string;
	examples: string[];
	familyDescription: string;
	defaultStates: string[];
	defaultTransitions: WorkflowTransition[];
}

interface LLMScoreEntry {
	type_key: string;
	score: number;
	rationale: string;
}

interface LLMScoreResponse {
	scores: LLMScoreEntry[];
}

interface LLMSuggestionResponse {
	type_key: string;
	name: string;
	description: string;
	parent_type_key?: string | null;
	match_score: number;
	rationale: string;
	properties: Record<string, PropertyDefinition>;
	workflow_states?: Array<{
		key: string;
		label: string;
		description?: string;
		initial?: boolean;
		final?: boolean;
	}>;
	facet_defaults?: Record<string, string>;
}

// ============================================
// SCOPE DEFINITIONS
// ============================================

const SCOPE_DEFINITIONS: Record<EntityScope, ScopeDefinition> = {
	project: {
		typeKeyPattern: 'project.{domain}.{deliverable}[.{variant}]',
		examples: ['project.writer.book', 'project.developer.app.mobile', 'project.coach.client'],
		familyDescription: 'Domain represents the actor role, deliverable the primary output',
		defaultStates: ['draft', 'active', 'paused', 'complete', 'archived'],
		defaultTransitions: [
			{ from: 'draft', to: 'active', event: 'start' },
			{ from: 'active', to: 'paused', event: 'pause' },
			{ from: 'paused', to: 'active', event: 'resume' },
			{ from: 'active', to: 'complete', event: 'finish' },
			{ from: 'complete', to: 'archived', event: 'archive' }
		]
	},

	task: {
		typeKeyPattern: 'task.{work_mode}[.{specialization}]',
		examples: ['task.execute', 'task.create', 'task.coordinate.meeting', 'task.research'],
		familyDescription:
			'Work modes: execute, create, refine, research, review, coordinate, admin, plan',
		defaultStates: ['todo', 'in_progress', 'blocked', 'done'],
		defaultTransitions: [
			{ from: 'todo', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'blocked', event: 'block' },
			{ from: 'blocked', to: 'in_progress', event: 'unblock' },
			{ from: 'in_progress', to: 'done', event: 'complete' }
		]
	},

	plan: {
		typeKeyPattern: 'plan.{family}[.{variant}]',
		examples: ['plan.timebox.sprint', 'plan.pipeline.sales', 'plan.phase.project'],
		familyDescription: 'Families: timebox, pipeline, campaign, roadmap, process, phase',
		defaultStates: ['draft', 'active', 'complete'],
		defaultTransitions: [
			{ from: 'draft', to: 'active', event: 'start' },
			{ from: 'active', to: 'complete', event: 'finish' }
		]
	},

	goal: {
		typeKeyPattern: 'goal.{family}[.{variant}]',
		examples: ['goal.outcome.project', 'goal.metric.revenue', 'goal.behavior.cadence'],
		familyDescription:
			'Families: outcome (binary), metric (quantitative), behavior (frequency), learning (skill)',
		defaultStates: ['proposed', 'active', 'achieved', 'abandoned'],
		defaultTransitions: [
			{ from: 'proposed', to: 'active', event: 'accept' },
			{ from: 'active', to: 'achieved', event: 'achieve' },
			{ from: 'active', to: 'abandoned', event: 'abandon' }
		]
	},

	document: {
		typeKeyPattern: 'document.{family}[.{variant}]',
		examples: [
			'document.context.project',
			'document.knowledge.research',
			'document.spec.technical'
		],
		familyDescription: 'Families: context, knowledge, decision, spec, reference, intake',
		defaultStates: ['draft', 'review', 'published', 'archived'],
		defaultTransitions: [
			{ from: 'draft', to: 'review', event: 'submit' },
			{ from: 'review', to: 'published', event: 'publish' },
			{ from: 'review', to: 'draft', event: 'revise' },
			{ from: 'published', to: 'archived', event: 'archive' }
		]
	},

	output: {
		typeKeyPattern: 'output.{family}[.{variant}]',
		examples: ['output.written.article', 'output.media.slide_deck', 'output.software.feature'],
		familyDescription: 'Families: written, media, software, operational',
		defaultStates: ['draft', 'in_progress', 'delivered', 'accepted'],
		defaultTransitions: [
			{ from: 'draft', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'delivered', event: 'deliver' },
			{ from: 'delivered', to: 'accepted', event: 'accept' }
		]
	},

	risk: {
		typeKeyPattern: 'risk.{family}[.{variant}]',
		examples: [
			'risk.technical.security',
			'risk.schedule.dependency',
			'risk.resource.skill_gap'
		],
		familyDescription:
			'Families: technical, schedule, resource, budget, scope, external, quality',
		defaultStates: ['identified', 'analyzing', 'mitigating', 'resolved', 'accepted'],
		defaultTransitions: [
			{ from: 'identified', to: 'analyzing', event: 'analyze' },
			{ from: 'analyzing', to: 'mitigating', event: 'mitigate' },
			{ from: 'mitigating', to: 'resolved', event: 'resolve' },
			{ from: 'analyzing', to: 'accepted', event: 'accept' }
		]
	},

	event: {
		typeKeyPattern: 'event.{family}[.{variant}]',
		examples: [
			'event.work.focus_block',
			'event.collab.meeting.standup',
			'event.marker.deadline'
		],
		familyDescription:
			'Families: work (individual), collab (coordination), marker (deadlines/reminders)',
		defaultStates: ['scheduled', 'in_progress', 'completed', 'cancelled'],
		defaultTransitions: [
			{ from: 'scheduled', to: 'in_progress', event: 'start' },
			{ from: 'in_progress', to: 'completed', event: 'complete' },
			{ from: 'scheduled', to: 'cancelled', event: 'cancel' }
		]
	}
};

// Type key validation regex patterns
const TYPE_KEY_PATTERNS: Record<EntityScope, RegExp> = {
	project: /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
	task: /^task\.[a-z_]+(\.[a-z_]+)?$/,
	plan: /^plan\.[a-z_]+(\.[a-z_]+)?$/,
	goal: /^goal\.[a-z_]+(\.[a-z_]+)?$/,
	output: /^output\.[a-z_]+(\.[a-z_]+)?$/,
	document: /^document\.[a-z_]+(\.[a-z_]+)?$/,
	risk: /^risk\.[a-z_]+(\.[a-z_]+)?$/,
	event: /^event\.[a-z_]+(\.[a-z_]+)?$/
};

// Abstract template penalty factor (0-1, applied as multiplier)
const ABSTRACT_TEMPLATE_PENALTY = 0.8;

// Default match threshold
const DEFAULT_MATCH_THRESHOLD = 0.7;

// Maximum templates to score in one LLM call
const MAX_TEMPLATES_TO_SCORE = 30;

// Valid facet values (must match onto_facet_values table)
const VALID_FACET_VALUES: Record<string, string[]> = {
	context: [
		'personal',
		'client',
		'commercial',
		'internal',
		'open_source',
		'community',
		'academic',
		'nonprofit',
		'startup'
	],
	scale: ['micro', 'small', 'medium', 'large', 'epic'],
	stage: ['discovery', 'planning', 'execution', 'launch', 'maintenance', 'complete']
};

// Cache TTL in milliseconds (1 hour)
const CACHE_TTL_MS = 60 * 60 * 1000;

// ============================================
// BASE TEMPLATE AUTO-CREATION CONFIGURATION
// ============================================

/**
 * Minimum type_key depth by scope.
 * At this depth, no parent template is needed (it's already a base template).
 *
 * Examples:
 * - project: 3 segments = project.domain.deliverable (e.g., project.writer.book)
 * - task: 2 segments = task.work_mode (e.g., task.execute)
 */
const SCOPE_MIN_DEPTHS: Record<EntityScope, number> = {
	project: 3, // project.domain.deliverable
	task: 2, // task.work_mode
	plan: 2, // plan.family
	goal: 2, // goal.family
	document: 2, // document.family
	output: 2, // output.family
	risk: 2, // risk.family
	event: 2 // event.family
};

/**
 * LLM response type for base template schema generation.
 */
interface LLMBaseTemplateSchemaResponse {
	name: string;
	description: string;
	properties: Record<
		string,
		{
			type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
			description: string;
			required?: boolean;
			enum?: string[];
			items?: { type: string };
			format?: string;
			default?: unknown;
		}
	>;
}

// ============================================
// TEMPLATE CACHE (LRU with TTL)
// ============================================

/** Default max cache sizes to prevent unbounded memory growth */
const DEFAULT_MAX_TYPE_KEY_CACHE_SIZE = 5000;
const DEFAULT_MAX_SEARCH_CACHE_SIZE = 1000;

interface CacheEntry<T> {
	value: T;
	timestamp: number;
	lastAccess: number; // For LRU tracking
}

/**
 * In-memory cache for template lookups and search results.
 * Uses TTL-based expiry AND LRU eviction to ensure freshness and bounded memory.
 *
 * LRU eviction prevents unbounded memory growth during large migrations
 * where 100K+ unique type_keys could be encountered.
 */
class TemplateCache {
	private readonly typeKeyCache = new Map<string, CacheEntry<TemplateRow>>();
	private readonly searchCache = new Map<string, CacheEntry<TemplateSearchResult[]>>();
	private readonly ttl: number;
	private readonly maxTypeKeySize: number;
	private readonly maxSearchSize: number;

	constructor(
		ttlMs: number = CACHE_TTL_MS,
		maxTypeKeySize: number = DEFAULT_MAX_TYPE_KEY_CACHE_SIZE,
		maxSearchSize: number = DEFAULT_MAX_SEARCH_CACHE_SIZE
	) {
		this.ttl = ttlMs;
		this.maxTypeKeySize = maxTypeKeySize;
		this.maxSearchSize = maxSearchSize;
	}

	/**
	 * Get cached template by type_key (updates LRU access time)
	 */
	getByTypeKey(typeKey: string): TemplateRow | null {
		const entry = this.typeKeyCache.get(typeKey);
		if (!entry) return null;
		if (this.isExpired(entry)) {
			this.typeKeyCache.delete(typeKey);
			return null;
		}
		// Update last access time for LRU
		entry.lastAccess = Date.now();
		return entry.value;
	}

	/**
	 * Cache a template by type_key (with LRU eviction if at capacity)
	 */
	setByTypeKey(typeKey: string, template: TemplateRow): void {
		// Evict oldest entries if at capacity
		if (this.typeKeyCache.size >= this.maxTypeKeySize) {
			this.evictOldest(this.typeKeyCache, Math.ceil(this.maxTypeKeySize * 0.1)); // Evict 10%
		}

		const now = Date.now();
		this.typeKeyCache.set(typeKey, {
			value: template,
			timestamp: now,
			lastAccess: now
		});
	}

	/**
	 * Get cached search results (updates LRU access time)
	 */
	getSearchResults(cacheKey: string): TemplateSearchResult[] | null {
		const entry = this.searchCache.get(cacheKey);
		if (!entry) return null;
		if (this.isExpired(entry)) {
			this.searchCache.delete(cacheKey);
			return null;
		}
		// Update last access time for LRU
		entry.lastAccess = Date.now();
		return entry.value;
	}

	/**
	 * Cache search results (with LRU eviction if at capacity)
	 */
	setSearchResults(cacheKey: string, results: TemplateSearchResult[]): void {
		// Evict oldest entries if at capacity
		if (this.searchCache.size >= this.maxSearchSize) {
			this.evictOldest(this.searchCache, Math.ceil(this.maxSearchSize * 0.1)); // Evict 10%
		}

		const now = Date.now();
		this.searchCache.set(cacheKey, {
			value: results,
			timestamp: now,
			lastAccess: now
		});
	}

	/**
	 * Build cache key for search operations
	 */
	buildSearchKey(scope: EntityScope, realm?: string, contextHash?: string): string {
		return `search:${scope}:${realm ?? 'any'}:${contextHash ?? 'none'}`;
	}

	/**
	 * Hash context string for cache key
	 */
	hashContext(context: string): string {
		// Simple hash for cache key (not cryptographic)
		let hash = 0;
		for (let i = 0; i < context.length; i++) {
			const char = context.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return Math.abs(hash).toString(36);
	}

	/**
	 * Invalidate cache for a specific type_key (e.g., after creation)
	 */
	invalidateTypeKey(typeKey: string): void {
		this.typeKeyCache.delete(typeKey);
		// Also clear search cache since new template affects search results
		this.searchCache.clear();
	}

	/**
	 * Clear all caches
	 */
	clear(): void {
		this.typeKeyCache.clear();
		this.searchCache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		typeKeyCount: number;
		searchCount: number;
		maxTypeKeySize: number;
		maxSearchSize: number;
	} {
		return {
			typeKeyCount: this.typeKeyCache.size,
			searchCount: this.searchCache.size,
			maxTypeKeySize: this.maxTypeKeySize,
			maxSearchSize: this.maxSearchSize
		};
	}

	private isExpired<T>(entry: CacheEntry<T>): boolean {
		return Date.now() - entry.timestamp > this.ttl;
	}

	/**
	 * Evict the N oldest entries by lastAccess time (LRU eviction)
	 */
	private evictOldest<T>(cache: Map<string, CacheEntry<T>>, count: number): void {
		if (cache.size === 0 || count <= 0) return;

		// Get all entries sorted by lastAccess (oldest first)
		const entries = Array.from(cache.entries()).sort(
			(a, b) => a[1].lastAccess - b[1].lastAccess
		);

		// Remove the oldest N entries
		const toRemove = Math.min(count, entries.length);
		for (let i = 0; i < toRemove; i++) {
			const entry = entries[i];
			if (entry) {
				cache.delete(entry[0]);
			}
		}

		console.info(
			`[TemplateCache] LRU eviction: removed ${toRemove} entries, cache size now ${cache.size}`
		);
	}
}

// Global cache instance (shared across service instances)
const globalTemplateCache = new TemplateCache();

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class FindOrCreateTemplateService {
	private readonly cache: TemplateCache;

	constructor(
		private readonly client: TypedSupabaseClient,
		private readonly llm: SmartLLMService,
		cache?: TemplateCache
	) {
		this.cache = cache ?? globalTemplateCache;
	}

	/**
	 * Clear the template cache (useful for testing or after bulk operations)
	 */
	clearCache(): void {
		this.cache.clear();
		console.info('[FindOrCreateTemplate] Cache cleared');
	}

	/**
	 * Simple method to ensure a template exists for a given type_key.
	 *
	 * Unlike `findOrCreate`, this doesn't do context-aware matching - it just:
	 * 1. Checks if the exact type_key exists
	 * 2. Creates a basic template if not
	 *
	 * Use this for just-in-time template creation when you already know the type_key.
	 */
	async ensureTemplateExists(params: {
		scope: EntityScope;
		typeKey: string;
		userId: string;
		nameHint?: string;
		props?: Record<string, unknown>;
	}): Promise<TemplateRow> {
		const { scope, typeKey, userId, nameHint, props } = params;

		// Normalize type_key
		const normalized = this.normalizeTypeKey(typeKey, scope);
		if (!normalized) {
			throw new Error(`[FindOrCreateTemplate] Invalid type_key: ${typeKey}`);
		}

		// Check cache first
		const cached = this.cache.getByTypeKey(normalized);
		if (cached) {
			return cached;
		}

		// Check database
		const existing = await this.fetchTemplateByTypeKey(normalized);
		if (existing) {
			return existing;
		}

		// Check if template exists in different scope (scope conflict)
		const { data: conflict } = await this.client
			.from('onto_templates')
			.select('scope')
			.eq('type_key', normalized)
			.maybeSingle();

		if (conflict) {
			console.warn(
				`[FindOrCreateTemplate] Template ${normalized} exists in scope ${conflict.scope}, skipping creation`
			);
			// Return a dummy template for the existing type_key
			const { data: existingInOtherScope } = await this.client
				.from('onto_templates')
				.select('*')
				.eq('type_key', normalized)
				.single();
			if (existingInOtherScope) {
				return existingInOtherScope as TemplateRow;
			}
		}

		// Create a basic template
		console.info(`[FindOrCreateTemplate] Creating basic template: ${normalized}`);

		// CRITICAL: Ensure all ancestor templates exist first
		let parentTemplateId: string | null = null;
		if (!this.isAtMinimumDepth(normalized, scope)) {
			const immediateParent = await this.ensureAncestorTemplatesExist(
				normalized,
				scope,
				userId
			);
			parentTemplateId = immediateParent?.id ?? null;
		}

		// Build schema from props if provided
		const schema = this.buildSchemaFromProps(scope, props);

		// Build FSM from scope defaults
		const fsm = this.buildFSM(undefined, normalized, scope);

		const result = await TemplateCrudService.createTemplate(this.client, {
			scope,
			type_key: normalized,
			name: nameHint ?? this.humanizeTypeKey(normalized),
			status: 'active',
			parent_template_id: parentTemplateId,
			is_abstract: false,
			schema,
			fsm,
			default_props: {},
			default_views: [],
			facet_defaults: {},
			metadata: {
				created_by_ensure_template: true,
				created_at: new Date().toISOString()
			} as Json,
			created_by: userId
		});

		if (!result.success || !result.data) {
			throw new Error(
				`[FindOrCreateTemplate] Failed to create template ${normalized}: ${result.error ?? 'Unknown error'}`
			);
		}

		const created = result.data as TemplateRow;

		// Cache the new template
		this.cache.setByTypeKey(normalized, created);

		return created;
	}

	/**
	 * Build a basic schema from props (for ensureTemplateExists)
	 */
	private buildSchemaFromProps(_scope: EntityScope, props?: Record<string, unknown>): Json {
		if (!props || Object.keys(props).length === 0) {
			return {
				type: 'object',
				properties: {},
				required: []
			} as Json;
		}

		const properties: Record<string, Json> = {};

		for (const [key, value] of Object.entries(props)) {
			// Skip facets (handled separately)
			if (key === 'facets') continue;

			// Infer type from value
			const fieldType = this.inferFieldType(value);
			properties[key] = {
				type: fieldType,
				description: this.humanizeFieldName(key)
			} as Json;
		}

		return {
			type: 'object',
			properties,
			required: []
		} as Json;
	}

	/**
	 * Infer JSON Schema type from a value
	 */
	private inferFieldType(value: unknown): string {
		if (value === null || value === undefined) return 'string';
		if (Array.isArray(value)) return 'array';
		if (typeof value === 'object') return 'object';
		if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
		if (typeof value === 'boolean') return 'boolean';
		return 'string';
	}

	/**
	 * Convert field name to human-readable description
	 */
	private humanizeFieldName(fieldName: string): string {
		return fieldName
			.replace(/_/g, ' ')
			.replace(/([A-Z])/g, ' $1')
			.trim()
			.replace(/^./, (s) => s.toUpperCase());
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): { typeKeyCount: number; searchCount: number } {
		return this.cache.getStats();
	}

	// ============================================
	// BASE TEMPLATE AUTO-CREATION METHODS
	// ============================================

	/**
	 * Get all ancestor type_keys for a given type_key.
	 * Returns ancestors from immediate parent to root (exclusive of templates at minimum depth).
	 *
	 * @example
	 * // For project scope (minDepth=3):
	 * getAncestorTypeKeys('project.writer.book.fiction.romance', 'project')
	 * // Returns: ['project.writer.book.fiction', 'project.writer.book']
	 *
	 * // For task scope (minDepth=2):
	 * getAncestorTypeKeys('task.execute.deploy', 'task')
	 * // Returns: ['task.execute']
	 *
	 * // At minimum depth (no ancestors needed):
	 * getAncestorTypeKeys('task.execute', 'task')
	 * // Returns: []
	 */
	private getAncestorTypeKeys(typeKey: string, scope: EntityScope): string[] {
		const parts = typeKey.split('.');
		const minDepth = SCOPE_MIN_DEPTHS[scope];
		const ancestors: string[] = [];

		// Start from one level up, stop at minDepth
		for (let depth = parts.length - 1; depth >= minDepth; depth--) {
			const ancestorKey = parts.slice(0, depth).join('.');
			ancestors.push(ancestorKey);
		}

		return ancestors; // Ordered: immediate parent first, then grandparents
	}

	/**
	 * Check if a type_key is at the minimum depth for its scope (i.e., it's a base template).
	 */
	private isAtMinimumDepth(typeKey: string, scope: EntityScope): boolean {
		const parts = typeKey.split('.');
		const minDepth = SCOPE_MIN_DEPTHS[scope];
		return parts.length <= minDepth;
	}

	/**
	 * Ensures all ancestor templates exist for a given type_key.
	 * Creates missing ancestors from root to leaf with appropriate defaults.
	 *
	 * @returns The immediate parent template (or null if at minimum depth)
	 */
	private async ensureAncestorTemplatesExist(
		typeKey: string,
		scope: EntityScope,
		userId: string
	): Promise<TemplateRow | null> {
		const ancestors = this.getAncestorTypeKeys(typeKey, scope);

		if (ancestors.length === 0) {
			// At minimum depth, no ancestors needed
			return null;
		}

		// Process ancestors from root to leaf (reverse order)
		// This ensures parents exist before children
		const ancestorsRootFirst = [...ancestors].reverse();

		let lastCreatedOrFound: TemplateRow | null = null;
		let createdCount = 0;
		let foundCount = 0;

		for (const ancestorKey of ancestorsRootFirst) {
			// Check if ancestor exists
			let ancestor = await this.fetchTemplateByTypeKey(ancestorKey);

			if (!ancestor) {
				// Determine parent for this ancestor
				let parentId: string | null = null;
				if (lastCreatedOrFound) {
					parentId = lastCreatedOrFound.id;
				}

				// Create the ancestor template
				try {
					ancestor = await this.createBaseTemplate({
						scope,
						typeKey: ancestorKey,
						parentTemplateId: parentId,
						userId,
						createdForVariant: typeKey
					});
					createdCount++;

					console.info(
						`[FindOrCreateTemplate] AUTO_CREATED_BASE typeKey=${ancestorKey} ` +
							`parentId=${parentId ?? 'none'} forVariant=${typeKey}`
					);
				} catch (error) {
					// Handle race condition: another process may have created it
					if (this.isUniqueConstraintViolation(error)) {
						ancestor = await this.fetchTemplateByTypeKey(ancestorKey);
						if (!ancestor) {
							throw error; // Something else went wrong
						}
						foundCount++;
					} else {
						throw error;
					}
				}
			} else {
				foundCount++;
			}

			lastCreatedOrFound = ancestor;
		}

		if (createdCount > 0 || foundCount > 0) {
			console.info(
				`[FindOrCreateTemplate] ANCESTOR_CHAIN_ENSURED variant=${typeKey} ` +
					`ancestors=${JSON.stringify(ancestors)} created=${createdCount} found=${foundCount}`
			);
		}

		// Return the immediate parent (last in our processing order)
		return lastCreatedOrFound;
	}

	/**
	 * Check if an error is a unique constraint violation (for race condition handling).
	 */
	private isUniqueConstraintViolation(error: unknown): boolean {
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			return (
				message.includes('unique') ||
				message.includes('duplicate') ||
				message.includes('23505') // PostgreSQL unique violation code
			);
		}
		return false;
	}

	/**
	 * Creates a base template with LLM-generated schema.
	 * Used for auto-creating missing ancestor templates.
	 */
	private async createBaseTemplate(params: {
		scope: EntityScope;
		typeKey: string;
		parentTemplateId: string | null;
		userId: string;
		createdForVariant: string;
	}): Promise<TemplateRow> {
		const { scope, typeKey, parentTemplateId, userId, createdForVariant } = params;

		// Generate schema using LLM based on type_key semantics
		const llmResult = await this.generateBaseTemplateSchema(typeKey, scope, userId);

		// Build the JSON schema from LLM response
		const schema = this.buildSchemaFromLLMResponse(llmResult);

		// Build FSM from scope defaults
		const fsm = this.buildFSM(undefined, typeKey, scope);

		// Create the template
		const result = await TemplateCrudService.createTemplate(this.client, {
			scope,
			type_key: typeKey,
			name: llmResult.name || this.humanizeTypeKey(typeKey),
			status: 'active',
			parent_template_id: parentTemplateId,
			is_abstract: true, // Base templates are abstract
			schema,
			fsm,
			default_props: {},
			default_views: [],
			facet_defaults: {},
			metadata: {
				description:
					llmResult.description || `Base template for ${this.humanizeTypeKey(typeKey)}`,
				auto_created: true,
				auto_created_at: new Date().toISOString(),
				auto_created_for_variant: createdForVariant,
				category: this.inferCategory(typeKey, scope),
				llm_generated_schema: true
			} as Json,
			created_by: userId
		});

		if (!result.success || !result.data) {
			throw new Error(
				`[FindOrCreateTemplate] Failed to create base template ${typeKey}: ${result.error ?? 'Unknown error'}`
			);
		}

		const created = result.data as TemplateRow;

		// Cache the new template
		this.cache.setByTypeKey(typeKey, created);

		return created;
	}

	/**
	 * Generate schema properties for a base template using LLM.
	 * The LLM infers appropriate properties based on the type_key semantics.
	 */
	private async generateBaseTemplateSchema(
		typeKey: string,
		scope: EntityScope,
		userId: string
	): Promise<LLMBaseTemplateSchemaResponse> {
		const scopeInfo = SCOPE_DEFINITIONS[scope];

		const systemPrompt = `You are an ontology schema designer. Generate a JSON schema for a base template.

The template type_key follows this pattern: ${scopeInfo.typeKeyPattern}
Family description: ${scopeInfo.familyDescription}

Your task is to generate appropriate schema properties for this BASE template that:
1. Are semantically relevant to the type_key meaning
2. Will be inherited by more specific variant templates
3. Are generic enough to apply to all variants in this family
4. Use standard JSON Schema types: string, number, integer, boolean, array, object

Guidelines:
- Generate 3-6 meaningful properties (not too many, not too few)
- Properties should capture the essence of this template family
- Use snake_case for property names
- Include clear descriptions for each property
- BE VERY CONSERVATIVE with required fields (usually 0-1 at most)
- CRITICAL: If a field is marked required, you MUST provide a sensible default value
  - For numbers: use 0 as default
  - For strings: use "" (empty string) as default
  - For booleans: use false as default
  - For arrays: use [] as default
- For enums, provide reasonable default options
- Think about what data users would want to track for this type of ${scope}
- Remember: templates will be used for migration from legacy data which may not have all fields`;

		const userPrompt = `Generate schema for base template: ${typeKey}

Scope: ${scope}
Human-readable name: ${this.humanizeTypeKey(typeKey)}

Return JSON with:
{
  "name": "Human-readable template name",
  "description": "When to use this template (1-2 sentences)",
  "properties": {
    "property_name": {
      "type": "string|number|integer|boolean|array|object",
      "description": "What this property captures",
      "required": false,
      "enum": ["option1", "option2"] // optional, for string enums
      "items": { "type": "string" } // for arrays
    }
  }
}

Example for project.writer.book:
{
  "name": "Book Project",
  "description": "Template for book writing projects including novels, non-fiction, and other long-form written works.",
  "properties": {
    "genre": {
      "type": "string",
      "description": "The book's genre or category",
      "enum": ["fiction", "non-fiction", "memoir", "technical", "self-help", "other"]
    },
    "target_word_count": {
      "type": "integer",
      "description": "Target word count for the completed book"
    },
    "working_title": {
      "type": "string",
      "description": "Current working title of the book"
    },
    "target_audience": {
      "type": "string",
      "description": "Primary intended readership"
    }
  }
}

Now generate for: ${typeKey}`;

		try {
			const response = await this.llm.getJSONResponse<LLMBaseTemplateSchemaResponse>({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'balanced',
				temperature: 0.3,
				validation: {
					retryOnParseError: true,
					maxRetries: 2
				},
				operationType: 'find_or_create_template.base_schema_generation'
			});

			if (!response || !response.properties) {
				console.warn(
					`[FindOrCreateTemplate] LLM returned empty schema for ${typeKey}, using minimal fallback`
				);
				return this.getMinimalFallbackSchema(typeKey, scope);
			}

			return response;
		} catch (error) {
			console.error(
				`[FindOrCreateTemplate] Failed to generate schema for ${typeKey}:`,
				error
			);
			// Return minimal fallback schema on error
			return this.getMinimalFallbackSchema(typeKey, scope);
		}
	}

	/**
	 * Build JSON Schema from LLM response.
	 */
	private buildSchemaFromLLMResponse(llmResponse: LLMBaseTemplateSchemaResponse): Json {
		const properties: Record<string, Json> = {};
		const required: string[] = [];

		for (const [key, def] of Object.entries(llmResponse.properties || {})) {
			// Auto-generate type-appropriate default for required fields missing defaults
			if (def.required && def.default === undefined) {
				const autoDefault = this.getTypeAppropriateDefault(def.type || 'string');
				console.warn(
					`[FindOrCreateTemplate] Auto-generating default for required property "${key}" (type: ${def.type || 'string'}): ${JSON.stringify(autoDefault)}`
				);
				def.default = autoDefault;
			}

			const prop: Record<string, unknown> = {
				type: def.type || 'string'
			};

			if (def.description !== undefined) {
				prop.description = def.description;
			}

			if (def.enum && def.enum.length > 0) {
				prop.enum = def.enum;
			}
			if (def.items) {
				prop.items = def.items;
			}
			if (def.format) {
				prop.format = def.format;
			}
			if (def.default !== undefined) {
				prop.default = def.default;
			}

			properties[key] = prop as Json;

			if (def.required) {
				required.push(key);
			}
		}

		return {
			type: 'object',
			properties,
			required
		} as Json;
	}

	/**
	 * Get a minimal fallback schema when LLM generation fails.
	 */
	private getMinimalFallbackSchema(
		typeKey: string,
		_scope: EntityScope
	): LLMBaseTemplateSchemaResponse {
		return {
			name: this.humanizeTypeKey(typeKey),
			description: `Base template for ${this.humanizeTypeKey(typeKey)}`,
			properties: {
				notes: {
					type: 'string',
					description: 'Additional notes or context'
				}
			}
		};
	}

	/**
	 * Infer a category from the type_key structure.
	 */
	private inferCategory(typeKey: string, scope: EntityScope): string {
		const parts = typeKey.split('.');

		if (scope === 'project' && parts.length >= 2) {
			// project.writer.book -> "Writer"
			return this.humanizeSlug(parts[1] ?? 'general');
		}

		if (parts.length >= 2) {
			// task.execute -> "Execute", plan.timebox -> "Timebox"
			return this.humanizeSlug(parts[1] ?? 'general');
		}

		return 'General';
	}

	/**
	 * Convert a slug to human-readable form.
	 */
	private humanizeSlug(slug: string): string {
		return slug
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	/**
	 * Main entry point: find an existing template or create a new one
	 */
	async findOrCreate(options: FindOrCreateTemplateOptions): Promise<FindOrCreateResult> {
		const startTime = Date.now();
		const threshold = options.matchThreshold ?? DEFAULT_MATCH_THRESHOLD;
		const allowCreate = options.allowCreate ?? true;

		// Log entry
		console.info(
			`[FindOrCreateTemplate] START scope=${options.scope} threshold=${threshold} allowCreate=${allowCreate}` +
				(options.preferredTypeKey ? ` preferredTypeKey=${options.preferredTypeKey}` : '') +
				(options.realm ? ` realm=${options.realm}` : '')
		);

		try {
			// 1. If preferred type_key provided, check if it exists
			if (options.preferredTypeKey) {
				const normalized = this.normalizeTypeKey(options.preferredTypeKey, options.scope);
				if (normalized) {
					const existing = await this.fetchTemplateByTypeKey(normalized);
					if (existing) {
						const resolved = await this.resolveTemplateSafe(normalized, options.scope);
						this.logResult(
							'EXACT_MATCH',
							options.scope,
							existing.type_key,
							1.0,
							false,
							startTime
						);
						return {
							template: existing,
							created: false,
							matchScore: 1.0,
							matchRationale: 'Exact match on preferred type_key',
							resolvedTemplate: resolved
						};
					}
				}
			}

			// 2. Search for templates
			const searchResults = await this.searchTemplates(options.scope, options.context, {
				realm: options.realm,
				limit: MAX_TEMPLATES_TO_SCORE
			});
			console.info(
				`[FindOrCreateTemplate] SEARCH found=${searchResults.length} scope=${options.scope}`
			);

			// 3. Score templates with LLM
			const scoreStartTime = Date.now();
			const scoredResults = await this.scoreTemplates(
				searchResults,
				options.context,
				options.scope,
				options.userId
			);
			const scoreDuration = Date.now() - scoreStartTime;
			console.info(
				`[FindOrCreateTemplate] SCORE count=${scoredResults.length} duration=${scoreDuration}ms` +
					(scoredResults[0]
						? ` best=${scoredResults[0].template.type_key} score=${Math.round(scoredResults[0].score * 100)}%`
						: '')
			);

			// 4. Check if best match exceeds threshold
			const bestMatch = scoredResults[0];
			if (bestMatch && bestMatch.score >= threshold) {
				const resolved = await this.resolveTemplateSafe(
					bestMatch.template.type_key,
					options.scope
				);
				this.logResult(
					'MATCH',
					options.scope,
					bestMatch.template.type_key,
					bestMatch.score,
					false,
					startTime
				);
				return {
					template: bestMatch.template,
					created: false,
					matchScore: bestMatch.score,
					matchRationale: bestMatch.rationale ?? 'Best matching template found',
					resolvedTemplate: resolved
				};
			}

			// 5. No good match - suggest a new template
			console.info(
				`[FindOrCreateTemplate] NO_MATCH bestScore=${bestMatch ? Math.round(bestMatch.score * 100) : 0}% < threshold=${Math.round(threshold * 100)}%`
			);
			const suggestStartTime = Date.now();
			const suggestion = await this.suggestTemplate(
				options.scope,
				options.context,
				scoredResults,
				options
			);
			const suggestDuration = Date.now() - suggestStartTime;
			console.info(
				`[FindOrCreateTemplate] SUGGEST typeKey=${suggestion.typeKey} duration=${suggestDuration}ms`
			);

			// 6. Create if allowed, otherwise return suggestion
			if (!allowCreate) {
				// Return best match if available, otherwise throw
				if (bestMatch) {
					const resolved = await this.resolveTemplateSafe(
						bestMatch.template.type_key,
						options.scope
					);
					this.logResult(
						'FALLBACK',
						options.scope,
						bestMatch.template.type_key,
						bestMatch.score,
						false,
						startTime
					);
					return {
						template: bestMatch.template,
						created: false,
						matchScore: bestMatch.score,
						matchRationale: `Best available match (below ${threshold * 100}% threshold, creation disabled)`,
						suggestion,
						resolvedTemplate: resolved
					};
				}
				console.warn(
					`[FindOrCreateTemplate] FAILED scope=${options.scope} reason=no_match_creation_disabled suggestion=${suggestion.typeKey}`
				);
				throw new Error(
					`[FindOrCreateTemplate] No matching template found and creation disabled. Suggestion: ${suggestion.typeKey}`
				);
			}

			// 7. Create the template
			const createStartTime = Date.now();
			const created = await this.createTemplateFromSuggestion(suggestion, options);
			const createDuration = Date.now() - createStartTime;
			console.info(
				`[FindOrCreateTemplate] CREATE typeKey=${created.type_key} id=${created.id} duration=${createDuration}ms`
			);
			const resolved = await this.resolveTemplateSafe(created.type_key, options.scope);
			this.logResult(
				'CREATED',
				options.scope,
				created.type_key,
				suggestion.matchScore / 100,
				true,
				startTime
			);

			return {
				template: created,
				created: true,
				matchScore: suggestion.matchScore / 100,
				matchRationale: suggestion.rationale,
				suggestion,
				resolvedTemplate: resolved
			};
		} catch (error) {
			const duration = Date.now() - startTime;
			console.error(
				`[FindOrCreateTemplate] ERROR scope=${options.scope} duration=${duration}ms error=${error instanceof Error ? error.message : 'Unknown'}`
			);
			throw error;
		}
	}

	/**
	 * Log the final result with metrics
	 */
	private logResult(
		outcome: 'EXACT_MATCH' | 'MATCH' | 'FALLBACK' | 'CREATED',
		scope: EntityScope,
		typeKey: string,
		score: number,
		created: boolean,
		startTime: number
	): void {
		const duration = Date.now() - startTime;
		console.info(
			`[FindOrCreateTemplate] RESULT outcome=${outcome} scope=${scope} typeKey=${typeKey} score=${Math.round(score * 100)}% created=${created} duration=${duration}ms`
		);
	}

	// ============================================
	// STEP 1: TEMPLATE SEARCH
	// ============================================

	private async searchTemplates(
		scope: EntityScope,
		context: string,
		options: { realm?: string; limit?: number }
	): Promise<TemplateSearchResult[]> {
		let query = this.client
			.from('onto_templates')
			.select('*')
			.eq('scope', scope)
			.eq('status', 'active');

		// Filter by realm if provided
		if (options.realm) {
			query = query.or(
				`type_key.ilike.%${options.realm}%,metadata->>realm.eq.${options.realm}`
			);
		}

		// Extract keywords from context for text search
		if (context) {
			const keywords = this.extractKeywords(context);
			if (keywords.length > 0) {
				const keywordFilters = keywords
					.slice(0, 5) // Limit to top 5 keywords
					.flatMap((k) => [`name.ilike.%${k}%`, `type_key.ilike.%${k}%`])
					.join(',');
				query = query.or(keywordFilters);
			}
		}

		// Limit results
		query = query.limit(options.limit ?? MAX_TEMPLATES_TO_SCORE);

		const { data, error } = await query;
		if (error) {
			throw new Error(`[FindOrCreateTemplate] Failed to search templates: ${error.message}`);
		}

		// Return with placeholder scores (scoring happens next)
		return (data ?? []).map((template) => ({
			template: template as TemplateRow,
			score: 0
		}));
	}

	// ============================================
	// STEP 2: LLM-POWERED SCORING
	// ============================================

	private async scoreTemplates(
		templates: TemplateSearchResult[],
		context: string,
		scope: EntityScope,
		userId: string
	): Promise<TemplateSearchResult[]> {
		if (templates.length === 0) return [];

		const scopeInfo = SCOPE_DEFINITIONS[scope];

		const templateSummaries = templates.map((t) => {
			const metadata = (t.template.metadata as Record<string, unknown>) ?? {};
			const schemaObj = t.template.schema as Record<string, unknown> | null;
			const properties = schemaObj?.properties
				? Object.keys(schemaObj.properties as Record<string, unknown>)
				: [];
			return {
				type_key: t.template.type_key,
				name: t.template.name,
				description: (metadata.description as string) ?? '',
				properties,
				is_abstract: t.template.is_abstract
			};
		});

		const systemPrompt = `You score how well ontology templates match a user's needs.
Scope: ${scope}
Type key pattern: ${scopeInfo.typeKeyPattern}
Family description: ${scopeInfo.familyDescription}

Score each template 0-100 based on semantic fit.
Prefer concrete templates over abstract ones.
Consider both explicit matches and implied fit.
Be generous with scoring when the template could work.`;

		const userPrompt = `User's context:
"""
${context}
"""

Templates to score:
${JSON.stringify(templateSummaries, null, 2)}

Return JSON: { "scores": [{ "type_key": "...", "score": 0-100, "rationale": "..." }] }

Include ALL templates from the list with scores.`;

		try {
			const response = await this.llm.getJSONResponse<LLMScoreResponse>({
				systemPrompt,
				userPrompt,
				userId,
				profile: 'fast',
				temperature: 0.1,
				validation: {
					retryOnParseError: true,
					maxRetries: 2
				},
				operationType: 'find_or_create_template.scoring'
			});

			const scoreMap = new Map<string, { score: number; rationale: string }>();
			for (const entry of response?.scores ?? []) {
				let score = typeof entry.score === 'number' ? entry.score / 100 : 0.3;

				// Apply penalty for abstract templates
				const templateInfo = templates.find((t) => t.template.type_key === entry.type_key);
				if (templateInfo?.template.is_abstract) {
					score *= ABSTRACT_TEMPLATE_PENALTY;
				}

				scoreMap.set(entry.type_key, {
					score: Math.min(1, Math.max(0, score)),
					rationale: entry.rationale ?? ''
				});
			}

			// Map scores back to results
			const scored = templates.map((t) => {
				const scoreInfo = scoreMap.get(t.template.type_key);
				let score = scoreInfo?.score ?? 0.3;

				// Ensure abstract penalty is applied even if not in LLM response
				if (t.template.is_abstract && !scoreMap.has(t.template.type_key)) {
					score *= ABSTRACT_TEMPLATE_PENALTY;
				}

				return {
					...t,
					score,
					rationale: scoreInfo?.rationale
				};
			});

			// Sort by score (highest first)
			return scored.sort((a, b) => b.score - a.score);
		} catch (error) {
			console.error('[FindOrCreateTemplate] Template scoring failed:', error);
			// Return templates with neutral scores on failure
			return templates.map((t) => ({
				...t,
				score: t.template.is_abstract ? 0.3 * ABSTRACT_TEMPLATE_PENALTY : 0.3
			}));
		}
	}

	// ============================================
	// STEP 3: TEMPLATE SUGGESTION
	// ============================================

	private async suggestTemplate(
		scope: EntityScope,
		context: string,
		existingTemplates: TemplateSearchResult[],
		options: FindOrCreateTemplateOptions
	): Promise<TemplateSuggestion> {
		const scopeInfo = SCOPE_DEFINITIONS[scope];

		const systemPrompt = `You suggest new ontology templates when existing ones don't fit.

Scope: ${scope}
Type key pattern: ${scopeInfo.typeKeyPattern}
Examples: ${scopeInfo.examples.join(', ')}

Naming rules:
- Use lowercase snake_case segments
- Follow family-based taxonomy: ${scopeInfo.familyDescription}
- Maximum 3 segments after scope prefix
- Be specific but not verbose
- The type_key MUST start with "${scope}."

Include:
- Appropriate property schema for this entity type
- FSM workflow states matching the lifecycle
- Rationale for why new template is needed
- Template name must be generic and reusable, not the user's specific instance name`;

		const existingTemplatesText =
			existingTemplates.length > 0
				? existingTemplates
						.slice(0, 5)
						.map(
							(t) =>
								`- ${t.template.type_key}: ${t.template.name} (${Math.round(t.score * 100)}% match)`
						)
						.join('\n')
				: '- None found or none match well';

		const facetValuesText = Object.entries(VALID_FACET_VALUES)
			.map(([key, values]) => `  - ${key}: ${values.join(', ')}`)
			.join('\n');

		const userPrompt = `User's context:
"""
${context}
"""

Existing templates (none match >70%):
${existingTemplatesText}

${options.exampleProps ? `Example props from entity:\n${JSON.stringify(options.exampleProps, null, 2)}` : ''}

Return JSON with:
- type_key: following ${scopeInfo.typeKeyPattern} (MUST start with "${scope}.")
- name: Human-readable name (generic, reusable)
- description: When to use this template
- parent_type_key: Optional parent to inherit from (null if none)
- match_score: 0-100 estimated fit for this context
- rationale: Why a new template is needed
- properties: Schema properties with type, description, required
- workflow_states: FSM states with key, label, initial/final flags
- facet_defaults: Optional default facets. ONLY use these exact values:
${facetValuesText}`;

		const response = await this.llm.getJSONResponse<LLMSuggestionResponse>({
			systemPrompt,
			userPrompt,
			userId: options.userId,
			profile: 'balanced',
			temperature: 0.3,
			validation: {
				retryOnParseError: true,
				maxRetries: 2
			},
			operationType: 'find_or_create_template.suggestion'
		});

		if (!response) {
			throw new Error('[FindOrCreateTemplate] Template suggestion returned empty response');
		}

		// Normalize the type_key
		const normalizedTypeKey = this.normalizeTypeKey(response.type_key, scope);
		if (!normalizedTypeKey) {
			throw new Error(
				`[FindOrCreateTemplate] Invalid type_key from suggestion: ${response.type_key}`
			);
		}

		return {
			typeKey: normalizedTypeKey,
			name: response.name ?? this.humanizeTypeKey(normalizedTypeKey),
			description: response.description ?? '',
			parentTypeKey: response.parent_type_key ?? null,
			matchScore: response.match_score ?? 70,
			rationale: response.rationale ?? 'New template suggested by LLM',
			properties: response.properties ?? {},
			workflowStates: response.workflow_states?.map((s) => ({
				key: this.normalizeSlug(s.key) ?? s.key,
				label: s.label,
				description: s.description,
				initial: s.initial,
				final: s.final
			})),
			facetDefaults: response.facet_defaults
		};
	}

	// ============================================
	// STEP 4: TEMPLATE CREATION
	// ============================================

	private async createTemplateFromSuggestion(
		suggestion: TemplateSuggestion,
		options: FindOrCreateTemplateOptions
	): Promise<TemplateRow> {
		const { scope, userId } = options;

		// 1. Normalize type_key
		const typeKey = this.normalizeTypeKey(suggestion.typeKey, scope);
		if (!typeKey) {
			throw new Error(
				`[FindOrCreateTemplate] Invalid type_key for creation: ${suggestion.typeKey}`
			);
		}

		// 2. CRITICAL: Ensure all ancestor templates exist first
		let parentTemplateId: string | null = null;

		// Check if LLM suggested a specific parent
		if (suggestion.parentTypeKey) {
			const normalizedParentTypeKey = this.normalizeTypeKey(suggestion.parentTypeKey, scope);
			const ancestors = this.getAncestorTypeKeys(typeKey, scope);

			if (normalizedParentTypeKey && ancestors.includes(normalizedParentTypeKey)) {
				// First try to find the suggested parent
				const parent = await this.fetchTemplateByTypeKey(normalizedParentTypeKey);

				// If suggested parent doesn't exist but is a valid ancestor, create it
				if (!parent) {
					const immediateParent = await this.ensureAncestorTemplatesExist(
						typeKey,
						scope,
						userId
					);
					parentTemplateId = immediateParent?.id ?? null;
				} else {
					parentTemplateId = parent.id;
				}
			} else {
				console.warn(
					`[FindOrCreateTemplate] Ignoring suggested parent ${suggestion.parentTypeKey} for ${typeKey} - not a valid ancestor in scope ${scope}`
				);
			}
		}

		// 3. If no parent yet, ensure all ancestors exist
		if (!parentTemplateId && !this.isAtMinimumDepth(typeKey, scope)) {
			const immediateParent = await this.ensureAncestorTemplatesExist(typeKey, scope, userId);
			parentTemplateId = immediateParent?.id ?? null;
		}

		// 4. Build JSON Schema
		const schema = this.buildSchema(suggestion.properties, options.additionalProperties);

		// 5. Build FSM
		const fsm = this.buildFSM(suggestion.workflowStates, typeKey, scope);

		// 6. Filter facet defaults to only include valid values
		const validatedFacetDefaults = this.filterValidFacetDefaults(suggestion.facetDefaults);

		// 7. Create via CRUD service
		const result = await TemplateCrudService.createTemplate(this.client, {
			scope,
			type_key: typeKey,
			name: suggestion.name,
			status: 'active',
			parent_template_id: parentTemplateId,
			is_abstract: false,
			schema,
			fsm,
			default_props: {},
			default_views: [],
			facet_defaults: validatedFacetDefaults,
			metadata: {
				description: suggestion.description,
				rationale: suggestion.rationale,
				match_score: suggestion.matchScore,
				created_by_find_or_create: true,
				created_at: new Date().toISOString()
			} as Json,
			created_by: userId
		});

		if (!result.success || !result.data) {
			const details = result.validationErrors
				?.map((err) => `${err.field}: ${err.message}`)
				.join('; ');
			throw new Error(
				`[FindOrCreateTemplate] Failed to create template: ${result.error ?? 'Unknown error'}${details ? ` - ${details}` : ''}`
			);
		}

		const createdTemplate = result.data as TemplateRow;

		// Invalidate cache since new template affects search results
		this.cache.invalidateTypeKey(typeKey);
		// Cache the newly created template
		this.cache.setByTypeKey(typeKey, createdTemplate);

		return createdTemplate;
	}

	// ============================================
	// HELPER METHODS
	// ============================================

	private async fetchTemplateByTypeKey(typeKey: string): Promise<TemplateRow | null> {
		// Check cache first
		const cached = this.cache.getByTypeKey(typeKey);
		if (cached) {
			console.debug(`[FindOrCreateTemplate] CACHE_HIT typeKey=${typeKey}`);
			return cached;
		}

		const { data, error } = await this.client
			.from('onto_templates')
			.select('*')
			.eq('type_key', typeKey)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw new Error(
				`[FindOrCreateTemplate] Failed to fetch template ${typeKey}: ${error.message}`
			);
		}

		const template = (data as TemplateRow) ?? null;

		// Cache the result
		if (template) {
			this.cache.setByTypeKey(typeKey, template);
		}

		return template;
	}

	private async resolveTemplateSafe(
		typeKey: string,
		scope: EntityScope
	): Promise<ResolvedTemplate | null> {
		try {
			return await resolveTemplateWithClient(this.client, typeKey, scope);
		} catch (error) {
			console.error('[FindOrCreateTemplate] Failed to resolve template:', error);
			return null;
		}
	}

	private extractKeywords(context: string): string[] {
		// Simple keyword extraction: split by whitespace, filter short words and common words
		const stopWords = new Set([
			'the',
			'a',
			'an',
			'and',
			'or',
			'but',
			'in',
			'on',
			'at',
			'to',
			'for',
			'of',
			'with',
			'by',
			'from',
			'is',
			'are',
			'was',
			'were',
			'be',
			'been',
			'being',
			'have',
			'has',
			'had',
			'do',
			'does',
			'did',
			'will',
			'would',
			'could',
			'should',
			'may',
			'might',
			'must',
			'shall',
			'can',
			'need',
			'want',
			'i',
			'my',
			'me',
			'we',
			'our',
			'you',
			'your',
			'it',
			'its',
			'this',
			'that',
			'these',
			'those'
		]);

		const words = context
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.split(/\s+/)
			.filter((word) => word.length > 2 && !stopWords.has(word));

		// Return unique words
		return Array.from(new Set(words));
	}

	private normalizeTypeKey(raw: string | undefined | null, scope: EntityScope): string | null {
		if (!raw) return null;

		// Split and normalize each part
		let parts = raw
			.split('.')
			.map((part) => this.normalizeSlug(part))
			.filter((part): part is string => Boolean(part));

		if (parts.length === 0) return null;

		// Ensure the first segment is the scope
		if (parts[0] !== scope) {
			// If missing scope prefix, add it
			parts = [scope, ...parts];
		}

		// Validate we have at least scope.family
		if (parts.length < 2) return null;

		// For projects, we need scope.domain.deliverable (at least 3 parts)
		if (scope === 'project' && parts.length < 3) return null;

		// Limit to 4 parts maximum (scope.family.variant.subvariant)
		if (parts.length > 4) {
			parts = parts.slice(0, 4);
		}

		const typeKey = parts.join('.');

		// Validate against pattern
		const pattern = TYPE_KEY_PATTERNS[scope];
		if (!pattern.test(typeKey)) {
			console.warn(
				`[FindOrCreateTemplate] Type key ${typeKey} does not match pattern for scope ${scope}`
			);
			// Return anyway but log warning
		}

		return typeKey;
	}

	private normalizeSlug(value: string | undefined | null): string | null {
		if (!value) return null;
		const slug = value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.replace(/_{2,}/g, '_');
		// Ensure starts with a letter
		const cleaned = slug.replace(/^[^a-z]+/, '');
		return cleaned.length ? cleaned : null;
	}

	private humanizeTypeKey(typeKey: string): string {
		const parts = typeKey.split('.');
		// Skip the scope prefix
		const significantParts = parts.slice(1);
		return significantParts
			.map((part) =>
				part
					.split('_')
					.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
					.join(' ')
			)
			.join(' ');
	}

	/**
	 * Filter facet defaults to only include valid values from the taxonomy.
	 * Invalid facet keys or values are logged and omitted.
	 */
	private filterValidFacetDefaults(
		facetDefaults: Record<string, string> | undefined
	): Record<string, string> {
		if (!facetDefaults || Object.keys(facetDefaults).length === 0) {
			return {};
		}

		const validDefaults: Record<string, string> = {};
		const invalidEntries: string[] = [];

		for (const [facetKey, value] of Object.entries(facetDefaults)) {
			const validValues = VALID_FACET_VALUES[facetKey];

			if (!validValues) {
				invalidEntries.push(`unknown facet key "${facetKey}"`);
				continue;
			}

			if (!validValues.includes(value)) {
				invalidEntries.push(`invalid value "${value}" for facet "${facetKey}"`);
				continue;
			}

			validDefaults[facetKey] = value;
		}

		if (invalidEntries.length > 0) {
			console.warn(
				`[FindOrCreateTemplate] Filtered out invalid facet defaults: ${invalidEntries.join(', ')}`
			);
		}

		return validDefaults;
	}

	private buildSchema(
		properties: Record<string, PropertyDefinition>,
		additionalProperties?: Record<string, PropertyDefinition>
	): Json {
		const allProperties = { ...properties, ...additionalProperties };

		if (Object.keys(allProperties).length === 0) {
			return {
				type: 'object',
				properties: {
					title: { type: 'string', description: 'Title or name' },
					description: { type: 'string', description: 'Detailed description' }
				},
				required: ['title']
			} as Json;
		}

		const schemaProperties: Record<string, Json> = {};
		const required: string[] = [];

		for (const [key, def] of Object.entries(allProperties)) {
			// Auto-generate type-appropriate default for required fields missing defaults
			// This prevents validation failures and allows graceful handling
			if (def.required && def.default === undefined) {
				const autoDefault = this.getTypeAppropriateDefault(def.type ?? 'string');
				console.warn(
					`[FindOrCreateTemplate] Auto-generating default for required property "${key}" (type: ${def.type ?? 'string'}): ${JSON.stringify(autoDefault)}`
				);
				def.default = autoDefault;
			}

			const schemaProp: Record<string, unknown> = {
				type: def.type ?? 'string'
			};

			if (def.description !== undefined) {
				schemaProp.description = def.description;
			}

			if (def.default !== undefined) {
				schemaProp.default = def.default as Json;
			}

			if (def.enum && def.enum.length > 0) {
				schemaProp.enum = def.enum;
			}

			if (def.example !== undefined) {
				schemaProp.example = def.example as Json;
			}

			schemaProperties[key] = schemaProp as Json;

			if (def.required) {
				required.push(key);
			}
		}

		return {
			type: 'object',
			properties: schemaProperties,
			required
		} as Json;
	}

	private buildFSM(
		workflowStates: WorkflowState[] | undefined,
		typeKey: string,
		scope: EntityScope
	): Json | null {
		const scopeInfo = SCOPE_DEFINITIONS[scope];

		// Use provided states or fall back to defaults
		let stateDetails =
			workflowStates && workflowStates.length > 0
				? workflowStates
						.map((s) => {
							const key = this.normalizeSlug(s.key) ?? s.key;
							if (!key) return null;
							return {
								key,
								label: s.label,
								description: s.description,
								initial: Boolean(s.initial),
								final: Boolean(s.final)
							};
						})
						.filter((s): s is NonNullable<typeof s> => Boolean(s))
				: [];

		let states = stateDetails.map((s) => s.key);

		// If provided states are insufficient, use defaults
		if (states.length < 2) {
			stateDetails = [];
			states = scopeInfo.defaultStates;
		}

		if (states.length < 2) {
			// Not enough states for a meaningful FSM
			return null;
		}

		const initialState =
			stateDetails.find((s) => s.initial)?.key ?? (states.length > 0 ? states[0] : undefined);

		// Build transitions from provided states or use defaults
		let transitions: Array<{
			from: string;
			to: string;
			event: string;
			guards: Json[];
			actions: Json[];
		}>;

		if (stateDetails.length > 1) {
			// Create sequential transitions between provided states
			transitions = [];
			for (let i = 0; i < states.length - 1; i++) {
				const fromState = states[i];
				const toState = states[i + 1];
				if (fromState && toState) {
					transitions.push({
						from: fromState,
						to: toState,
						event: `advance_to_${toState}`,
						guards: [],
						actions: []
					});
				}
			}
		} else {
			// Use default transitions for scope, convert to Json-compatible format
			transitions = scopeInfo.defaultTransitions.map((t) => ({
				from: t.from,
				to: t.to,
				event: t.event,
				guards: (t.guards ?? []) as Json[],
				actions: (t.actions ?? []) as Json[]
			}));
		}

		const fsm: Record<string, unknown> = {
			type_key: typeKey,
			states,
			transitions
		};

		if (initialState) {
			fsm.initial = initialState;
		}

		if (stateDetails.length > 0) {
			const finalStates = stateDetails.filter((s) => s.final).map((s) => s.key);
			fsm.metadata = {
				states: stateDetails.map((s) => ({
					key: s.key,
					label: s.label,
					description: s.description,
					initial: s.initial,
					final: s.final
				})),
				final_states: finalStates
			};
		}

		return fsm as Json;
	}

	/**
	 * Get a type-appropriate default value for a property type.
	 * Used when LLM suggests required properties without defaults.
	 */
	private getTypeAppropriateDefault(type: string): unknown {
		switch (type) {
			case 'string':
				return '';
			case 'number':
			case 'integer':
				return 0;
			case 'boolean':
				return false;
			case 'array':
				return [];
			case 'object':
				return {};
			default:
				// For unknown types, default to empty string
				return '';
		}
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a FindOrCreateTemplateService instance
 */
export function createFindOrCreateTemplateService(
	client: TypedSupabaseClient,
	llm: SmartLLMService
): FindOrCreateTemplateService {
	return new FindOrCreateTemplateService(client, llm);
}
