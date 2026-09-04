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
import { projectCreateContractScenario } from './project-create-contract.scenario';
import { toolGraphParallelReadsScenario } from './tool-graph-parallel-reads.scenario';
import { readDefaultGlobalStatusScenario } from './read-default-global-status.scenario';
// Cedar House battery — replay of the 2026-09-03 adversarial browser assessment
// (artifacts/agentic-chat-audit-2026-09-03.md). Select with AGENTIC_BATTERY=cedar-house.
// Cases 10-12 (calendar) are pending; see ./cedar-house/cases-10-to-12-calendar.pending.ts.
import { cedarCase01ProjectCreateScenario } from './cedar-house/case-01-project-create.scenario';
import { cedarCase02TaskBatchScenario } from './cedar-house/case-02-task-batch.scenario';
import { cedarCase03NoDuplicateScenario } from './cedar-house/case-03-no-duplicate.scenario';
import { cedarCase04NarrowUpdateScenario } from './cedar-house/case-04-narrow-update.scenario';
import { cedarCase05AmbiguousReferenceScenario } from './cedar-house/case-05-ambiguous-reference.scenario';
import { cedarCase06DependencyConflictScenario } from './cedar-house/case-06-dependency-conflict.scenario';
import { cedarCase07DocumentCreateScenario } from './cedar-house/case-07-document-create.scenario';
import { cedarCase08DocumentEditScenario } from './cedar-house/case-08-document-edit.scenario';
import { cedarCase09HostileSourceScenario } from './cedar-house/case-09-hostile-source.scenario';
import { cedarCase13ColdRetrievalScenario } from './cedar-house/case-13-cold-retrieval.scenario';
import { cedarCase14GroundedStatusScenario } from './cedar-house/case-14-grounded-status.scenario';

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
	projectCreateContractScenario,
	toolGraphParallelReadsScenario,
	readDefaultGlobalStatusScenario,
	bookWritingJourneyScenario,
	cedarCase01ProjectCreateScenario,
	cedarCase02TaskBatchScenario,
	cedarCase03NoDuplicateScenario,
	cedarCase04NarrowUpdateScenario,
	cedarCase05AmbiguousReferenceScenario,
	cedarCase06DependencyConflictScenario,
	cedarCase07DocumentCreateScenario,
	cedarCase08DocumentEditScenario,
	cedarCase09HostileSourceScenario,
	cedarCase13ColdRetrievalScenario,
	cedarCase14GroundedStatusScenario
];
