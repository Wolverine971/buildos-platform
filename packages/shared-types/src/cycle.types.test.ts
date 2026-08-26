// packages/shared-types/src/cycle.types.test.ts
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CYCLE_ATTENTION_POLICY_BY_KIND,
	DEFAULT_CYCLE_EXECUTION_POLICY,
	validateCycleInput,
	type CycleRunOutcome,
	type CreateCycleInputFor
} from './cycle.types';
import { validateCycleQueueJobMetadata } from './validation';
import type { NotificationEvent } from './notification.types';

const validDailyBrief = {
	request_id: 'create-cycle-1',
	label: 'Daily brief',
	kind: 'daily_brief',
	target: { type: 'user', project_id: null },
	triggers: [
		{
			type: 'schedule',
			schedule: {
				type: 'daily',
				time_of_day: '08:30',
				timezone: 'America/New_York'
			}
		}
	],
	config: {}
} satisfies CreateCycleInputFor<'daily_brief'>;

describe('cycle contract', () => {
	it('accepts a valid user-local daily schedule', () => {
		expect(validateCycleInput(validDailyBrief)).toEqual([]);
	});

	it('accepts a bounded Daily Brief generation lead and rejects invalid values', () => {
		expect(
			validateCycleInput({
				...validDailyBrief,
				config: { generation_lead_minutes: 10 }
			})
		).toEqual([]);
		expect(
			validateCycleInput({
				...validDailyBrief,
				config: { generation_lead_minutes: 31 }
			})
		).toContainEqual(
			expect.objectContaining({
				path: 'config.generation_lead_minutes',
				code: 'invalid_generation_lead'
			})
		);
	});

	it('rejects ambiguous or invalid weekly schedule fields', () => {
		const input = {
			...validDailyBrief,
			triggers: [
				{
					type: 'schedule' as const,
					schedule: {
						type: 'weekly' as const,
						days_of_week: [1, 1],
						time_of_day: '25:00',
						timezone: 'Mars/Olympus_Mons'
					}
				}
			]
		} satisfies CreateCycleInputFor<'daily_brief'>;

		expect(validateCycleInput(input).map((issue) => issue.code)).toEqual([
			'invalid_time',
			'invalid_timezone',
			'invalid_weekdays'
		]);
	});

	it('requires a project target for project audits', () => {
		const invalidAudit = {
			...validDailyBrief,
			kind: 'project_audit' as const,
			config: { depth: 'standard' as const }
		} as unknown as CreateCycleInputFor<'project_audit'>;

		expect(validateCycleInput(invalidAudit)).toContainEqual(
			expect.objectContaining({ code: 'invalid_target', path: 'target' })
		);
	});

	it('pins conservative overlap, catch-up, and retry defaults', () => {
		expect(DEFAULT_CYCLE_EXECUTION_POLICY).toEqual({
			overlap: 'skip',
			misfire: 'run_once',
			max_attempts: 3
		});
	});

	it('pins attention defaults by Cycle kind', () => {
		expect(DEFAULT_CYCLE_ATTENTION_POLICY_BY_KIND).toEqual({
			daily_brief: 'always',
			project_audit: 'exceptions',
			project_review: 'exceptions',
			task_review: 'exceptions'
		});
	});

	it('validates the minimal generic queue envelope', () => {
		const metadata = {
			cycle_id: '11111111-1111-4111-8111-111111111111',
			cycle_run_id: '22222222-2222-4222-8222-222222222222',
			kind: 'daily_brief' as const
		};

		expect(validateCycleQueueJobMetadata(metadata)).toEqual(metadata);
		expect(() => validateCycleQueueJobMetadata({ ...metadata, kind: 'unknown_cycle' })).toThrow(
			"Validation failed for field 'kind'"
		);
	});

	it('rejects intervals too small for the general worker queue', () => {
		const input = {
			...validDailyBrief,
			triggers: [
				{
					type: 'schedule' as const,
					schedule: {
						type: 'interval' as const,
						every_minutes: 1,
						anchor_at: 'not-a-date'
					}
				}
			]
		} satisfies CreateCycleInputFor<'daily_brief'>;

		expect(validateCycleInput(input).map((issue) => issue.code)).toEqual([
			'invalid_interval',
			'invalid_timestamp'
		]);
	});

	it('accepts several independent triggers for one Cycle', () => {
		const projectAudit = {
			request_id: 'create-audit-cycle-1',
			label: 'Project health review',
			kind: 'project_audit',
			target: { type: 'project', project_id: 'project-1' },
			triggers: [
				{
					type: 'schedule',
					schedule: {
						type: 'weekly',
						days_of_week: [1],
						time_of_day: '09:00',
						timezone: 'America/New_York'
					}
				},
				{
					type: 'event',
					event_types: ['project.activity.changed'],
					debounce_minutes: 30
				},
				{
					type: 'threshold',
					metric: 'project.changed_entity_count',
					operator: 'gte',
					value: 20,
					evaluation_window_minutes: 60
				}
			],
			config: { depth: 'standard' }
		} satisfies CreateCycleInputFor<'project_audit'>;

		expect(validateCycleInput(projectAudit)).toEqual([]);
	});

	it('requires an automatic trigger and validates event trigger identity', () => {
		const missingTrigger = { ...validDailyBrief, triggers: [] };
		const duplicateEvents = {
			...validDailyBrief,
			triggers: [
				{
					type: 'event' as const,
					event_types: ['project.changed', 'project.changed']
				}
			]
		};

		expect(validateCycleInput(missingTrigger)).toContainEqual(
			expect.objectContaining({ code: 'required', path: 'triggers' })
		);
		expect(validateCycleInput(duplicateEvents)).toContainEqual(
			expect.objectContaining({ code: 'invalid_event_types', path: 'triggers.0.event_types' })
		);
	});

	it('normalizes run outcomes before attention and delivery routing', () => {
		const outcome = {
			status: 'attention_required',
			attention_level: 'decision',
			summary: 'Two conflicting deadlines need a decision.',
			artifact_refs: [{ type: 'project_review', id: 'review-1' }]
		} satisfies CycleRunOutcome;

		const event = {
			event_type: 'brief.completed',
			event_source: 'worker_job',
			cycle_run_id: 'cycle-run-1',
			payload: { brief_id: 'brief-1' }
		} satisfies NotificationEvent;

		expect(outcome.attention_level).toBe('decision');
		expect(event.cycle_run_id).toBe('cycle-run-1');
	});
});
