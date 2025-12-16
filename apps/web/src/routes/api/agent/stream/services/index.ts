// apps/web/src/routes/api/agent/stream/services/index.ts
/**
 * Service re-exports for /api/agent/stream endpoint.
 *
 * Provides a clean import interface for all service modules.
 *
 * Usage:
 * ```typescript
 * import {
 *   createSessionManager,
 *   createOntologyCacheService,
 *   createMessagePersister,
 *   createStreamHandler
 * } from './services';
 * ```
 */

// ============================================
// SESSION MANAGEMENT
// ============================================

export { SessionManager, createSessionManager } from './session-manager';

// ============================================
// ONTOLOGY CACHING
// ============================================

export { OntologyCacheService, createOntologyCacheService } from './ontology-cache';

// ============================================
// MESSAGE PERSISTENCE
// ============================================

export { MessagePersister, createMessagePersister } from './message-persister';

// ============================================
// STREAM HANDLING
// ============================================

export { StreamHandler, createStreamHandler, type StreamHandlerParams } from './stream-handler';
