// apps/web/src/lib/server/cycles/cycle-schedule.ts
import type { CreateCycleTriggerInput, MaterializedCycleTriggerInput } from '@buildos/shared-types';
import { calculateNextCycleScheduleAt } from '@buildos/shared-utils';

export { calculateNextCycleScheduleAt };

/** Materialize scheduler-owned due times; request callers never supply them. */
export function materializeCycleTriggers(
	triggers: CreateCycleTriggerInput[],
	now = new Date()
): MaterializedCycleTriggerInput[] {
	return triggers.map((trigger) => ({
		...trigger,
		next_run_at:
			trigger.type === 'schedule' && (trigger.state ?? 'active') === 'active'
				? calculateNextCycleScheduleAt(trigger.schedule, now).toISOString()
				: null
	}));
}
