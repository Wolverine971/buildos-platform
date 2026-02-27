// apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.calendar-suggestion.test.ts
import { describe, expect, it } from 'vitest';

import {
	convertCalendarSuggestionToProjectSpec,
	type CalendarSuggestionInput
} from './braindump-to-ontology-adapter';

function buildSuggestion(
	overrides: Partial<CalendarSuggestionInput> = {}
): CalendarSuggestionInput {
	return {
		id: 'suggestion-1',
		analysis_id: 'analysis-1',
		user_id: 'user-1',
		created_at: '2026-02-27T00:00:00.000Z',
		updated_at: '2026-02-27T00:00:00.000Z',
		status: 'pending',
		suggested_name: 'Launch Coordination',
		suggested_description: 'Coordinate launch work.',
		suggested_context: '# Launch\nCoordinate planning and execution.',
		suggested_priority: null,
		confidence_score: 0.91,
		calendar_event_ids: ['event-1'],
		calendar_ids: ['primary'],
		event_count: 1,
		event_patterns: {
			start_date: '2026-03-01',
			end_date: '2026-04-01',
			tags: ['launch', 'ops']
		},
		ai_reasoning: 'Recurring launch events suggest a project.',
		detected_keywords: ['launch', 'review'],
		suggested_tasks: [
			{
				title: 'Prepare launch checklist',
				description: 'Compile all launch requirements',
				status: 'backlog',
				priority: 'high',
				start_date: '2026-03-02T09:00:00',
				due_at: '2026-03-03T11:00:00',
				event_id: 'event-1',
				recurrence_rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO'
			}
		],
		user_modified_name: null,
		user_modified_description: null,
		user_modified_context: null,
		rejection_reason: null,
		status_changed_at: null,
		analysis_result_id: null,
		created_project_id: null,
		applied_at: null,
		...overrides
	};
}

describe('convertCalendarSuggestionToProjectSpec', () => {
	it('produces ontology-first project spec and omits legacy project fields', () => {
		const suggestion = buildSuggestion();
		const spec = convertCalendarSuggestionToProjectSpec(suggestion);
		const expectedStartAt = new Date('2026-03-01T09:00:00').toISOString();
		const expectedEndAt = new Date('2026-04-01T09:00:00').toISOString();
		const expectedTaskDueAt = new Date('2026-03-03T11:00:00').toISOString();

		expect(spec.project.name).toBe('Launch Coordination');
		expect(spec.project.state_key).toBe('active');
		expect(spec.project.start_at).toBe(expectedStartAt);
		expect(spec.project.end_at).toBe(expectedEndAt);
		expect(spec.project.props?.source).toBe('calendar_analysis');
		expect(spec.project.props).not.toHaveProperty('slug');
		expect(spec.project.props).not.toHaveProperty('executive_summary');

		expect(spec.context_document?.type_key).toBe('document.context.project');
		expect(spec.context_document?.body_markdown).toContain('Coordinate planning and execution');

		const planEntity = spec.entities.find((entity) => entity.kind === 'plan');
		const taskEntity = spec.entities.find((entity) => entity.kind === 'task');
		expect(planEntity).toBeTruthy();
		expect(taskEntity).toBeTruthy();
		expect(taskEntity?.state_key).toBe('todo');
		expect(taskEntity?.due_at).toBe(expectedTaskDueAt);
		expect((taskEntity?.props as Record<string, unknown>)?.recurrence_rrule).toBe(
			'RRULE:FREQ=WEEKLY;BYDAY=MO'
		);
	});

	it('supports creating project specs without task entities', () => {
		const suggestion = buildSuggestion({
			suggested_tasks: []
		});
		const spec = convertCalendarSuggestionToProjectSpec(suggestion, {
			includeTasks: false
		});

		expect(spec.entities.find((entity) => entity.kind === 'plan')).toBeUndefined();
		expect(spec.entities.find((entity) => entity.kind === 'task')).toBeUndefined();
	});
});
