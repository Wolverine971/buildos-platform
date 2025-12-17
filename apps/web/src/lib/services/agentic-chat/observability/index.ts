// apps/web/src/lib/services/agentic-chat/observability/index.ts
/**
 * Observability Module
 *
 * Provides debugging and monitoring tools for the agentic chat system.
 */

export { buildDebugContextInfo, isDebugModeEnabled } from './debug-context-builder';
export type { DebugContextInfo } from '../shared/types';
