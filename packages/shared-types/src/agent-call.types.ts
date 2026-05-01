// packages/shared-types/src/agent-call.types.ts
export type BuildosAgentCallMethod = 'call.dial' | 'tools/list' | 'tools/call' | 'call.hangup';

export type UserBuildosAgentStatus = 'active' | 'paused' | 'revoked';
export type ExternalAgentCallerStatus = 'trusted' | 'pending' | 'revoked';
export type AgentCallSessionStatus = 'accepted' | 'rejected' | 'active' | 'ended';
export type AgentCallDirection = 'inbound' | 'outbound';
export type BuildosAgentDiscoveryToolName = 'skill_load' | 'tool_search' | 'tool_schema';
export type BuildosAgentGatewayToolName = BuildosAgentDiscoveryToolName;
export type BuildosAgentPublicToolName = string;
export type BuildosAgentScopeMode = 'read_only' | 'read_write';

export const BUILDOS_AGENT_READ_OPS = [
	'onto.project.list',
	'onto.project.search',
	'onto.project.get',
	'onto.project.graph.get',
	'onto.task.list',
	'onto.task.search',
	'onto.task.get',
	'onto.task.docs.list',
	'onto.document.list',
	'onto.document.search',
	'onto.document.get',
	'onto.document.tree.get',
	'onto.document.path.get',
	'onto.goal.list',
	'onto.goal.search',
	'onto.goal.get',
	'onto.plan.list',
	'onto.plan.search',
	'onto.plan.get',
	'onto.milestone.list',
	'onto.milestone.search',
	'onto.milestone.get',
	'onto.risk.list',
	'onto.risk.search',
	'onto.risk.get',
	'onto.entity.relationships.get',
	'onto.entity.links.get',
	'onto.search',
	'cal.event.list',
	'cal.event.get',
	'cal.project.get'
] as const;

export const BUILDOS_AGENT_WRITE_OPS = [
	'onto.task.create',
	'onto.task.update',
	'onto.task.docs.create_or_attach',
	'onto.document.create',
	'onto.document.update',
	'onto.document.tree.move',
	'onto.project.create',
	'onto.project.update',
	'onto.goal.create',
	'onto.goal.update',
	'onto.plan.create',
	'onto.plan.update',
	'onto.milestone.create',
	'onto.milestone.update',
	'onto.risk.create',
	'onto.risk.update',
	'onto.edge.link',
	'onto.edge.unlink',
	'cal.event.create',
	'cal.event.update',
	'cal.event.delete',
	'cal.project.set'
] as const;

export const BUILDOS_AGENT_SUPPORTED_OPS = [
	...BUILDOS_AGENT_READ_OPS,
	...BUILDOS_AGENT_WRITE_OPS
] as const;

/**
 * OpenClaw default bundle: "Author docs + tasks".
 * Applied automatically when an OpenClaw caller is provisioned (and, via auto-upgrade,
 * when an existing OpenClaw caller still carries the old narrow default).
 */
export const OPENCLAW_DEFAULT_WRITE_OPS = [
	'onto.task.create',
	'onto.task.update',
	'onto.document.create',
	'onto.document.update'
] as const satisfies readonly (typeof BUILDOS_AGENT_WRITE_OPS)[number][];

/**
 * The pre-expansion default bundle. Used by the auto-upgrade migration to detect
 * existing OpenClaw callers that still carry the old narrow scope and haven't been
 * further customized by the user.
 */
export const LEGACY_OPENCLAW_DEFAULT_WRITE_OPS = [
	'onto.task.create',
	'onto.task.update'
] as const satisfies readonly (typeof BUILDOS_AGENT_WRITE_OPS)[number][];

export type BuildosAgentReadOp = (typeof BUILDOS_AGENT_READ_OPS)[number];
export type BuildosAgentWriteOp = (typeof BUILDOS_AGENT_WRITE_OPS)[number];
export type BuildosAgentAllowedOp = (typeof BUILDOS_AGENT_SUPPORTED_OPS)[number];

export interface AgentCallScope {
	mode: BuildosAgentScopeMode;
	project_ids?: string[];
	allowed_ops?: BuildosAgentAllowedOp[];
}

export interface AgentCallerDescriptor {
	provider: string;
	caller_key: string;
}

export interface BuildosAgentDialParams {
	callee_handle: string;
	requested_scope?: AgentCallScope;
	client?: AgentCallerDescriptor;
}

export interface BuildosAgentHangupParams {
	call_id: string;
}

export interface BuildosAgentToolsListParams {
	call_id: string;
}

export interface BuildosAgentToolsCallParams {
	call_id: string;
	name: BuildosAgentPublicToolName;
	arguments?: Record<string, unknown>;
}

export interface BuildosAgentDialRequest {
	method: 'call.dial';
	params: BuildosAgentDialParams;
}

export interface BuildosAgentToolsListRequest {
	method: 'tools/list';
	params: BuildosAgentToolsListParams;
}

