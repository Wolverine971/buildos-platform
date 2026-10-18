// apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.test.ts
//
// The operational playbooks are eligible by mounted capability only. The
// message lexicon that used to pick one (regex verbs + entity nouns) was
// deleted on 2026-10-17 (audit Q1, AGENTS.md "Never classify language with
// regex"); the worker now picks from Jev's structured write commission.
import { describe, expect, it } from 'vitest';
import * as intentModule from './operational-skill-intent';
import {
	isOperationalSkillEligibleForTools,
	operationalEntityKindsForTools
} from './operational-skill-intent';

const PROJECT_WRITE_DOCUMENT_TOOLS = [
	'declare_turn_contract',
	'get_project_overview',
	'list_onto_tasks',
	'create_onto_task',
	'update_onto_task',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
];

describe('operational playbook eligibility', () => {
	it('lists every playbook whose write tools are mounted, in a stable order', () => {
		expect(operationalEntityKindsForTools(PROJECT_WRITE_DOCUMENT_TOOLS)).toEqual([
			'task',
			'document'
		]);
		expect(
			operationalEntityKindsForTools([
				...PROJECT_WRITE_DOCUMENT_TOOLS,
				'create_onto_plan',
				'create_calendar_event'
			])
		).toEqual(['task', 'document', 'plan', 'calendar']);
	});

	it('never names a playbook whose write tools are not mounted', () => {
		expect(
			operationalEntityKindsForTools(['get_workspace_overview', 'search_buildos'])
		).toEqual([]);
		expect(isOperationalSkillEligibleForTools('plan', PROJECT_WRITE_DOCUMENT_TOOLS)).toBe(
			false
		);
		expect(isOperationalSkillEligibleForTools('calendar', ['update_calendar_event'])).toBe(
			true
		);
	});

	it('exports no message classifier', () => {
		for (const retired of [
			'classifyOperationalTurnIntent',
			'looksLikeMutationTurn',
			'resolveOperationalExampleHint',
			'resolveOperationalSkillForTurn'
		]) {
			expect(intentModule).not.toHaveProperty(retired);
		}
	});
});
