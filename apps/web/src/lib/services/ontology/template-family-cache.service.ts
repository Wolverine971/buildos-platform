// apps/web/src/lib/services/ontology/template-family-cache.service.ts
/**
 * Template Family Cache Service
 *
 * Provides a cached layer for template family lookups to support
 * hierarchical template selection. Instead of searching all templates,
 * the system first selects a family, then searches within that family.
 *
 * Key Features:
 * - TTL-based cache with lazy refresh
 * - Populated from onto_templates table
 * - Invalidation hooks for template CRUD operations
 * - Pre-computed family metadata for fast LLM context
 *
 * @see /apps/web/docs/features/ontology/HIERARCHICAL_TEMPLATE_SELECTION_SPEC.md
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database } from '@buildos/shared-types';

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

/**
 * Cached family entry with metadata for LLM context
 */
export interface FamilyCacheEntry {
	/** Family key (e.g., "timebox", "execute") */
	key: string;
	/** Human-readable name */
	name: string;
	/** Description for LLM context */
	description: string;
	/** Example type_keys in this family */
	examples: string[];
	/** Number of templates in this family */
	templateCount: number;
	/** Whether this is an abstract family (has .base template) */
	hasAbstractBase: boolean;
}

/**
 * Cache statistics for monitoring
 */
export interface FamilyCacheStats {
	hitCount: number;
	missCount: number;
	refreshCount: number;
	lastRefreshByScope: Partial<Record<EntityScope, number>>;
	totalFamiliesCached: number;
}

/**
 * Internal cache entry with timestamp
 */
