// apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.test.ts
import { describe, expect, it } from 'vitest';
import {
	classifyOperationalTurnIntent,
	looksLikeMutationTurn,
	resolveOperationalSkillForTurn
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

describe('classifyOperationalTurnIntent', () => {
	it('maps task verbs to the task entity', () => {
		for (const message of [
			'Can you add a task to buy milk tomorrow?',
			'mark the intro call done',
			'remind me to send the deck on Friday',
			'assign the outreach task to Sam',
			'I finished the chapter 2 revision, close it out'
		]) {
			const intent = classifyOperationalTurnIntent(message);
			expect(intent.mutation, message).toBe(true);
			expect(intent.entityKinds[0], message).toBe('task');
		}
	});

	it('maps document and organize verbs to the document entity', () => {
		for (const message of [
			"This project's documents are a mess, please organize them",
			'Create a new document called Meeting Notes in the project',
			'append these notes to the research doc',
			'move the onboarding doc under Reference',
			'save this as a note in the project'
		]) {
			const intent = classifyOperationalTurnIntent(message);
			expect(intent.mutation, message).toBe(true);
			expect(intent.entityKinds[0], message).toBe('document');
		}
	});

	it('maps plan and sprint verbs to the plan entity', () => {
		for (const message of [
			'Plan out the next sprint for the mobile app',
			'create a plan for phase 2 with three milestones',
			'revise the roadmap so the beta phase lands in October'
		]) {
			const intent = classifyOperationalTurnIntent(message);
			expect(intent.mutation, message).toBe(true);
			expect(intent.entityKinds[0], message).toBe('plan');
		}
	});

	it('maps calendar verbs to the calendar entity', () => {
		for (const message of [
			'schedule a call with the designer for Thursday afternoon',
			'put the sprint review on my calendar for Friday at 3',
			'reschedule the standup to 10am'
		]) {
			const intent = classifyOperationalTurnIntent(message);
			expect(intent.mutation, message).toBe(true);
			expect(intent.entityKinds[0], message).toBe('calendar');
		}
	});

	it('does not read status questions or entity mentions as mutations', () => {
		for (const message of [
			'what tasks are due this week?',
			'show me the plan for phase 2',
			'update me on where the docs stand',
			'what changed in the plan since Monday?',
			'where are we at with this book? Do we have a theme or a synopsis',
			'Use Gmail read tools. First list my connected accounts, then search each readable account.',
			'search my email for the invoice from Stripe',
			'just talked to them, it went well'
		]) {
			const intent = classifyOperationalTurnIntent(message);
			expect(intent.mutation, message).toBe(false);
			expect(intent.entityKinds, message).toEqual([]);
		}
	});

	it('flags generic mutation phrasing without an entity noun', () => {
		expect(looksLikeMutationTurn('rename the grocery list to weekend errands')).toBe(true);
		expect(looksLikeMutationTurn('write this down so we do not lose it')).toBe(true);
		expect(
			classifyOperationalTurnIntent('rename the grocery list to weekend errands').entityKinds
		).toEqual([]);
		expect(looksLikeMutationTurn('')).toBe(false);
		expect(looksLikeMutationTurn(null)).toBe(false);
	});
});

describe('resolveOperationalSkillForTurn', () => {
	it('picks task_management on a project write surface for task intent', () => {
		expect(
			resolveOperationalSkillForTurn({
				message: 'mark the intro call done',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toEqual({ skillId: 'task_management', entityKind: 'task', alternateSkillIds: [] });
	});

	it('picks document_workspace for organize intent and names the task route as an alternate', () => {
		expect(
			resolveOperationalSkillForTurn({
				message:
					'Chapter 2 is complete — reorganize the docs under Drafts and add a task to draft chapter 3',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toMatchObject({
			skillId: 'task_management',
			alternateSkillIds: ['document_workspace']
		});
	});

	it('never names a skill whose write tools are not mounted', () => {
		// Plan tools are on no project surface today; calendar tools are not
		// executable on the worker at all. Both must stay silent until mounted.
		expect(
			resolveOperationalSkillForTurn({
				message: 'Plan out the next sprint for the mobile app',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toBeNull();
		expect(
			resolveOperationalSkillForTurn({
				message: 'schedule a call with the designer for Thursday afternoon',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toBeNull();
		expect(
			resolveOperationalSkillForTurn({
				message: 'Plan out the next sprint for the mobile app',
				toolNames: [...PROJECT_WRITE_DOCUMENT_TOOLS, 'create_onto_plan']
			})
		).toMatchObject({ skillId: 'plan_management' });
	});

	it('stays null on read-only surfaces and read turns', () => {
		expect(
			resolveOperationalSkillForTurn({
				message: 'mark the intro call done',
				toolNames: ['get_workspace_overview', 'search_buildos']
			})
		).toBeNull();
		expect(
			resolveOperationalSkillForTurn({
				message: 'what tasks are due this week?',
				toolNames: PROJECT_WRITE_DOCUMENT_TOOLS
			})
		).toBeNull();
	});
});
