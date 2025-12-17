// apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts
/**
 * Compatibility wrapper for the refactored ChatToolExecutor.
 *
 * The original monolithic executor (2k+ LOC) has been replaced by
 * domain-specific executors under ./executors. Keep the same import
 * path so existing code continues to work.
 */

export { ChatToolExecutor } from './tool-executor-refactored';
