// apps/web/src/lib/server/fsm/actions/schedule-rrule.ts
import rrule from 'rrule';
import type { RRule as RRuleClass } from 'rrule';
const { RRule } = rrule;
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { FSMAction } from '$lib/types/onto';
import type { TransitionContext } from '../engine';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Json } from '@buildos/shared-types';

type EntityContext = {
	id: string;
	project_id: string;
	type_key: string;
	state_key: string;
};

type TaskTemplateInput = {
	title?: string;
	state_key?: string;
	priority?: number;
	props?: Record<string, unknown>;
};

const MAX_OCCURRENCES = 365;

export async function executeScheduleRruleAction(
	action: FSMAction,
	entity: EntityContext,
	ctx: TransitionContext,
	clientParam?: TypedSupabaseClient
): Promise<string> {
	if (!action.rrule) {
		throw new Error('schedule_rrule requires an rrule string');
	}

	if (!action.task_template) {
		throw new Error('schedule_rrule requires task_template');
	}

	if (!ctx.actor_id) {
		throw new Error('schedule_rrule requires actor context');
	}

	const taskTemplate = normaliseTaskTemplate(action.task_template as Record<string, unknown>);
	const rule = parseRule(action.rrule);

	const occurrences = rule.all((_: Date, index: number) => index < MAX_OCCURRENCES);

	if (occurrences.length === 0) {
		return 'schedule_rrule(0 tasks)';
	}

	const client = clientParam ?? createAdminSupabaseClient();
	const tasks = buildTaskRows({
		occurrences,
		taskTemplate,
		entity,
		action,
		actorId: ctx.actor_id,
		rrule: action.rrule
	});

	const { error } = await client.from('onto_tasks').insert(tasks);

	if (error) {
		throw new Error(`Failed to schedule tasks: ${error.message}`);
	}

	return `schedule_rrule(${tasks.length} tasks)`;
}

function parseRule(rrule: string): RRuleClass {
	try {
		return RRule.fromString(rrule);
	} catch (err) {
		throw new Error(`Invalid RRULE string: ${(err as Error).message}`);
	}
}

function normaliseTaskTemplate(input: Record<string, unknown>): TaskTemplateInput {
	const template: TaskTemplateInput = {};

	if (typeof input.title === 'string' && input.title.trim().length > 0) {
		template.title = input.title.trim();
	}

	if (typeof input.state_key === 'string' && input.state_key.trim().length > 0) {
		template.state_key = input.state_key.trim();
	}

	if (typeof input.priority === 'number') {
		template.priority = input.priority;
	}

	if (isPlainObject(input.props)) {
		template.props = input.props as Record<string, unknown>;
	}

	return template;
}

function buildTaskRows(params: {
	occurrences: Date[];
	taskTemplate: TaskTemplateInput;
	entity: EntityContext;
	action: FSMAction;
	actorId: string;
	rrule: string;
}) {
	const { occurrences, taskTemplate, entity, action, actorId, rrule } = params;
	const baseTitle = taskTemplate.title ?? 'Recurring Task';
	const stateKey = taskTemplate.state_key ?? 'todo';

	return occurrences.map((date, index) => {
		const occurrenceISO = date.toISOString();

		return {
			project_id: entity.project_id,
			plan_id: action.plan_id ?? null,
			title: occurrences.length > 1 ? `${baseTitle} (${index + 1})` : baseTitle,
			state_key: stateKey,
			due_at: occurrenceISO,
			priority: taskTemplate.priority ?? null,
			props: buildTaskProps(taskTemplate.props, {
				rrule,
				index,
				date: occurrenceISO,
				source_entity_id: entity.id,
				source_type_key: entity.type_key
			}) as Json,
			created_by: actorId
		};
	});
}

function buildTaskProps(
	templateProps: Record<string, unknown> | undefined,
	recurrence: {
		rrule: string;
		index: number;
		date: string;
		source_entity_id: string;
		source_type_key: string;
	}
) {
	const baseProps: Record<string, unknown> = templateProps ? structuredClone(templateProps) : {};

	baseProps.recurrence = {
		rrule: recurrence.rrule,
		index: recurrence.index,
		date: recurrence.date,
		source_entity_id: recurrence.source_entity_id,
		source_type_key: recurrence.source_type_key
	};

	return baseProps as Json;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
