// apps/web/src/lib/services/ontology/migration/enhanced-migration.types.ts
import type { Database } from '@buildos/shared-types';
import type { Facets } from '$lib/types/onto';
import type { MigrationServiceContext } from '../migration.types';

// Entity scope taxonomy (template-free classification)
export type EntityScope =
	| 'project'
	| 'task'
	| 'plan'
	| 'output'
	| 'document'
	| 'goal'
	| 'requirement';

// ============================================
// MIGRATION CONTEXT TYPES
// ============================================

export interface MigrationContext extends MigrationServiceContext {
	// Enhanced context for migration engines
	enhancedMode?: boolean;
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
// MIGRATION RESULT TYPES (Enhanced, template-free)
// ============================================

export interface EnhancedProjectMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyProjectId: string;
	ontoProjectId?: string | null;
	typeKeyUsed?: string;
	propsExtracted?: Record<string, unknown>;
	propsConfidence?: number;
	message: string;
	errors?: string[];
}

export interface EnhancedTaskMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyTaskId: string;
	ontoTaskId?: string | null;
	typeKeyUsed?: string;
	message: string;
}

export interface EnhancedPlanMigrationResult {
	status: 'completed' | 'pending_review' | 'validation_failed' | 'failed';
	legacyPhaseId: string;
	ontoPlanId?: string | null;
	typeKeyUsed?: string;
	message: string;
}
