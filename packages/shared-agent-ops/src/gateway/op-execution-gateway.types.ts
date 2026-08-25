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

/**
 * Port for task<->calendar event side-effect syncing. The concrete
 * implementation (TaskEventSyncService) lives in apps/web. When absent, task
 * side-effect syncing is skipped (other side-effects still run).
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

export type ToolExecutionContext = {
	admin: any;
	userId: string;
	callerId?: string;
	oauthGrantId?: string;
	projectScopeMode?: BuildosAgentProjectScopeMode;
	callSessionId?: string;
	scope: AgentCallScope;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
	/** Stable downstream key for handlers with domain-level idempotency. */
	downstreamIdempotencyKey?: string;
	/** Optional worker cancellation/deadline propagated to network-backed handlers. */
	signal?: AbortSignal;
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
