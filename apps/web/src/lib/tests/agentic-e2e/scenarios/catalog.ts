// apps/web/src/lib/tests/agentic-e2e/scenarios/catalog.ts
//
// The registry of scenarios the runner iterates. Add new scenarios here.
import type { Scenario } from '../harness/types';
import { documentCreateScenario } from './document-create.scenario';
import { documentEditContextScenario } from './document-edit-context.scenario';
import { projectOrganizeScenario } from './project-organize.scenario';
import { taskCreateScenario } from './task-create.scenario';
import { calendarMoveScenario } from './calendar-move.scenario';
import { emailReadScenario } from './email-read.scenario';
// Tier 1 breadth, added 2026-07-25 from DJ's failure-mode interview.
import { taskCompleteColdReferenceScenario } from './task-complete-cold-reference.scenario';
import { entityResolutionMisspelledScenario } from './entity-resolution-misspelled.scenario';
import { researchTurnFinalizesScenario } from './research-turn-finalizes.scenario';
import { restraintNoopAndAmbiguityScenario } from './restraint-noop-and-ambiguity.scenario';
import { taskRescheduleColdReferenceScenario } from './task-reschedule-cold-reference.scenario';
import { taskMultiUpdateScenario } from './task-multi-update.scenario';
import { documentFromVagueDescriptionScenario } from './document-from-vague-description.scenario';
import { researchLogReadbackScenario } from './research-log-readback.scenario';
import { projectCatchupColdScenario } from './project-catchup-cold.scenario';
import { bookWritingJourneyScenario } from './book-writing-journey.scenario';
import { semanticContractCancellationScenario } from './semantic-contract-cancellation.scenario';

export const scenarioCatalog: Scenario[] = [
	documentCreateScenario,
	documentEditContextScenario,
	projectOrganizeScenario,
	taskCreateScenario,
	calendarMoveScenario,
	emailReadScenario,
	taskCompleteColdReferenceScenario,
	entityResolutionMisspelledScenario,
	researchTurnFinalizesScenario,
	restraintNoopAndAmbiguityScenario,
	taskRescheduleColdReferenceScenario,
	taskMultiUpdateScenario,
	documentFromVagueDescriptionScenario,
	researchLogReadbackScenario,
	projectCatchupColdScenario,
	semanticContractCancellationScenario,
	bookWritingJourneyScenario
];
