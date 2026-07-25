// apps/web/src/lib/services/agentic-chat/tools/work-capabilities/catalog.ts
// Compatibility surface for the former work-capability catalog.
// New code should import from ../outcome-cards/catalog.
export {
	getOutcomeCardById as getWorkCapabilityById,
	listOutcomeCards as listWorkCapabilities,
	listOutcomeCardsForDomain as listWorkCapabilitiesForDomain
} from '../outcome-cards/catalog';
export type { OutcomeCardDefinition as WorkCapabilityDefinition } from '../outcome-cards/types';
