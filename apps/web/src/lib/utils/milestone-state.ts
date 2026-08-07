// apps/web/src/lib/utils/milestone-state.ts
// Compatibility shim for existing Svelte/UI imports. The pure implementation
// lives with the shared chat reads so web routes and the worker decorate rows
// identically.
// Import from the milestone-state subpath, NOT the ./tools barrel: the barrel
// pulls in ontology-reads → document-outline → node:crypto, which cannot
// evaluate in browser bundles (this shim is imported by Svelte components).
export {
	resolveMilestoneState,
	withComputedMilestoneState,
	type MilestoneStateInput
} from '@buildos/agentic-chat-runtime/tools/milestone-state';
