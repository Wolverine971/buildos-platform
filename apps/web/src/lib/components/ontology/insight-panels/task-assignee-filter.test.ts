// apps/web/src/lib/components/ontology/insight-panels/task-assignee-filter.test.ts
import { describe, expect, it } from 'vitest';
import { ASSIGNEE_FILTER_ME, ASSIGNEE_FILTER_UNASSIGNED } from './insight-panel-config';
import { taskMatchesAssigneeFilter } from './task-assignee-filter';

describe('taskMatchesAssigneeFilter', () => {
	it('returns true when no assignee filters are selected', () => {
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [],
				currentActorId: 'actor-me',
				assignees: []
			})
		).toBe(true);
	});

	it('matches unassigned tasks when __unassigned__ is selected', () => {
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_UNASSIGNED],
				currentActorId: 'actor-me',
				assignees: []
			})
		).toBe(true);
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_UNASSIGNED],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-1' }]
			})
		).toBe(false);
	});

	it('matches tasks assigned to current actor when __me__ is selected', () => {
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_ME],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-me' }]
			})
		).toBe(true);
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_ME],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-1' }]
			})
		).toBe(false);
	});

	it('applies OR semantics for explicit assignees', () => {
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: ['actor-1', 'actor-2'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-2' }]
			})
		).toBe(true);
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: ['actor-1', 'actor-2'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-3' }]
			})
		).toBe(false);
	});

	it('matches either assigned actor or unassigned when both are selected', () => {
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_UNASSIGNED, 'actor-2'],
				currentActorId: 'actor-me',
				assignees: []
			})
		).toBe(true);
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_UNASSIGNED, 'actor-2'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-2' }]
			})
		).toBe(true);
		expect(
			taskMatchesAssigneeFilter({
				selectedValues: [ASSIGNEE_FILTER_UNASSIGNED, 'actor-2'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-3' }]
			})
		).toBe(false);
	});
});
