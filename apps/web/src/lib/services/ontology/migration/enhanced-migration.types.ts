// apps/web/src/lib/services/ontology/migration/enhanced-migration.types.ts
/**
 * Type definitions for enhanced migration system
 * Aligns with agentic chat template discovery and property extraction patterns
 */

import type { Json } from '@buildos/shared-types';
import type { Database } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';
import type { ResolvedTemplate } from '../template-resolver.service';
import type { MigrationServiceContext } from '../migration.types';

export type EntityScope = 'project' | 'task' | 'plan' | 'output' | 'document' | 'goal' | 'requirement';

// ============================================
// TEMPLATE DISCOVERY ENGINE TYPES
// ============================================

export interface TemplateSearchOptions {
	scope: EntityScope;
	realm?: string;
	search?: string;
	context?: string;
	facets?: Facets;
	limit?: number;
}

export interface TemplateSearchResult {
	template: Database['public']['Tables']['onto_templates']['Row'];
	score: number; // 0-1 scale
	rationale?: string;
}

export interface TemplateSuggestionOptions {
	scope: EntityScope;
	narrative: string;
	existingTemplates: TemplateSearchResult[];
	userId: string;
}

export interface TemplateSuggestion {
	typeKey: string;
	name: string;
	description: string;
	parentTypeKey?: string | null;
	matchScore: number; // 0-100 scale
	rationale: string;
	properties: Record<string, TemplatePropertyDefinition>;
	workflowStates?: WorkflowState[];
	benefits?: string[];
	exampleProps?: Record<string, unknown>;
}

export interface TemplatePropertyDefinition {
	type: 'string' | 'number' | 'boolean' | 'array' | 'object';
	description?: string;
	required?: boolean;
	default?: unknown;
	example?: unknown;
}

export interface WorkflowState {
	key: string;
	label: string;
	description?: string;
	initial?: boolean;
	final?: boolean;
	transitionsTo?: string[];
}

export interface EnsureTemplateOptions {
	typeKey: string;
	suggestion?: TemplateSuggestion;
	allowCreate: boolean;
	userId: string;
}

export interface EnsureTemplateResult {
	template: Database['public']['Tables']['onto_templates']['Row'] | null;
	created: boolean;
	suggestion?: TemplateSuggestion;
}

// ============================================
// PROPERTY EXTRACTOR ENGINE TYPES
// ============================================

export interface PropertyExtractionOptions {
	template: ResolvedTemplate;
	legacyData: LegacyEntity;
	context: MigrationContext;
	userId: string;
}

export interface PropertyExtractionResult {
	props: Record<string, unknown>;
	facets?: Facets | null;
	confidence: number; // 0-1 scale
	notes?: string | null;
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings?: string[];
}

// ============================================
// MIGRATION CONTEXT TYPES
// ============================================

export interface MigrationContext extends MigrationServiceContext {
	// Enhanced context for migration engines
	enhancedMode?: boolean;
	templateConfidenceThreshold?: number; // Default: 0.70
	propsConfidenceThreshold?: number; // Default: 0.60
	cacheEnabled?: boolean;
}

// ============================================
// LEGACY ENTITY TYPES
// ============================================

export type LegacyProject = Database['public']['Tables']['projects']['Row'];
export type LegacyTask = Database['public']['Tables']['tasks']['Row'];
export type LegacyPhase = Database['public']['Tables']['phases']['Row'];

export type LegacyEntity = LegacyProject | LegacyTask | LegacyPhase;

// ============================================
// TEMPLATE SUGGESTION RESPONSE (LLM)
// ============================================

export interface TemplateSuggestionResponse {
	type_key: string;
	name: string;
	description: string;
	parent_type_key?: string | null;
	match_score: number;
	rationale: string;
	properties?: Record<string, TemplatePropertyDefinition>;
	workflow_states?: WorkflowState[];
	benefits?: string[];
	example_props?: Record<string, unknown>;
}

export interface PropertyExtractionResponse {
	props: Record<string, unknown>;
	facets?: Facets | null;
	confidence?: number;
	notes?: string | null;
}

// ============================================
// TEMPLATE SCORING TYPES
// ============================================

export interface TemplateScoreRequest {
	template: Database['public']['Tables']['onto_templates']['Row'];
	narrative: string;
}

export interface TemplateScoreResponse {
	score: number; // 0-100
	rationale: string;
	matchReasons?: string[];
	concerns?: string[];
}

// ============================================
// MIGRATION RESULT TYPES (Enhanced)
// ============================================

export interface EnhancedProjectMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyProjectId: string;
	ontoProjectId?: string | null;
	templateUsed?: string;
	templateCreated?: boolean;
	templateSuggestion?: TemplateSuggestion;
	propsExtracted?: Record<string, unknown>;
	propsConfidence?: number;
	message: string;
	errors?: string[];
}

export interface EnhancedTaskMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyTaskId: string;
	ontoTaskId?: string | null;
	templateUsed?: string;
	templateCreated?: boolean;
	message: string;
}

export interface EnhancedPlanMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyPhaseId: string;
	ontoPlanId?: string | null;
	templateUsed?: string;
	templateCreated?: boolean;
	message: string;
}

// ============================================
// TEMPLATE FIELD EXTRACTION TYPES
// ============================================

export interface TemplateField {
	key: string;
	type: string;
	required: boolean;
	description?: string | null;
}
