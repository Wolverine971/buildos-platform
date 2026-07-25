// apps/web/src/lib/services/agentic-chat/tools/work-capabilities/work-capability-search.ts
// Compatibility surface for the former work-capability searcher.
// New code should import searchOutcomeCards from ../outcome-cards/outcome-card-search.
export { searchOutcomeCards as searchWorkCapabilities } from '../outcome-cards/outcome-card-search';
export type { OutcomeCardSearchOptions as WorkCapabilitySearchOptions } from '../outcome-cards/outcome-card-search';
