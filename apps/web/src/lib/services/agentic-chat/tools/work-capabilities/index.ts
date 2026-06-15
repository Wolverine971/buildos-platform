// Compatibility surface for the former work-capability module.
// New code should import from ../outcome-cards.
export {
	getOutcomeCardById as getWorkCapabilityById,
	listOutcomeCards as listWorkCapabilities,
	listOutcomeCardsForDomain as listWorkCapabilitiesForDomain
} from '../outcome-cards/catalog';
export { loadOutcomeCard as loadWorkCapability } from '../outcome-cards/outcome-card-load';
export { searchOutcomeCards as searchWorkCapabilities } from '../outcome-cards/outcome-card-search';
export type {
	OutcomeCardCoverageStatus as WorkCapabilityCoverageStatus,
	OutcomeCardDefinition as WorkCapabilityDefinition,
	OutcomeCardLoadPayload as WorkCapabilityLoadPayload,
	OutcomeCardSearchMatch as WorkCapabilitySearchMatch,
	OutcomeCardSearchPayload as WorkCapabilitySearchPayload
} from '../outcome-cards/types';

