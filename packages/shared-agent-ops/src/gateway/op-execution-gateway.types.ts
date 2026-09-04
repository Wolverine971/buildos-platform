// packages/shared-agent-ops/src/gateway/op-execution-gateway.types.ts
//
// Public type surface for the gateway execution facade.
import type {
	AgentCallScope,
	BuildosAgentProjectScopeMode,
	BuildosAgentScopeMode,
	RegistryOp
} from '@buildos/shared-types';
import type { ActivityLogActorContext } from '../ops/async-activity-logger';

export type { RegistryOp } from '@buildos/shared-types';

/**
 * Port for calendar operations. The concrete implementation (CalendarExecutor)
 * lives in apps/web; the worker can supply its own. Methods mirror the executor
 * methods the calendar op handlers invoke.
 */
export interface CalendarPort {
	listCalendarEvents(args: any): Promise<unknown>;
	getCalendarEventDetails(args: any): Promise<unknown>;
	createCalendarEvent(args: any): Promise<unknown>;
	updateCalendarEvent(args: any): Promise<unknown>;
	deleteCalendarEvent(args: any): Promise<unknown>;
	getProjectCalendar(args: any): Promise<unknown>;
	setProjectCalendar(args: any): Promise<unknown>;
}

/** One task-derived calendar event, as reported back in a tool receipt. */
export interface TaskCalendarEventReceipt {
	id: string;
	title: string;
	start_at: string;
	end_at: string;
}

/**
 * What a task<->event sync actually did. Returned so tool receipts can report
 * real side effects instead of inferring them from the task row.
 */
export interface TaskEventSyncSummary {
	events: TaskCalendarEventReceipt[];
	removed_event_count: number;
}

/**
 * Port for task<->calendar event side-effect syncing. The concrete
 * implementation (TaskEventSyncService) lives in apps/web. When absent, task
 * side-effect syncing is skipped (other side-effects still run).
 *
 * The return value stays `unknown` because the port is pluggable; callers that
 * want the receipt narrow it with `asTaskEventSyncSummary`.
 */
export interface TaskSyncPort {
	syncTaskEvents(
		userId: string,
		actorId: string,
		task: any,
		options?: {
			activityLog?: {
				changeSource?: string;
				actorContext?: ActivityLogActorContext | undefined;
			};
		}
	): Promise<unknown>;
}

/** Narrow a TaskSyncPort return value to a summary, or null when unavailable. */
export function asTaskEventSyncSummary(value: unknown): TaskEventSyncSummary | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<TaskEventSyncSummary>;
	if (!Array.isArray(candidate.events)) return null;
	return {
		events: candidate.events.filter(
			(event): event is TaskCalendarEventReceipt =>
				!!event && typeof event === 'object' && typeof (event as any).id === 'string'
		),
		removed_event_count:
			typeof candidate.removed_event_count === 'number' ? candidate.removed_event_count : 0
	};
}

export type ToolExecutionContext = {
	admin: any;
	userId: string;
	callerId?: string;
	oauthGrantId?: string;
	projectScopeMode?: BuildosAgentProjectScopeMode;
	callSessionId?: string;
	/** Internal BuildOS chat session; never an external agent_call_sessions id. */
	chatSessionId?: string;
	scope: AgentCallScope;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
	/** Stable downstream key for handlers with domain-level idempotency. */
	downstreamIdempotencyKey?: string;
	/** Optional worker cancellation/deadline propagated to network-backed handlers. */
	signal?: AbortSignal;
	/**
	 * Pre-resolved IANA timezone for civil-date interpretation. When absent the
	 * gateway reads `users.timezone` lazily, only for date-only input.
	 */
	timezone?: string | null;
};

export type ExternalGatewayRegistryEntry = RegistryOp & {
	required_scope_mode: BuildosAgentScopeMode;
	handler: (
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>;
};

export type ExternalGatewayRegistry = {
	version: string;
	ops: Record<string, ExternalGatewayRegistryEntry>;
};
