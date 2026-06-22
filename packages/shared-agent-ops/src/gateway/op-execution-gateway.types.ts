// packages/shared-agent-ops/src/gateway/op-execution-gateway.types.ts
//
// Public type surface for the gateway execution facade.
import type {
	AgentCallScope,
	BuildosAgentScopeMode
} from '@buildos/shared-types';
import type { ActivityLogActorContext } from '../ops/async-activity-logger';

/**
 * Structural mirror of the web tool registry's RegistryOp. The package must not
 * depend on `$lib/services/agentic-chat/tools/registry/tool-registry`, so this
 * carries exactly the fields op-execution + registry building read.
 */
export type RegistryOp = {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: Record<string, any>;
	group: 'onto' | 'util' | 'cal' | 'x';
	kind: 'read' | 'write';
	entity?: string;
	action?: string;
	contexts?: unknown[];
	chat_discoverable?: boolean;
};

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
	callSessionId?: string;
	scope: AgentCallScope;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
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