interface ScopeCacheEntry {
	families: FamilyCacheEntry[];
	timestamp: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Cache TTL: 1 hour (templates rarely change during migration) */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Static family definitions with descriptions for LLM context.
 * These provide semantic meaning even when no templates exist yet.
 */
const FAMILY_DEFINITIONS: Record<
	EntityScope,
	Record<string, { name: string; description: string }>
> = {
	plan: {
		timebox: {
			name: 'Timebox',
			description: 'Fixed time windows like sprints, weekly plans, daily plans'
		},
		pipeline: {
			name: 'Pipeline',
			description: 'Stage-based funnels like sales pipeline, kanban, hiring funnel'
		},
		campaign: {
			name: 'Campaign',
			description:
				'Multi-channel pushes like marketing campaigns, content calendars, launch campaigns'
		},
		roadmap: {
			name: 'Roadmap',
			description: 'Long-term directional plans like product roadmap, strategy roadmap'
		},
		process: {
			name: 'Process',
			description:
				'Repeatable workflows like client onboarding, release process, review cycles'
		},
		phase: {
			name: 'Phase',
			description: 'Project phases like discovery phase, execution phase, launch phase'
		}
	},
	task: {
		execute: {
			name: 'Execute',
			description: 'Action tasks - doing the actual work (default for most tasks)'
		},
		create: {
			name: 'Create',
			description: 'Producing NEW artifacts from scratch - writing, designing, building'
		},
		refine: {
			name: 'Refine',
			description: 'Improving EXISTING work - editing, polishing, optimizing'
		},
		research: {
			name: 'Research',
			description: 'Investigating and gathering information - analysis, discovery, learning'
		},
		review: {
			name: 'Review',
			description: 'Evaluating and providing feedback - code review, design review, QA'
		},
		coordinate: {
			name: 'Coordinate',
			description: 'Syncing with others - meetings, standups, interviews, collaboration'
		},
		admin: {
			name: 'Admin',
			description: 'Administrative housekeeping - reporting, filing, cleanup, maintenance'
		},
		plan: {
			name: 'Plan',
			description:
				'Strategic thinking and planning - sprint planning, roadmap planning, backlog grooming'
		}
	},
	goal: {
		outcome: {
			name: 'Outcome',
			description: 'Binary completion goals - launch v1, publish book, ship feature'
		},
		metric: {
			name: 'Metric',
			description: 'Quantitative targets - revenue goals, usage metrics, conversion rates'
		},
		behavior: {
			name: 'Behavior',
			description: 'Frequency and consistency goals - post 3x/week, exercise daily'
		},
		learning: {
			name: 'Learning',
			description: 'Skill progression goals - learn React, get certification, master topic'
		}
	},
	document: {
		context: {
			name: 'Context',
			description: 'Big picture documents - project context, product vision, team charter'
		},
		knowledge: {
			name: 'Knowledge',
			description: 'Research and findings - research notes, analysis, learnings'
		},
		decision: {
			name: 'Decision',
			description: 'Decisions and commitments - ADRs, meeting notes with decisions, RFCs'
		},
		spec: {
			name: 'Spec',
			description: 'Formalized specifications - technical spec, product spec, API spec'
		},
		reference: {
			name: 'Reference',
			description: 'Reusable guides - handbooks, playbooks, style guides'
		},
		intake: {
			name: 'Intake',
			description:
				'Information gathered at start - client intake, project intake, requirements'
		}
	},
	output: {
		written: {
			name: 'Written',
			description: 'Long-form text outputs - chapters, articles, blog posts, reports'
		},
		media: {
			name: 'Media',
			description: 'Visual/audio/video artifacts - design mockups, slide decks, videos'
		},
		software: {
			name: 'Software',
			description: 'Code and releases - features, releases, APIs, components'
		},
		operational: {
			name: 'Operational',
			description: 'Business deliverables - reports, dashboards, analyses'
		}
	},
	risk: {
		technical: {
			name: 'Technical',
			description: 'Tech and architecture risks - security, scalability, reliability issues'
		},
		schedule: {
			name: 'Schedule',
			description: 'Timing and deadline risks - dependencies, delays, milestone risks'
		},
		resource: {
			name: 'Resource',
			description: 'People and skills risks - skill gaps, bandwidth, turnover'
		},
		budget: {
			name: 'Budget',
			description: 'Money-related risks - cost overruns, funding, vendor costs'
		},
		scope: {
			name: 'Scope',
			description: 'Scope-related risks - scope creep, ambiguity, change requests'
		},
		external: {
			name: 'External',
			description: 'Outside factor risks - regulatory, market changes, vendor issues'
		},
		quality: {
			name: 'Quality',
			description: 'Quality-related risks - bugs, UX issues, performance problems'
		}
	},
	event: {
		work: {
			name: 'Work',
			description: 'Individual work sessions - focus blocks, time blocks, deep work'
		},
		collab: {
			name: 'Collab',
			description: 'Coordination with others - meetings, standups, workshops, 1:1s'
		},
		marker: {
			name: 'Marker',
			description: 'Deadlines and reminders - due dates, reminders, milestones'
		}
	},
	project: {
		// Projects use domain.deliverable pattern, not family.variant
		// This is here for completeness but hierarchical selection doesn't apply
	}
};

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class TemplateFamilyCacheService {
	private readonly cache = new Map<EntityScope, ScopeCacheEntry>();
	private readonly ttlMs: number;

	// Statistics
	private hitCount = 0;
	private missCount = 0;
	private refreshCount = 0;
	private lastRefreshByScope: Partial<Record<EntityScope, number>> = {};

	constructor(
		private readonly client: TypedSupabaseClient,
		ttlMs: number = CACHE_TTL_MS
	) {
		this.ttlMs = ttlMs;
	}

	// ============================================
	// PUBLIC API
	// ============================================

	/**
	 * Get cached families for a scope.
	 * Returns from cache if valid, otherwise refreshes.
	 */
	async getFamilies(scope: EntityScope): Promise<FamilyCacheEntry[]> {
		// Check cache
		const cached = this.cache.get(scope);
		if (cached && !this.isExpired(cached.timestamp)) {
			this.hitCount++;
			return cached.families;
		}

		// Cache miss or expired - refresh
		this.missCount++;
		return this.refreshCacheForScope(scope);
	}

	/**
	 * Get families for multiple scopes in parallel.
	 * Useful for batch operations.
	 */
	async getFamiliesMultiple(
		scopes: EntityScope[]
	): Promise<Map<EntityScope, FamilyCacheEntry[]>> {
		const results = new Map<EntityScope, FamilyCacheEntry[]>();
		await Promise.all(
			scopes.map(async (scope) => {
				const families = await this.getFamilies(scope);
				results.set(scope, families);
			})
		);
		return results;
	}

	/**
	 * Force refresh cache for a scope.
	 */
	async refreshCache(scope: EntityScope): Promise<void> {
		await this.refreshCacheForScope(scope);
	}

	/**
	 * Invalidate cache for a scope or all scopes.
	 * Call this after template CRUD operations.
	 */
	invalidate(scope?: EntityScope): void {
		if (scope) {
			this.cache.delete(scope);
			console.info(`[TemplateFamilyCache] Invalidated cache for scope: ${scope}`);
		} else {
			this.cache.clear();
			console.info('[TemplateFamilyCache] Invalidated all caches');
		}
	}

	/**
	 * Get cache statistics for monitoring.
	 */
	getStats(): FamilyCacheStats {
		let totalFamilies = 0;
		for (const entry of this.cache.values()) {
			totalFamilies += entry.families.length;
		}

		return {
			hitCount: this.hitCount,
			missCount: this.missCount,
			refreshCount: this.refreshCount,
			lastRefreshByScope: { ...this.lastRefreshByScope },
			totalFamiliesCached: totalFamilies
		};
	}

	/**
	 * Get a specific family's metadata.
	 * Returns null if family not found.
	 */
	async getFamily(scope: EntityScope, familyKey: string): Promise<FamilyCacheEntry | null> {
		const families = await this.getFamilies(scope);
		return families.find((f) => f.key === familyKey) ?? null;
	}

	/**
	 * Check if a family key is valid for a scope.
	 */
	async isValidFamily(scope: EntityScope, familyKey: string): Promise<boolean> {
		const family = await this.getFamily(scope, familyKey);
		return family !== null;
	}

	// ============================================
	// PRIVATE METHODS
	// ============================================

	/**
	 * Refresh cache for a specific scope from database.
	 */
	private async refreshCacheForScope(scope: EntityScope): Promise<FamilyCacheEntry[]> {
		const startTime = Date.now();

		try {
			// Query all active templates for this scope
			const { data: templates, error } = await this.client
				.from('onto_templates')
				.select('type_key, name, is_abstract, metadata')
				.eq('scope', scope)
				.eq('status', 'active');

			if (error) {
				console.error(
					`[TemplateFamilyCache] Failed to query templates for ${scope}:`,
					error
				);
				// Return static definitions as fallback
				return this.getStaticFamilies(scope);
			}

			// Extract families from templates
			const families = this.extractFamiliesFromTemplates(scope, templates ?? []);

			// Update cache
			this.cache.set(scope, {
				families,
				timestamp: Date.now()
			});

			this.refreshCount++;
			this.lastRefreshByScope[scope] = Date.now();

			const duration = Date.now() - startTime;
			console.info(
				`[TemplateFamilyCache] Refreshed ${scope}: ${families.length} families from ${templates?.length ?? 0} templates (${duration}ms)`
			);

			return families;
		} catch (error) {
			console.error(`[TemplateFamilyCache] Error refreshing ${scope}:`, error);
			return this.getStaticFamilies(scope);
		}
	}

	/**
	 * Extract family entries from template rows.
	 */
	private extractFamiliesFromTemplates(
		scope: EntityScope,
		templates: Array<{
			type_key: string;
			name: string;
			is_abstract: boolean | null;
			metadata: unknown;
		}>
	): FamilyCacheEntry[] {
		const familyMap = new Map<string, FamilyCacheEntry>();
		const staticDefs = FAMILY_DEFINITIONS[scope] ?? {};

		// Process each template
		for (const template of templates) {
			const familyKey = this.extractFamilyKey(template.type_key, scope);
			if (!familyKey) continue;

			if (!familyMap.has(familyKey)) {
				// Get static definition if available
				const staticDef = staticDefs[familyKey];

				familyMap.set(familyKey, {
					key: familyKey,
					name: staticDef?.name ?? this.humanizeFamilyKey(familyKey),
					description: staticDef?.description ?? `Templates for ${familyKey} ${scope}s`,
					examples: [],
					templateCount: 0,
					hasAbstractBase: false
				});
			}

			const entry = familyMap.get(familyKey)!;
			entry.templateCount++;

			// Track examples (limit to 5)
			if (entry.examples.length < 5) {
				entry.examples.push(template.type_key);
			}

			// Check if this is the abstract base
			if (template.is_abstract && template.type_key === `${scope}.${familyKey}.base`) {
				entry.hasAbstractBase = true;
			}
		}

		// Add any static families that don't have templates yet
		for (const [key, def] of Object.entries(staticDefs)) {
			if (!familyMap.has(key)) {
				familyMap.set(key, {
					key,
					name: def.name,
					description: def.description,
					examples: [],
					templateCount: 0,
					hasAbstractBase: false
				});
			}
		}

		// Sort by template count (most used first), then alphabetically
		return Array.from(familyMap.values()).sort((a, b) => {
			if (b.templateCount !== a.templateCount) {
				return b.templateCount - a.templateCount;
			}
			return a.key.localeCompare(b.key);
		});
	}

	/**
	 * Extract the family key from a type_key.
	 *
	 * Examples:
	 * - plan.timebox.sprint → timebox
	 * - task.execute → execute
	 * - task.execute.deploy → execute
	 * - project.writer.book → null (projects don't use family pattern)
	 */
	private extractFamilyKey(typeKey: string, scope: EntityScope): string | null {
		// Projects use domain.deliverable pattern, not family.variant
		if (scope === 'project') return null;

		const parts = typeKey.split('.');
		if (parts.length < 2) return null;

		// Second segment is the family
		// e.g., task.execute → execute, plan.timebox.sprint → timebox
		return parts[1] ?? null;
	}

	/**
	 * Get static family definitions when database query fails.
	 */
	private getStaticFamilies(scope: EntityScope): FamilyCacheEntry[] {
		const staticDefs = FAMILY_DEFINITIONS[scope] ?? {};

		return Object.entries(staticDefs).map(([key, def]) => ({
			key,
			name: def.name,
			description: def.description,
			examples: [],
			templateCount: 0,
			hasAbstractBase: false
		}));
	}

	/**
	 * Convert family key to human-readable name.
	 */
	private humanizeFamilyKey(key: string): string {
		return key
			.split('_')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}

	/**
	 * Check if cache entry is expired.
	 */
	private isExpired(timestamp: number): boolean {
		return Date.now() - timestamp > this.ttlMs;
	}
}

// ============================================
// GLOBAL INSTANCE
// ============================================

/**
 * Global cache instance.
 * Initialized lazily when first accessed with a client.
 */
let globalFamilyCache: TemplateFamilyCacheService | null = null;

/**
 * Get or create the global family cache instance.
 */
export function getGlobalFamilyCache(client: TypedSupabaseClient): TemplateFamilyCacheService {
	if (!globalFamilyCache) {
		globalFamilyCache = new TemplateFamilyCacheService(client);
	}
	return globalFamilyCache;
}

/**
 * Clear the global family cache instance.
 * Useful for testing or after bulk operations.
 */
export function clearGlobalFamilyCache(): void {
	if (globalFamilyCache) {
		globalFamilyCache.invalidate();
		globalFamilyCache = null;
	}
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a scope uses hierarchical (family-based) selection.
 * Projects use domain.deliverable pattern, all others use family.variant.
 */
export function usesHierarchicalSelection(scope: EntityScope): boolean {
	return scope !== 'project';
}

/**
 * Get the family key from a type_key for any scope.
 */
export function extractFamilyFromTypeKey(typeKey: string, scope: EntityScope): string | null {
	if (!usesHierarchicalSelection(scope)) return null;

	const parts = typeKey.split('.');
	if (parts.length < 2) return null;

	return parts[1] ?? null;
}

/**
 * Build a family prefix for querying variants.
 * Example: scope=plan, family=timebox → "plan.timebox"
 */
export function buildFamilyPrefix(scope: EntityScope, family: string): string {
	return `${scope}.${family}`;
}
