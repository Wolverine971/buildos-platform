// apps/web/src/lib/components/profile/cycles/cycle-presenter.ts
import type {
	CycleDefinition,
	CycleKind,
	CycleSchedule,
	CycleTrigger
} from '@buildos/shared-types';

export type CycleExecutionAuthority = 'preview' | 'authoritative';
export type CycleStatusKey = 'active' | 'paused' | 'attention' | 'preview';

export interface CycleKindPresentation {
	label: string;
	purpose: string;
}

export interface CycleStatusPresentation {
	key: CycleStatusKey;
	label: string;
	description: string;
	badgeVariant: 'success' | 'default' | 'error' | 'info';
}

export interface CyclePresenterOptions {
	authority: CycleExecutionAuthority;
	now?: Date;
	locale?: string;
	displayTimeZone?: string;
}

const KIND_PRESENTATIONS: Record<CycleKind, CycleKindPresentation> = {
	daily_brief: {
		label: 'Daily Brief',
		purpose: 'A daily orientation across your active projects.'
	},
	project_audit: {
		label: 'Project Audit',
		purpose: 'Checks a project for stale state, risks, and missing structure.'
	},
	project_review: {
		label: 'Project Review',
		purpose: 'Summarizes progress and prepares the next project review.'
	},
	task_review: {
		label: 'Task Review',
		purpose: 'Reviews tasks that may need attention or a clear next move.'
	}
};

export function presentCycleKind(kind: string): CycleKindPresentation {
	return (
		KIND_PRESENTATIONS[kind as CycleKind] ?? {
			label: 'Recurring work',
			purpose: 'Recurring work BuildOS can run for you.'
		}
	);
}

function formatLocalTime(timeOfDay: string, locale: string): string {
	const [hours = '0', minutes = '0'] = timeOfDay.split(':');
	const date = new Date(Date.UTC(2024, 0, 1, Number(hours), Number(minutes)));
	return new Intl.DateTimeFormat(locale, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC'
	}).format(date);
}

function weekdayName(day: number, locale: string): string {
	// 2023-01-01 was a Sunday, matching the Cycle weekday contract (0–6).
	return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
		new Date(Date.UTC(2023, 0, 1 + day))
	);
}

function formatInterval(minutes: number): string {
	if (minutes % 1440 === 0) {
		const days = minutes / 1440;
		return `Every ${days} ${days === 1 ? 'day' : 'days'}`;
	}
	if (minutes % 60 === 0) {
		const hours = minutes / 60;
		return `Every ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
	}
	return `Every ${minutes} minutes`;
}

export function formatCycleSchedule(schedule: CycleSchedule, locale = 'en-US'): string {
	if (schedule.type === 'daily') {
		return `Every day at ${formatLocalTime(schedule.time_of_day, locale)} · ${schedule.timezone}`;
	}
	if (schedule.type === 'weekly') {
		const days = schedule.days_of_week.map((day) => weekdayName(day, locale)).join(', ');
		return `Every ${days} at ${formatLocalTime(schedule.time_of_day, locale)} · ${schedule.timezone}`;
	}
	return formatInterval(schedule.every_minutes);
}

function activeTriggers(cycle: CycleDefinition): CycleTrigger[] {
	return cycle.triggers.filter((trigger) => trigger.state === 'active');
}

export function presentCycleCadence(cycle: CycleDefinition, locale = 'en-US'): string {
	const active = activeTriggers(cycle);
	const scheduleTrigger = active.find(
		(trigger): trigger is Extract<CycleTrigger, { type: 'schedule' }> =>
			trigger.type === 'schedule'
	);
	if (scheduleTrigger) return formatCycleSchedule(scheduleTrigger.schedule, locale);

	const pausedSchedule = cycle.triggers.find(
		(trigger): trigger is Extract<CycleTrigger, { type: 'schedule' }> =>
			trigger.type === 'schedule' && trigger.state === 'paused'
	);
	if (pausedSchedule)
		return `${formatCycleSchedule(pausedSchedule.schedule, locale)} · Schedule paused`;
	if (active.length > 0) return 'Runs when its trigger conditions are met.';
	return 'No active schedule';
}

export function presentCycleStatus(
	cycle: CycleDefinition,
	authority: CycleExecutionAuthority
): CycleStatusPresentation {
	if (cycle.last_error) {
		return {
			key: 'attention',
			label: 'Needs attention',
			description:
				authority === 'preview'
					? 'This preview has a recorded issue and is not managing your schedule.'
					: 'The most recent attempt needs attention.',
			badgeVariant: 'error'
		};
	}

	if (authority === 'preview') {
		return {
			key: 'preview',
			label: 'Preview',
			description: 'Not managing your schedule yet.',
			badgeVariant: 'info'
		};
	}

	if (cycle.state === 'paused') {
		return {
			key: 'paused',
			label: 'Paused',
			description: 'This Cycle is not currently scheduled to run.',
			badgeVariant: 'default'
		};
	}

	if (cycle.state !== 'active' || activeTriggers(cycle).length === 0) {
		return {
			key: 'attention',
			label: 'Needs attention',
			description: 'No active trigger is available for this Cycle.',
			badgeVariant: 'error'
		};
	}

	return {
		key: 'active',
		label: 'Active',
		description: 'BuildOS is managing this Cycle.',
		badgeVariant: 'success'
	};
}

export function formatCycleTimestamp(
	value: string | null,
	options: Pick<CyclePresenterOptions, 'locale' | 'displayTimeZone'> = {}
): string | null {
	if (!value || !Number.isFinite(Date.parse(value))) return null;
	return new Intl.DateTimeFormat(options.locale ?? 'en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: options.displayTimeZone ?? 'UTC',
		timeZoneName: 'short'
	}).format(new Date(value));
}

export function presentCycle(cycle: CycleDefinition, options: CyclePresenterOptions) {
	const status = presentCycleStatus(cycle, options.authority);
	const nextRun =
		options.authority === 'authoritative' && status.key === 'active'
			? formatCycleTimestamp(cycle.next_run_at, options)
			: null;

	return {
		kind: presentCycleKind(cycle.kind),
		status,
		cadence: presentCycleCadence(cycle, options.locale),
		nextRun,
		lastRun: formatCycleTimestamp(cycle.last_run_at, options),
		failureSummary: cycle.last_error ? 'The latest recorded attempt needs attention.' : null
	};
}
