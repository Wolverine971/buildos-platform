// apps/web/src/lib/services/task-series.service.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Database, Json } from '@buildos/shared-types';
import rrulePkg from 'rrule';
import { format } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const { RRule } = rrulePkg;

type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];

export interface EnableTaskSeriesInput {
	rrule: string;
	timezone: string;
	start_at?: string;
	max_instances?: number;
	regenerate_on_update?: boolean;
}

export interface EnableTaskSeriesResult {
	master: OntoTaskRow;
	instances: OntoTaskRow[];
	series_id: string;
}

const MAX_OCCURRENCES_HARD_LIMIT = 200;
const DEFAULT_OCCURRENCES_LIMIT = 52;

export async function enableTaskSeries(
	client: TypedSupabaseClient,
	taskId: string,
	input: EnableTaskSeriesInput
): Promise<EnableTaskSeriesResult> {
	const task = await loadTask(client, taskId);
	const seriesMeta = getSeriesMeta(task);

	if (seriesMeta?.role === 'master') {
		throw new Error('Task is already a recurring series master');
	}

	if (seriesMeta?.role === 'instance') {
		throw new Error('Series instances cannot be converted to another series');
	}

	const timezone = validateTimezone(input.timezone);
	const startAtIso = resolveStartAt(task, input.start_at);
	const normalizedRrule = normalizeRrule(input.rrule);

	const limit = resolveLimit(input.max_instances);
	const { occurrences, localStartString } = buildOccurrences({
		rrule: normalizedRrule,
		startAt: new Date(startAtIso),
		timezone,
		limit
	});

	if (!occurrences.length) {
		throw new Error('RRULE did not produce any dates');
	}

	const seriesId = crypto.randomUUID();
	const masterProps = buildMasterProps(task, {
		seriesId,
		timezone,
		rrule: normalizedRrule,
		localStart: localStartString,
		regenerateOnUpdate: input.regenerate_on_update ?? false,
		instanceCount: occurrences.length
	});

	const instanceRows = occurrences.map((occurrence, index) =>
		buildInstanceRow(task, {
			occurrence,
			index,
			seriesId,
			timezone,
			rrule: normalizedRrule
		})
	);

	const { error } = await client.rpc('task_series_enable', {
		p_task_id: taskId,
		p_series_id: seriesId,
		p_master_props: masterProps as Json,
		p_instance_rows: instanceRows as Json
	});

	if (error) {
		throw new Error(error.message || 'Failed to enable task series');
	}

	const updatedMaster = await loadTask(client, taskId);

	const { data: instances, error: instanceError } = await client
		.from('onto_tasks')
		.select('*')
		.eq('props->>series_id', seriesId)
		.eq('project_id', task.project_id)
		.is('deleted_at', null)
		.order('due_at', { ascending: true });

	if (instanceError) {
		throw new Error(instanceError.message || 'Failed to load created series instances');
	}

	return {
		master: updatedMaster,
		instances: instances ?? [],
		series_id: seriesId
	};
}

export async function deleteTaskSeries(
	client: TypedSupabaseClient,
	seriesId: string,
	options: { force?: boolean } = {}
) {
	const { data, error } = await client.rpc('task_series_delete', {
		p_series_id: seriesId,
		p_force: options.force ?? false
	});

	if (error) {
		throw new Error(error.message || 'Failed to delete task series');
	}

	return data;
}

function normalizeRrule(raw: string): string {
	const trimmed = raw.trim();
	return /^RRULE:/i.test(trimmed) ? trimmed : `RRULE:${trimmed}`;
}

function resolveLimit(requested?: number): number {
	const requestedLimit = requested && requested > 0 ? requested : DEFAULT_OCCURRENCES_LIMIT;
	return Math.min(requestedLimit, MAX_OCCURRENCES_HARD_LIMIT);
}

function validateTimezone(timezone: string): string {
	if (!timezone) {
		throw new Error('Timezone is required');
	}

	const normalized = timezone.trim();
	if (!normalized) {
		throw new Error('Timezone is required');
	}

	const hasSupportedValues = typeof Intl.supportedValuesOf === 'function';
	if (hasSupportedValues) {
		const allowed = Intl.supportedValuesOf('timeZone');
		if (!allowed.includes(normalized)) {
			throw new Error(`Invalid timezone "${normalized}"`);
		}
	} else {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: normalized });
		} catch {
			throw new Error(`Invalid timezone "${normalized}"`);
		}
	}

	return normalized;
}

