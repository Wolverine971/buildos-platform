// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts
// Compatibility surface: finalization-guard semantics are shared with the worker runtime.
export {
	applyFinalizationGuard,
	type FinalizationGuardFinishedReason,
	type FinalizationGuardReason,
	type FinalizationGuardResult
} from '@buildos/agentic-chat-runtime/supervisor';
