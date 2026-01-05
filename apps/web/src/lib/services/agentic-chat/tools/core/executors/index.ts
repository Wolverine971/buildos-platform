// apps/web/src/lib/services/agentic-chat/tools/core/executors/index.ts
/**
 * Tool Executors Index
 *
 * Re-exports all domain-specific executors and shared types.
 *
 * Architecture:
 * - BaseExecutor: Common infrastructure (auth, API, ownership)
 * - OntologyReadExecutor: list_*, search_*, get_* operations
 * - OntologyWriteExecutor: create_*, update_*, delete_* operations
 * - UtilityExecutor: get_field_info, relationships, linked entities
 * - ExternalExecutor: web_search, buildos docs
 */

// Types
export * from './types';

// Base
export { BaseExecutor } from './base-executor';

// Domain Executors
export { OntologyReadExecutor } from './ontology-read-executor';
export { OntologyWriteExecutor } from './ontology-write-executor';
export { UtilityExecutor } from './utility-executor';
export { ExternalExecutor } from './external-executor';
export { CalendarExecutor } from './calendar-executor';
