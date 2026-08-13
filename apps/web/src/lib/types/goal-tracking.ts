// apps/web/src/lib/types/goal-tracking.ts
import type { GoalConnectionSummary } from '$lib/types/goal-connection-summary';

export const GOAL_TRACKING_METHODS = ['none', 'milestones', 'tasks', 'manual', 'metric'] as const;

export type GoalTrackingMethod = (typeof GOAL_TRACKING_METHODS)[number];

export type GoalTrackingConfig = {
	version: 1;
	method: GoalTrackingMethod;
	updated_at: string | null;
	manual?: {
		percent: number;
		note: string | null;
	};
	metric?: {
		label: string;
		start: number;
		current: number;
		target: number;
		unit: string | null;
	};
};

export type GoalTrackingView = {
	method: GoalTrackingMethod;
	label: string;
	detail: string;
	percent: number | null;
	hasData: boolean;
	updated_at: string | null;
};

const METHOD_SET = new Set<GoalTrackingMethod>(GOAL_TRACKING_METHODS);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, Math.round(value)));
}

function compactNumber(value: number): string {
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function emptyGoalTrackingConfig(): GoalTrackingConfig {
	return { version: 1, method: 'none', updated_at: null };
}

export function readGoalTrackingConfig(props: unknown): GoalTrackingConfig {
	if (!isRecord(props) || !isRecord(props.goal_tracking)) return emptyGoalTrackingConfig();

	const raw = props.goal_tracking;
	const method =
		typeof raw.method === 'string' && METHOD_SET.has(raw.method as GoalTrackingMethod)
			? (raw.method as GoalTrackingMethod)
			: 'none';
	const updatedAt = typeof raw.updated_at === 'string' ? raw.updated_at : null;
	const config: GoalTrackingConfig = { version: 1, method, updated_at: updatedAt };

	if (method === 'manual' && isRecord(raw.manual)) {
		const percent = finiteNumber(raw.manual.percent);
		if (percent !== null) {
			config.manual = {
				percent: clampPercent(percent),
				note:
					typeof raw.manual.note === 'string' && raw.manual.note.trim().length > 0
						? raw.manual.note.trim()
						: null
			};
		}
	}

	if (method === 'metric' && isRecord(raw.metric)) {
		const start = finiteNumber(raw.metric.start);
		const current = finiteNumber(raw.metric.current);
		const target = finiteNumber(raw.metric.target);
		if (start !== null && current !== null && target !== null) {
			config.metric = {
				label:
					typeof raw.metric.label === 'string' && raw.metric.label.trim().length > 0
						? raw.metric.label.trim()
						: 'Metric',
				start,
				current,
				target,
				unit:
					typeof raw.metric.unit === 'string' && raw.metric.unit.trim().length > 0
						? raw.metric.unit.trim()
						: null
			};
		}
	}

	return config;
}

export function goalTrackingMethodLabel(method: GoalTrackingMethod): string {
	if (method === 'milestones') return 'Milestones';
	if (method === 'tasks') return 'Tasks';
	if (method === 'manual') return 'Manual';
	if (method === 'metric') return 'Metric';
	return 'No score';
}

export function buildGoalTrackingView(
	config: GoalTrackingConfig,
	summary: GoalConnectionSummary | null | undefined
): GoalTrackingView {
	if (config.method === 'milestones') {
		const total = summary?.milestones.total ?? 0;
		const completed = summary?.milestones.completed ?? 0;
		return {
			method: config.method,
			label: 'Milestone progress',
			detail: total > 0 ? `${completed}/${total} complete` : 'No milestones connected',
			percent: total > 0 ? clampPercent((completed / total) * 100) : null,
			hasData: total > 0,
			updated_at: config.updated_at
		};
	}

	if (config.method === 'tasks') {
		const total = summary?.tasks.total ?? 0;
		const completed = summary?.tasks.done ?? 0;
		return {
			method: config.method,
			label: 'Task progress',
			detail: total > 0 ? `${completed}/${total} done` : 'No tasks connected',
			percent: total > 0 ? clampPercent((completed / total) * 100) : null,
			hasData: total > 0,
			updated_at: config.updated_at
		};
	}

	if (config.method === 'manual') {
		const percent = config.manual?.percent ?? null;
		return {
			method: config.method,
			label: 'Manual progress',
			detail:
				config.manual?.note || (percent === null ? 'No update recorded' : 'Set manually'),
			percent,
			hasData: percent !== null,
			updated_at: config.updated_at
		};
	}

	if (config.method === 'metric') {
		const metric = config.metric;
		if (!metric || metric.start === metric.target) {
			return {
				method: config.method,
				label: metric?.label || 'Metric progress',
				detail: 'Metric needs a distinct start and target',
				percent: null,
				hasData: false,
				updated_at: config.updated_at
			};
		}

		const unit = metric.unit ? ` ${metric.unit}` : '';
		return {
			method: config.method,
			label: metric.label,
			detail: `${compactNumber(metric.current)}${unit} · target ${compactNumber(metric.target)}${unit}`,
			percent: clampPercent(
				((metric.current - metric.start) / (metric.target - metric.start)) * 100
			),
			hasData: true,
			updated_at: config.updated_at
		};
	}

	return {
		method: 'none',
		label: 'Tracking not set',
		detail: 'Choose milestones, tasks, a metric, or manual updates',
		percent: null,
		hasData: false,
		updated_at: null
	};
}