export interface BuildosAgentToolsCallRequest {
	method: 'tools/call';
	params: BuildosAgentToolsCallParams;
}

export interface BuildosAgentHangupRequest {
	method: 'call.hangup';
	params: BuildosAgentHangupParams;
}

export type BuildosAgentRequest =
	| BuildosAgentDialRequest
	| BuildosAgentToolsListRequest
	| BuildosAgentToolsCallRequest
	| BuildosAgentHangupRequest;

export interface BuildosAgentToolDefinition {
	name: BuildosAgentPublicToolName;
	description: string;
	inputSchema: Record<string, unknown>;
}

export interface BuildosAgentCallAcceptedResponse {
	call: {
		id: string;
		status: 'accepted';
		callee_handle: string;
		granted_scope: AgentCallScope;
	};
}

export interface BuildosAgentCallRejectedResponse {
	call: {
		id: string;
		status: 'rejected';
		reason: string;
		details?: Record<string, unknown>;
	};
}

export interface BuildosAgentToolsListResponse {
	tools: BuildosAgentToolDefinition[];
}

export interface BuildosAgentToolCallResponse {
	content: Array<{
		type: 'text';
		text: string;
	}>;
	structuredContent: Record<string, unknown>;
}

export interface BuildosAgentHangupResponse {
	call: {
		id: string;
		status: 'ended';
	};
}

export interface BuildosAgentErrorResponse {
	error: {
		code: number;
		message: string;
		data?: unknown;
	};
}

export interface BuildosAgentCallerProvisionRequest {
	provider: string;
	caller_key: string;
	scope_mode?: BuildosAgentScopeMode;
	allowed_ops?: BuildosAgentAllowedOp[];
	allowed_project_ids?: string[];
	metadata?: Record<string, unknown>;
}

export interface BuildosAgentCallerSummary {
	id: string;
	provider: string;
	caller_key: string;
	status: ExternalAgentCallerStatus;
	token_prefix: string;
	scope_mode: BuildosAgentScopeMode;
	allowed_ops?: BuildosAgentAllowedOp[];
	allowed_project_ids?: string[];
	unavailable_project_count?: number;
	metadata: Record<string, unknown>;
	last_used_at: string | null;
	created_at: string;
	updated_at: string;
	usage?: BuildosAgentCallerUsageSummary;
}

export interface BuildosAgentIdentitySummary {
	id: string;
	handle: string;
	status: UserBuildosAgentStatus;
}

export interface BuildosAgentAvailableProject {
	id: string;
	name: string;
	description: string | null;
}

export type BuildosAgentUsagePeriod = 'day' | 'week' | 'month';
export type BuildosAgentUsageAction =
	| 'created'
	| 'updated'
	| 'deleted'
	| 'attempted'
	| 'used';

export interface BuildosAgentUsageTrend {
	period: BuildosAgentUsagePeriod;
	session_count: number;
	tool_call_count?: number;
	write_count: number;
	successful_tool_call_count?: number;
	failed_tool_call_count?: number;
	successful_write_count: number;
	failed_write_count: number;
	project_count: number;
}

export interface BuildosAgentUsageEvent {
	id: string;
	occurred_at: string;
	op: string;
	action: BuildosAgentUsageAction;
	status: 'succeeded' | 'failed' | 'pending';
	summary: string;
	project_id?: string | null;
	project_name?: string | null;
	entity_kind?: string | null;
	entity_id?: string | null;
	entity_title?: string | null;
	error_message?: string | null;
}

export interface BuildosAgentCallerUsageSummary {
	last_activity_at: string | null;
	last_write_at: string | null;
	total_session_count: number;
	total_tool_call_count?: number;
	total_write_count: number;
	successful_tool_call_count?: number;
	failed_tool_call_count?: number;
	successful_write_count: number;
	failed_write_count: number;
	project_count: number;
	trends: BuildosAgentUsageTrend[];
	recent_activity: BuildosAgentUsageEvent[];
}

export type BuildosAgentUsageRangeKey = '7d' | '30d' | '90d';

export interface BuildosAgentUsageRange {
	key: BuildosAgentUsageRangeKey;
	days: number;
	start_at: string;
	end_at: string;
}

export interface BuildosAgentUsageTotals {
	session_count: number;
	active_session_count: number;
	ended_session_count: number;
	rejected_session_count: number;
	tool_call_count: number;
	successful_tool_call_count: number;
	failed_tool_call_count: number;
	write_count: number;
	successful_write_count: number;
	failed_write_count: number;
	error_count: number;
	denied_count: number;
	auth_failure_count: number;
	project_count: number;
	avg_session_duration_ms: number | null;
	avg_tool_latency_ms: number | null;
	last_activity_at: string | null;
	last_error_at: string | null;
}

