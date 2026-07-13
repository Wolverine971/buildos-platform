// apps/web/src/lib/tests/agentic-e2e/scenarios/catalog.ts
//
// The registry of scenarios the runner iterates. Add new scenarios here.
import type { Scenario } from '../harness/types';
import { documentCreateScenario } from './document-create.scenario';
import { documentEditContextScenario } from './document-edit-context.scenario';
import { projectOrganizeScenario } from './project-organize.scenario';
import { taskCreateScenario } from './task-create.scenario';
import { calendarMoveScenario } from './calendar-move.scenario';

export const scenarioCatalog: Scenario[] = [
	documentCreateScenario,
	documentEditContextScenario,
	projectOrganizeScenario,
	taskCreateScenario,
	calendarMoveScenario
];
