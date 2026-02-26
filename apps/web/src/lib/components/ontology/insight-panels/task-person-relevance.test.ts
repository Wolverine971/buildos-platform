import { describe, expect, it } from 'vitest';
import { PERSON_FILTER_ME } from './insight-panel-config';
import {
	getTaskPersonRelevanceLabel,
	getTaskPersonRelevanceScore,
	resolveTaskPersonFocusActorId,
	taskMatchesPersonFocusFilter
} from './task-person-relevance';

describe('resolveTaskPersonFocusActorId', () => {
	it('defaults to current actor when no person is selected', () => {
		expect(
			resolveTaskPersonFocusActorId({
				selectedValues: [],
				currentActorId: 'actor-me'
			})
		).toBe('actor-me');
	});

	it('resolves __person_me__ to current actor', () => {
		expect(
			resolveTaskPersonFocusActorId({
				selectedValues: [PERSON_FILTER_ME],
				currentActorId: 'actor-me'
			})
		).toBe('actor-me');
	});

	it('returns explicit selected actor for teammate focus', () => {
		expect(
			resolveTaskPersonFocusActorId({
				selectedValues: ['actor-fill'],
				currentActorId: 'actor-me'
			})
		).toBe('actor-fill');
	});
});

describe('getTaskPersonRelevanceScore', () => {
	it('prioritizes assignee match above created/updated match', () => {
		expect(
			getTaskPersonRelevanceScore({
				focusActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-me' }],
				createdByActorId: 'actor-me',
				lastChangedByActorId: 'actor-me'
			})
		).toBe(2);
	});

	it('returns created/updated relevance when not assigned', () => {
		expect(
			getTaskPersonRelevanceScore({
				focusActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-fill' }],
				createdByActorId: 'actor-me',
				lastChangedByActorId: null
			})
		).toBe(1);
	});

	it('returns zero when task is unrelated to focus actor', () => {
		expect(
			getTaskPersonRelevanceScore({
				focusActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-fill' }],
				createdByActorId: 'actor-other',
				lastChangedByActorId: 'actor-other'
			})
		).toBe(0);
	});
});

describe('taskMatchesPersonFocusFilter', () => {
	it('returns true when no person filters are selected', () => {
		expect(
			taskMatchesPersonFocusFilter({
				selectedValues: [],
				currentActorId: 'actor-me',
				assignees: [],
				createdByActorId: 'actor-fill',
				lastChangedByActorId: 'actor-fill'
			})
		).toBe(true);
	});

	it('matches tasks assigned to selected teammate', () => {
		expect(
			taskMatchesPersonFocusFilter({
				selectedValues: ['actor-fill'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-fill' }],
				createdByActorId: 'actor-other',
				lastChangedByActorId: 'actor-other'
			})
		).toBe(true);
	});

	it('matches tasks created by selected person', () => {
		expect(
			taskMatchesPersonFocusFilter({
				selectedValues: ['actor-fill'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-other' }],
				createdByActorId: 'actor-fill',
				lastChangedByActorId: 'actor-other'
			})
		).toBe(true);
	});

	it('does not match unrelated task for selected person', () => {
		expect(
			taskMatchesPersonFocusFilter({
				selectedValues: ['actor-fill'],
				currentActorId: 'actor-me',
				assignees: [{ actor_id: 'actor-other' }],
				createdByActorId: 'actor-other',
				lastChangedByActorId: 'actor-other'
			})
		).toBe(false);
	});
});

describe('getTaskPersonRelevanceLabel', () => {
	it('maps scores to display labels', () => {
		expect(getTaskPersonRelevanceLabel(2)).toBe('Assigned');
		expect(getTaskPersonRelevanceLabel(1)).toBe('Created/Updated');
		expect(getTaskPersonRelevanceLabel(0)).toBe('Other');
	});
});