export interface BuildosAgentUsageTimeBucket {
	date: string;
	session_count: number;
	tool_call_count: number;
	write_count: number;
	successful_tool_call_count: number;
	failed_tool_call_count: number;
	successful_write_count: number;
	failed_write_count: number;
	error_count: number;
	denied_count: number;
}

export interface BuildosAgentOperationBreakdown {
	op: string;
	tool_call_count: number;
	write_count: number;
	successful_count: number;
	failed_count: number;
	failure_rate: number;
	last_used_at: string | null;
}

export interface BuildosAgentProjectBreakdown {
	project_id: string | null;
	project_name: string | null;
	tool_call_count: number;
	write_count: number;
	successful_count: number;
	failed_count: number;
	last_activity_at: string | null;
}

export interface BuildosAgentUsageSession {
	id: string;
	status: AgentCallSessionStatus;
	started_at: string;
	ended_at: string | null;
	updated_at: string;
	duration_ms: number | null;
	requested_scope_mode: BuildosAgentScopeMode | null;
	granted_scope_mode: BuildosAgentScopeMode | null;
	write_count: number;
	tool_call_count: number;
	failed_tool_call_count: number;
	rejection_reason: string | null;
}

export interface BuildosAgentSecurityEventSummary {
	id: string;
	created_at: string;
	event_type: string;
	outcome: 'success' | 'failure' | 'blocked' | 'allowed' | 'denied' | 'info';
	severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
	reason: string | null;
	session_id: string | null;
	target_type: string | null;
	target_id: string | null;
	op: string | null;
	message: string;
}

export interface BuildosAgentCallerUsageDetailResponse {
	caller: BuildosAgentCallerSummary;
	range: BuildosAgentUsageRange;
	totals: BuildosAgentUsageTotals;
	time_series: BuildosAgentUsageTimeBucket[];
	operation_breakdown: BuildosAgentOperationBreakdown[];
	project_breakdown: BuildosAgentProjectBreakdown[];
	sessions: BuildosAgentUsageSession[];
	events: BuildosAgentUsageEvent[];
	security_events: BuildosAgentSecurityEventSummary[];
}

export interface BuildosAgentCallerBootstrapSummary {
	instructions_url: string;
	expires_at: string;
	paste_prompt: string;
}

export interface BuildosAgentCallerProvisionResponse {
	buildos_agent: BuildosAgentIdentitySummary;
	caller: BuildosAgentCallerSummary;
	credentials: {
		auth_scheme: 'Bearer';
		bearer_token: string;
	};
	bootstrap?: BuildosAgentCallerBootstrapSummary;
}

export interface BuildosAgentCallerListResponse {
	buildos_agent: BuildosAgentIdentitySummary;
	callers: BuildosAgentCallerSummary[];
	available_projects: BuildosAgentAvailableProject[];
}

export interface BuildosAgentCallerRevokeRequest {
	caller_id: string;
}

export interface BuildosAgentCallerRevokeResponse {
	caller: BuildosAgentCallerSummary;
}

export interface BuildosAgentBootstrapDocument {
	provider: string;
	instructions_version: 'openclaw_bootstrap_v1';
	expires_at: string;
	summary: string;
	buildos: {
		base_url: string;
		dial_url: string;
		auth_scheme: 'Bearer';
		agent_token: string;
		callee_handle: string;
		caller_key: string;
		scope_mode: BuildosAgentScopeMode;
		allowed_ops: BuildosAgentAllowedOp[];
	};
	openclaw: {
		env_block: string;
		storage_targets: string[];
		setup_steps: string[];
		follow_up_prompt: string;
	};
	gateway: {
		first_method: 'call.dial';
		next_methods: Array<'tools/list' | 'tools/call' | 'call.hangup'>;
	};
}

export interface UserBuildosAgentRecord {
	id: string;
	user_id: string;
	agent_handle: string;
	status: UserBuildosAgentStatus;
	default_policy: Record<string, unknown>;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface ExternalAgentCallerRecord {
	id: string;
	user_id: string;
	provider: string;
	caller_key: string;
	token_prefix: string;
	token_hash: string;
	status: ExternalAgentCallerStatus;
	policy: Record<string, unknown>;
	metadata: Record<string, unknown>;
	last_used_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface AgentCallSessionRecord {
	id: string;
	user_id: string;
	user_buildos_agent_id: string;
	external_agent_caller_id: string;
	direction: AgentCallDirection;
	status: AgentCallSessionStatus;
	requested_scope: Record<string, unknown>;
	granted_scope: Record<string, unknown>;
	rejection_reason: string | null;
	started_at: string;
	ended_at: string | null;
	metadata: Record<string, unknown>;
	updated_at: string;
}

export interface AgentCallBootstrapLinkRecord {
	id: string;
	user_id: string;
	external_agent_caller_id: string;
	setup_token_hash: string;
	payload: Record<string, unknown>;
	expires_at: string;
	last_accessed_at: string | null;
	created_at: string;
	updated_at: string;
}
