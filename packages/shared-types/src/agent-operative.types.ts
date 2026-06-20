// packages/shared-types/src/agent-operative.types.ts
/**
 * Saved Operatives are reusable Agent Run definitions. They store the same brief
 * fields as `agent_runs`, plus optional daily/weekly schedule metadata.
 */

import type { Json } from './database.types';
import type {
	AgentRunContextType,
	AgentRunScopeMode,
	AgentRunTrigger
} from './agent-work.types';

export type AgentOperativeScheduleFrequency = 'daily' | 'weekly';

export interface AgentOperativeScheduleInput {
	enabled?: boolean;
	frequency?: AgentOperativeScheduleFrequency | null;
	time_of_day?: string | null;
	day_of_week?: number | null;
	timezone?: string | null;
}

export interface AgentOperativeInput {
	label?: string;
	goal: string;
	instructions?: string | null;
	expected_output?: string | null;
	context_type?: AgentRunContextType;
	project_id?: string | null;
	scope_mode?: AgentRunScopeMode;
	allowed_ops?: string[] | null;
	review?: boolean;
	budgets?: {
		wall_clock_ms?: number;
		max_tokens?: number;
		max_tool_calls?: number;
	};
	schedule?: AgentOperativeScheduleInput | null;
}

export interface AgentOperativeRunMetadata {
	operative_id: string;
	trigger: AgentRunTrigger;
	scheduled_for?: string | null;
}

export interface AgentOperativeRowShape {
	id: string;
	user_id: string;
	label: string;
	goal: string;
	instructions: string | null;
	expected_output: string | null;
	context_type: AgentRunContextType;
	project_id: string | null;
	scope_mode: AgentRunScopeMode;
	allowed_ops: string[] | null;
	review_required: boolean;
	budgets: Json;
	schedule_enabled: boolean;
	schedule_frequency: AgentOperativeScheduleFrequency | null;
	schedule_time_of_day: string | null;
	schedule_day_of_week: number | null;
	schedule_timezone: string;
	next_run_at: string | null;
	last_run_at: string | null;
	last_run_id: string | null;
	schedule_locked_at: string | null;
	schedule_error: string | null;
	created_at: string;
	updated_at: string;
}