function resolveStartAt(task: OntoTaskRow, override?: string) {
	const source = override ?? task.due_at ?? task.created_at;
	if (!source) {
		throw new Error('A start date is required to build the series');
	}

	const startDate = new Date(source);
	if (isNaN(startDate.getTime())) {
		throw new Error('Invalid start date provided');
	}

	return startDate.toISOString();
}

function buildOccurrences(params: {
	rrule: string;
	startAt: Date;
	timezone: string;
	limit: number;
}) {
	const { rrule, startAt, timezone, limit } = params;
	const options = RRule.parseString(rrule.replace(/^RRULE:/i, ''));

	const localStart = formatInTimeZone(startAt, timezone, "yyyy-MM-dd'T'HH:mm:ss");
	const localStartWithOffset = formatInTimeZone(startAt, timezone, "yyyy-MM-dd'T'HH:mm:ssxxx");
	const dtstart = buildUtcDateFromLocalString(localStart);

	if (options.count) {
		options.count = Math.min(options.count, limit);
	}
	options.dtstart = dtstart;

	const rule = new RRule(options);
	const occurrences = rule.all((_, index) => index < limit);

	return { occurrences, localStartString: localStartWithOffset };
}

function buildInstanceRow(
	task: OntoTaskRow,
	params: {
		occurrence: Date;
		index: number;
		seriesId: string;
		timezone: string;
		rrule: string;
	}
) {
	const baseProps = cloneProps(task.props);
	delete baseProps.series;
	delete baseProps.series_id;

	const dueAt = fromZonedTime(params.occurrence, params.timezone);
	const localOccurrence = formatInTimeZone(dueAt, params.timezone, "yyyy-MM-dd'T'HH:mm:ssxxx");

	const props = {
		...baseProps,
		series_id: params.seriesId,
		series: {
			id: params.seriesId,
			role: 'instance',
			index: params.index,
			master_task_id: task.id,
			timezone: params.timezone
		},
		recurrence: {
			rrule: params.rrule,
			index: params.index,
			occurrence_at: dueAt.toISOString(),
			local_occurrence_at: localOccurrence,
			source_entity_id: task.id,
			source_type_key: (task as any).type_key ?? baseProps.type_key ?? null
		}
	};

	return {
		project_id: task.project_id,
		type_key: task.type_key ?? 'task.execute',
		title: buildInstanceTitle(task.title, params.index),
		state_key: 'todo',
		due_at: dueAt.toISOString(),
		priority: task.priority ?? null,
		props,
		created_by: task.created_by
	};
}

function buildMasterProps(
	task: OntoTaskRow,
	params: {
		seriesId: string;
		timezone: string;
		rrule: string;
		localStart: string;
		regenerateOnUpdate: boolean;
		instanceCount: number;
	}
) {
	const baseProps = cloneProps(task.props);

	return {
		...baseProps,
		series_id: params.seriesId,
		series: {
			id: params.seriesId,
			role: 'master',
			timezone: params.timezone,
			rrule: params.rrule,
			dtstart: params.localStart,
			regenerate_on_update: params.regenerateOnUpdate,
			instance_count: params.instanceCount,
			last_generated_at: new Date().toISOString(),
			master_task_id: task.id
		}
	};
}

function loadTask(client: TypedSupabaseClient, taskId: string) {
	return client
		.from('onto_tasks')
		.select('*')
		.eq('id', taskId)
		.is('deleted_at', null)
		.single()
		.then(({ data, error }) => {
			if (error || !data) {
				throw new Error('Task not found');
			}
			return data;
		});
}

function getSeriesMeta(task: OntoTaskRow) {
	const props = asRecord(task.props);
	return props.series as Record<string, any> | undefined;
}

function cloneProps(value: Json | null) {
	if (!isRecord(value)) {
		return {};
	}

	if (typeof structuredClone === 'function') {
		return structuredClone(value);
	}

	return JSON.parse(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: Json | null) {
	return isRecord(value) ? (value as Record<string, any>) : {};
}

function buildInstanceTitle(title: string, index: number) {
	const trimmed = title?.trim() || 'Recurring Task';
	return `${trimmed} (${index + 1})`;
}

function buildUtcDateFromLocalString(local: string) {
	const [datePart, timePart = '00:00:00'] = local.split('T');
	const [year, month, day] = datePart.split('-').map((part) => Number(part));
	const [hour, minute, second] = timePart.split(':').map((part) => Number(part));

	return new Date(Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0, second ?? 0));
}
