// apps/web/src/lib/server/admin-security-analysis.ts
type AdminSupabaseClient = {
	from: (table: string) => any;
};

export type SecurityTimeframe = '24h' | '7d' | '30d' | '90d' | 'all';
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type DataSourceStatus = {
	key: string;
	label: string;
	status: 'available' | 'empty' | 'error';
	rowCount: number;
	lastSeen: string | null;
	error: string | null;
};

export type SecurityFinding = {
	id: string;
	severity: SecuritySeverity;
	title: string;
	summary: string;
	evidence: string[];
	recommendation: string;
	source: string;
};

export type SecurityAnalysisPayload = {
	generatedAt: string;
	timeframe: SecurityTimeframe;
	rangeStart: string | null;
	rangeLabel: string;
	posture: {
		score: number;
		level: 'low' | 'moderate' | 'high' | 'critical';
		summary: string;
	};
	overview: {
		securityEventStream: number;
		authEvents: number;
		authFailures: number;
		agentSecurityEvents: number;
		agentDeniedEvents: number;
		securityEvents: number;
		blockedSecurityEvents: number;
		allowedFlaggedEvents: number;
		rateLimitEvents: number;
		recentErrors: number;
		unresolvedErrors: number;
		openCriticalErrors: number;
		securityAdjacentErrors: number;
		activeExternalCallers: number;
		activeAgentSessions: number;
		staleActiveAgentSessions: number;
		externalWriteFailures: number;
		sensitiveAccesses: number;
		sensitiveValueRequests: number;
		sensitiveValueExposures: number;
		calendarTokenRecords: number;
		staleCalendarTokenRecords: number;
		expiredCalendarWebhookChannels: number;
		activePushSubscriptions: number;
		failedWebhooks: number;
	};
	dataSources: DataSourceStatus[];
	findings: SecurityFinding[];
	securityEventStream: {
		total: number;
		authEvents: number;
		authFailures: number;
		agentEvents: number;
		agentDeniedEvents: number;
		accessEvents: number;
		detectionEvents: number;
		integrationEvents: number;
		byCategory: Array<{ label: string; count: number }>;
		byOutcome: Array<{ label: string; count: number }>;
		bySeverity: Array<{ label: string; count: number }>;
		byEventType: Array<{ label: string; count: number }>;
		recentEvents: Array<{
			id: string;
			createdAt: string;
			eventType: string;
			category: string;
			outcome: string;
			severity: string;
			actorType: string;
			actorUserId: string | null;
			externalAgentCallerId: string | null;
			targetType: string | null;
			targetId: string | null;
			requestId: string | null;
			sessionId: string | null;
			ipAddress: string | null;
			riskScore: number | null;
			reason: string | null;
			metadata: Record<string, unknown>;
		}>;
	};
	promptInjection: {
		total: number;
		blocked: number;
		detected: number;
		falsePositives: number;
		rateLimited: number;
		byEventType: Array<{ label: string; count: number }>;
		bySeverity: Array<{ label: string; count: number }>;
		topPatterns: Array<{ pattern: string; severity: string; category: string; count: number }>;
		recentEvents: Array<{
			id: string;
			createdAt: string;
			eventType: string;
			wasBlocked: boolean;
			userId: string;
			patterns: Array<{ pattern: string; severity: string; category: string }>;
			llmValidation: {
				isMalicious: boolean;
				confidence: string;
				shouldBlock: boolean;
				reason: string;
			} | null;
			metadata: Record<string, unknown>;
		}>;
	};
	errors: {
		total: number;
		unresolved: number;
		criticalOpen: number;
		securityAdjacent: number;
		byEndpoint: Array<{ endpoint: string; count: number }>;
		byType: Array<{ type: string; count: number }>;
		recentCritical: Array<{
			id: string;
			createdAt: string;
			severity: string;
			type: string;
			endpoint: string;
			resolved: boolean;
			message: string;
		}>;
		recentSecurityAdjacent: Array<{
			id: string;
			createdAt: string;
			severity: string;
			type: string;
			endpoint: string;
			resolved: boolean;
			message: string;
		}>;
	};
	externalAgents: {
		activeCallers: number;
		activeSessions: number;
		staleActiveSessions: number;
		writeExecutions: number;
		writeFailures: number;
		pendingWriteExecutions: number;
		callers: Array<{
			id: string;
			provider: string;
			callerKey: string;
			status: string;
			createdAt: string;
			lastUsedAt: string | null;
			policyProjectCount: number;
			policyMode: string;
		}>;
		sessions: Array<{
			id: string;
			startedAt: string;
			endedAt: string | null;
			status: string;
			direction: string;
			rejectionReason: string | null;
			scopeMode: string;
			allowedOpsCount: number;
			projectCount: number;
			isStale: boolean;
		}>;
		writes: Array<{
			id: string;
			createdAt: string;
			status: string;
			op: string;
			entityKind: string | null;
			error: string | null;
		}>;
	};
	sensitiveAccess: {
		total: number;
		profileAccesses: number;
		contactAccesses: number;
		sensitiveValueRequests: number;
		sensitiveValueExposures: number;
		recent: Array<{
			id: string;
			createdAt: string;
			source: 'profile' | 'contact';
			accessType: string;
			contextType: string | null;
			reason: string | null;
			actorId: string | null;
			userId: string;
			metadata: Record<string, unknown>;
		}>;
	};
	integrations: {
		calendarTokenRecords: number;
		staleCalendarTokenRecords: number;
		expiredCalendarTokenRecords: number;
		broadCalendarScopeRecords: number;
		calendarWebhookChannels: number;
		activeCalendarWebhookChannels: number;
		expiredCalendarWebhookChannels: number;
		pushSubscriptions: number;
		activePushSubscriptions: number;
		staleActivePushSubscriptions: number;
		webhookEvents: number;
		failedWebhooks: number;
		recentWebhookFailures: Array<{
			id: string;
			createdAt: string | null;
			eventType: string;
			status: string;
			attempts: number;
			error: string | null;
		}>;
	};
};

type QueryResult<T> = {
	rows: T[];
	count: number;
	source: DataSourceStatus;
};

const TIMEFRAME_LABELS: Record<SecurityTimeframe, string> = {
	'24h': 'Last 24 hours',
	'7d': 'Last 7 days',
	'30d': 'Last 30 days',
	'90d': 'Last 90 days',
	all: 'All time'
};

const TIMEFRAME_MS: Partial<Record<SecurityTimeframe, number>> = {
	'24h': 24 * 60 * 60 * 1000,
	'7d': 7 * 24 * 60 * 60 * 1000,
	'30d': 30 * 24 * 60 * 60 * 1000,
	'90d': 90 * 24 * 60 * 60 * 1000
};

const SOURCE_LABELS = {
	securityEvents: 'Security event stream',
	securityLogs: 'Prompt injection logs',
	errorLogs: 'Application error logs',
	unresolvedErrors: 'Unresolved application errors',
	openCriticalErrors: 'Open critical errors',
	agentCallSessions: 'External agent sessions',
	agentCallWrites: 'External agent write audit',
	externalCallers: 'External agent callers',
	profileAccessAudit: 'Profile access audit',
	contactAccessAudit: 'Contact access audit',
	calendarTokens: 'Google calendar token records',
	calendarWebhooks: 'Calendar webhook channels',
	pushSubscriptions: 'Push subscriptions',
	webhookEvents: 'Webhook event log',
	adminUsers: 'Admin user inventory'
} as const;

const SECURITY_ADJACENT_ERROR_PATTERN =
	/(auth|login|oauth|webhook|security|admin|agent-call|agent\/v2|permission|forbidden|unauthorized|token|calendar)/i;

export function parseSecurityTimeframe(value: string | null | undefined): SecurityTimeframe {
	if (
		value === '24h' ||
		value === '7d' ||
		value === '30d' ||
		value === '90d' ||
		value === 'all'
	) {
		return value;
	}

	return '30d';
}

export async function getAdminSecurityAnalysis(
	supabase: AdminSupabaseClient,
	timeframe: SecurityTimeframe = '30d'
): Promise<SecurityAnalysisPayload> {
	const generatedAt = new Date().toISOString();
	const rangeStart = getRangeStart(timeframe);

	const [
		securityEvents,
		securityLogs,
		errorLogs,
		unresolvedErrors,
		openCriticalErrors,
		agentSessions,
		agentWrites,
		externalCallers,
		profileAudit,
		contactAudit,
		calendarTokens,
		calendarWebhooks,
		pushSubscriptions,
		webhookEvents,
		adminUsers
	] = await Promise.all([
		trackQuery<SecurityEventRow>(SOURCE_LABELS.securityEvents, 'securityEvents', () =>
			withRange(
				supabase
					.from('security_events')
					.select(
						'id,created_at,event_type,category,outcome,severity,actor_type,actor_user_id,external_agent_caller_id,target_type,target_id,request_id,session_id,ip_address,risk_score,reason,metadata',
						{ count: 'exact' }
					),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(1000)
		),
		trackQuery<SecurityLogRow>(SOURCE_LABELS.securityLogs, 'securityLogs', () =>
			withRange(
				supabase
					.from('security_logs')
					.select(
						'id,created_at,event_type,user_id,was_blocked,regex_patterns,llm_validation,metadata',
						{ count: 'exact' }
					),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(1000)
		),
		trackQuery<ErrorLogRow>(SOURCE_LABELS.errorLogs, 'errorLogs', () =>
			withRange(
				supabase
					.from('error_logs')
					.select(
						'id,created_at,severity,error_type,endpoint,http_method,resolved,user_id,error_message',
						{ count: 'exact' }
					),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(500)
		),
		trackQuery<ErrorLogRow>(SOURCE_LABELS.unresolvedErrors, 'unresolvedErrors', () =>
			withRange(
				supabase
					.from('error_logs')
					.select('id,created_at,severity,error_type,endpoint,resolved,error_message', {
						count: 'exact'
					})
					.eq('resolved', false),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(50)
		),
		trackQuery<ErrorLogRow>(SOURCE_LABELS.openCriticalErrors, 'openCriticalErrors', () =>
			supabase
				.from('error_logs')
				.select('id,created_at,severity,error_type,endpoint,resolved,error_message', {
					count: 'exact'
				})
				.or('severity.eq.critical,severity.eq.high')
				.eq('resolved', false)
				.order('created_at', { ascending: false })
				.limit(50)
		),
		trackQuery<AgentCallSessionRow>(SOURCE_LABELS.agentCallSessions, 'agentCallSessions', () =>
			withRange(
				supabase
					.from('agent_call_sessions')
					.select(
						'id,started_at,ended_at,status,direction,rejection_reason,requested_scope,granted_scope,user_id,external_agent_caller_id',
						{ count: 'exact' }
					),
				'started_at',
				rangeStart
			)
				.order('started_at', { ascending: false })
				.limit(250)
		),
		trackQuery<AgentCallWriteRow>(SOURCE_LABELS.agentCallWrites, 'agentCallWrites', () =>
			withRange(
				supabase
					.from('agent_call_tool_executions')
					.select(
						'id,created_at,status,op,entity_kind,error_payload,user_id,external_agent_caller_id',
						{
							count: 'exact'
						}
					),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(250)
		),
		trackQuery<ExternalCallerRow>(SOURCE_LABELS.externalCallers, 'externalCallers', () =>
			supabase
				.from('external_agent_callers')
				.select(
					'id,created_at,last_used_at,status,provider,caller_key,user_id,metadata,policy',
					{
						count: 'exact'
					}
				)
				.order('last_used_at', { ascending: false, nullsFirst: false })
				.limit(250)
		),
		trackQuery<ProfileAccessAuditRow>(
			SOURCE_LABELS.profileAccessAudit,
			'profileAccessAudit',
			() =>
				withRange(
					supabase
						.from('profile_access_audit')
						.select(
							'id,created_at,access_type,context_type,reason,actor_id,profile_id,document_ids',
							{ count: 'exact' }
						),
					'created_at',
					rangeStart
				)
					.order('created_at', { ascending: false })
					.limit(250)
		),
		trackQuery<ContactAccessAuditRow>(
			SOURCE_LABELS.contactAccessAudit,
			'contactAccessAudit',
			() =>
				withRange(
					supabase
						.from('user_contact_access_audit')
						.select(
							'id,created_at,access_type,context_type,reason,user_id,actor_id,metadata',
							{
								count: 'exact'
							}
						),
					'created_at',
					rangeStart
				)
					.order('created_at', { ascending: false })
					.limit(250)
		),
		trackQuery<CalendarTokenRow>(SOURCE_LABELS.calendarTokens, 'calendarTokens', () =>
			supabase
				.from('user_calendar_tokens')
				.select('id,user_id,created_at,updated_at,expiry_date,scope,token_type', {
					count: 'exact'
				})
				.order('updated_at', { ascending: false, nullsFirst: false })
				.limit(500)
		),
		trackQuery<CalendarWebhookRow>(SOURCE_LABELS.calendarWebhooks, 'calendarWebhooks', () =>
			supabase
				.from('calendar_webhook_channels')
				.select('id,user_id,calendar_id,channel_id,created_at,updated_at,expiration', {
					count: 'exact'
				})
				.order('created_at', { ascending: false })
				.limit(500)
		),
		trackQuery<PushSubscriptionRow>(SOURCE_LABELS.pushSubscriptions, 'pushSubscriptions', () =>
			supabase
				.from('push_subscriptions')
				.select('id,user_id,created_at,last_used_at,is_active,user_agent', {
					count: 'exact'
				})
				.order('created_at', { ascending: false })
				.limit(500)
		),
		trackQuery<WebhookEventRow>(SOURCE_LABELS.webhookEvents, 'webhookEvents', () =>
			withRange(
				supabase
					.from('webhook_events')
					.select(
						'id,event_id,event_type,status,attempts,error_message,created_at,processed_at',
						{
							count: 'exact'
						}
					),
				'created_at',
				rangeStart
			)
				.order('created_at', { ascending: false })
				.limit(250)
		),
		trackQuery<AdminUserRow>(SOURCE_LABELS.adminUsers, 'adminUsers', () =>
			supabase
				.from('users')
				.select('id,created_at,updated_at,is_admin', { count: 'exact' })
				.eq('is_admin', true)
				.order('created_at', { ascending: false })
				.limit(100)
		)
	]);

	const dataSources = [
		securityEvents.source,
		securityLogs.source,
		errorLogs.source,
		unresolvedErrors.source,
		openCriticalErrors.source,
		agentSessions.source,
		agentWrites.source,
		externalCallers.source,
		profileAudit.source,
		contactAudit.source,
		calendarTokens.source,
		calendarWebhooks.source,
		pushSubscriptions.source,
		webhookEvents.source,
		adminUsers.source
	];

	const securityEventStream = analyzeSecurityEventStream(securityEvents);
	const promptInjection = analyzePromptInjection(securityLogs);
	const errors = analyzeErrors(errorLogs, unresolvedErrors, openCriticalErrors);
	const externalAgents = analyzeExternalAgents(agentSessions, agentWrites, externalCallers);
	const sensitiveAccess = analyzeSensitiveAccess(profileAudit, contactAudit);
	const integrations = analyzeIntegrations(
		calendarTokens,
		calendarWebhooks,
		pushSubscriptions,
		webhookEvents
	);

	const overview = {
		securityEventStream: securityEventStream.total,
		authEvents: securityEventStream.authEvents,
		authFailures: securityEventStream.authFailures,
		agentSecurityEvents: securityEventStream.agentEvents,
		agentDeniedEvents: securityEventStream.agentDeniedEvents,
		securityEvents: promptInjection.total,
		blockedSecurityEvents: promptInjection.blocked,
		allowedFlaggedEvents: promptInjection.detected,
		rateLimitEvents: promptInjection.rateLimited,
		recentErrors: errors.total,
		unresolvedErrors: errors.unresolved,
		openCriticalErrors: errors.criticalOpen,
		securityAdjacentErrors: errors.securityAdjacent,
		activeExternalCallers: externalAgents.activeCallers,
		activeAgentSessions: externalAgents.activeSessions,
		staleActiveAgentSessions: externalAgents.staleActiveSessions,
		externalWriteFailures: externalAgents.writeFailures,
		sensitiveAccesses: sensitiveAccess.total,
		sensitiveValueRequests: sensitiveAccess.sensitiveValueRequests,
		sensitiveValueExposures: sensitiveAccess.sensitiveValueExposures,
		calendarTokenRecords: integrations.calendarTokenRecords,
		staleCalendarTokenRecords: integrations.staleCalendarTokenRecords,
		expiredCalendarWebhookChannels: integrations.expiredCalendarWebhookChannels,
		activePushSubscriptions: integrations.activePushSubscriptions,
		failedWebhooks: integrations.failedWebhooks
	};

	const findings = buildFindings({
		overview,
		securityEventStream,
		promptInjection,
		errors,
		externalAgents,
		sensitiveAccess,
		integrations,
		dataSources
	});
	const posture = buildPosture(overview, findings);

	return {
		generatedAt,
		timeframe,
		rangeStart,
		rangeLabel: TIMEFRAME_LABELS[timeframe],
		posture,
		overview,
		dataSources,
		findings,
		securityEventStream,
		promptInjection,
		errors,
		externalAgents,
		sensitiveAccess,
		integrations
	};
}

function getRangeStart(timeframe: SecurityTimeframe): string | null {
	const ms = TIMEFRAME_MS[timeframe];
	if (!ms) return null;
	return new Date(Date.now() - ms).toISOString();
}

function withRange(query: any, column: string, rangeStart: string | null): any {
	return rangeStart ? query.gte(column, rangeStart) : query;
}

async function trackQuery<T>(
	label: string,
	key: string,
	buildQuery: () => PromiseLike<{
		data: T[] | null;
		error: { message?: string } | null;
		count: number | null;
	}>
): Promise<QueryResult<T>> {
	try {
		const { data, error, count } = await buildQuery();
		if (error) {
			return {
				rows: [],
				count: 0,
				source: {
					key,
					label,
					status: 'error',
					rowCount: 0,
					lastSeen: null,
					error: error.message ?? 'Unknown Supabase error'
				}
			};
		}

		const rows = Array.isArray(data) ? data : [];
		const rowCount = count ?? rows.length;
		return {
			rows,
			count: rowCount,
			source: {
				key,
				label,
				status: rowCount > 0 ? 'available' : 'empty',
				rowCount,
				lastSeen: mostRecentTimestamp(rows),
				error: null
			}
		};
	} catch (error) {
		return {
			rows: [],
			count: 0,
			source: {
				key,
				label,
				status: 'error',
				rowCount: 0,
				lastSeen: null,
				error: error instanceof Error ? error.message : 'Unknown query error'
			}
		};
	}
}

type SecurityEventRow = {
	id: string;
	created_at: string;
	event_type: string;
	category: string;
	outcome: string;
	severity: string;
	actor_type: string;
	actor_user_id: string | null;
	external_agent_caller_id: string | null;
	target_type: string | null;
	target_id: string | null;
	request_id: string | null;
	session_id: string | null;
	ip_address: string | null;
	risk_score: number | null;
	reason: string | null;
	metadata: unknown;
};

type SecurityLogRow = {
	id: string;
	created_at: string;
	event_type: string;
	user_id: string;
	was_blocked: boolean;
	regex_patterns: unknown;
	llm_validation: unknown;
	metadata: unknown;
};

type ErrorLogRow = {
	id: string;
	created_at: string;
	severity: string | null;
	error_type: string | null;
	endpoint: string | null;
	http_method?: string | null;
	resolved: boolean | null;
	user_id?: string | null;
	error_message: string;
};

type AgentCallSessionRow = {
	id: string;
	started_at: string;
	ended_at: string | null;
	status: string;
	direction: string;
	rejection_reason: string | null;
	requested_scope: unknown;
	granted_scope: unknown;
	user_id: string;
	external_agent_caller_id: string;
};

type AgentCallWriteRow = {
	id: string;
	created_at: string;
	status: string;
	op: string;
	entity_kind: string | null;
	error_payload: unknown;
	user_id: string;
	external_agent_caller_id: string;
};

type ExternalCallerRow = {
	id: string;
	created_at: string;
	last_used_at: string | null;
	status: string;
	provider: string;
	caller_key: string;
	user_id: string;
	metadata: unknown;
	policy: unknown;
};

type ProfileAccessAuditRow = {
	id: string;
	created_at: string;
	access_type: string;
	context_type: string | null;
	reason: string | null;
	actor_id: string | null;
	profile_id: string;
	document_ids: unknown;
};

type ContactAccessAuditRow = {
	id: string;
	created_at: string;
	access_type: string;
	context_type: string | null;
	reason: string | null;
	user_id: string;
	actor_id: string | null;
	metadata: unknown;
};

type CalendarTokenRow = {
	id: string;
	user_id: string;
	created_at: string | null;
	updated_at: string | null;
	expiry_date: number | null;
	scope: string | null;
	token_type: string | null;
};

type CalendarWebhookRow = {
	id: string;
	user_id: string;
	calendar_id: string | null;
	channel_id: string;
	created_at: string;
	updated_at: string;
	expiration: number;
};

type PushSubscriptionRow = {
	id: string;
	user_id: string;
	created_at: string | null;
	last_used_at: string | null;
	is_active: boolean | null;
	user_agent: string | null;
};

type WebhookEventRow = {
	id: string;
	event_id: string;
	event_type: string;
	status: string;
	attempts: number | null;
	error_message: string | null;
	created_at: string | null;
	processed_at: string | null;
};

type AdminUserRow = {
	id: string;
	created_at: string;
	updated_at: string;
	is_admin: boolean;
};

function analyzeSecurityEventStream(
	result: QueryResult<SecurityEventRow>
): SecurityAnalysisPayload['securityEventStream'] {
	const categoryCounts = new Map<string, number>();
	const outcomeCounts = new Map<string, number>();
	const severityCounts = new Map<string, number>();
	const eventTypeCounts = new Map<string, number>();

	let authEvents = 0;
	let authFailures = 0;
	let agentEvents = 0;
	let agentDeniedEvents = 0;
	let accessEvents = 0;
	let detectionEvents = 0;
	let integrationEvents = 0;

	for (const row of result.rows) {
		const category = row.category || 'unknown';
		const outcome = row.outcome || 'unknown';
		const severity = row.severity || 'unknown';
		const eventType = row.event_type || 'unknown';

		increment(categoryCounts, category);
		increment(outcomeCounts, outcome);
		increment(severityCounts, severity);
		increment(eventTypeCounts, eventType);

		if (category === 'auth') {
			authEvents += 1;
			if (outcome === 'failure' || outcome === 'denied' || outcome === 'blocked') {
				authFailures += 1;
			}
		}
		if (category === 'agent') {
			agentEvents += 1;
			if (outcome === 'denied' || outcome === 'blocked' || outcome === 'failure') {
				agentDeniedEvents += 1;
			}
		}
		if (category === 'access') accessEvents += 1;
		if (category === 'detection') detectionEvents += 1;
		if (category === 'integration') integrationEvents += 1;
	}

	return {
		total: result.count,
		authEvents,
		authFailures,
		agentEvents,
		agentDeniedEvents,
		accessEvents,
		detectionEvents,
		integrationEvents,
		byCategory: mapToSortedPairs(categoryCounts),
		byOutcome: mapToSortedPairs(outcomeCounts),
		bySeverity: mapToSortedPairs(severityCounts),
		byEventType: mapToSortedPairs(eventTypeCounts),
		recentEvents: result.rows.slice(0, 40).map((row) => ({
			id: row.id,
			createdAt: row.created_at,
			eventType: row.event_type,
			category: row.category,
			outcome: row.outcome,
			severity: row.severity,
			actorType: row.actor_type,
			actorUserId: row.actor_user_id,
			externalAgentCallerId: row.external_agent_caller_id,
			targetType: row.target_type,
			targetId: row.target_id,
			requestId: row.request_id,
			sessionId: row.session_id,
			ipAddress: row.ip_address,
			riskScore: row.risk_score,
			reason: truncate(row.reason, 240),
			metadata: sanitizeEventMetadata(row.metadata)
		}))
	};
}

function analyzePromptInjection(
	result: QueryResult<SecurityLogRow>
): SecurityAnalysisPayload['promptInjection'] {
	const eventTypeCounts = new Map<string, number>();
	const severityCounts = new Map<string, number>();
	const patternCounts = new Map<
		string,
		{ pattern: string; severity: string; category: string; count: number }
	>();

	let blocked = 0;
	let detected = 0;
	let falsePositives = 0;
	let rateLimited = 0;

	for (const row of result.rows) {
		increment(eventTypeCounts, row.event_type || 'unknown');
		if (row.was_blocked) blocked += 1;
		if (row.event_type === 'prompt_injection_detected') detected += 1;
		if (row.event_type === 'prompt_injection_false_positive') falsePositives += 1;
		if (row.event_type === 'rate_limit_exceeded') rateLimited += 1;

		for (const pattern of normalizePatterns(row.regex_patterns)) {
			increment(severityCounts, pattern.severity || 'unknown');
			const key = `${pattern.pattern}|${pattern.severity}|${pattern.category}`;
			const existing = patternCounts.get(key);
			if (existing) {
				existing.count += 1;
			} else {
				patternCounts.set(key, { ...pattern, count: 1 });
			}
		}
	}

	return {
		total: result.count,
		blocked,
		detected,
		falsePositives,
		rateLimited,
		byEventType: mapToSortedPairs(eventTypeCounts),
		bySeverity: mapToSortedPairs(severityCounts),
		topPatterns: Array.from(patternCounts.values())
			.sort((a, b) => b.count - a.count)
			.slice(0, 8),
		recentEvents: result.rows.slice(0, 20).map((row) => ({
			id: row.id,
			createdAt: row.created_at,
			eventType: row.event_type,
			wasBlocked: Boolean(row.was_blocked),
			userId: row.user_id,
			patterns: normalizePatterns(row.regex_patterns).map((pattern) => ({
				pattern: pattern.pattern,
				severity: pattern.severity,
				category: pattern.category
			})),
			llmValidation: normalizeLlmValidation(row.llm_validation),
			metadata: sanitizeMetadata(row.metadata)
		}))
	};
}

function analyzeErrors(
	result: QueryResult<ErrorLogRow>,
	unresolvedResult: QueryResult<ErrorLogRow>,
	openCritical: QueryResult<ErrorLogRow>
): SecurityAnalysisPayload['errors'] {
	const endpointCounts = new Map<string, number>();
	const typeCounts = new Map<string, number>();
	const securityAdjacentRows: ErrorLogRow[] = [];

	for (const row of result.rows) {
		increment(endpointCounts, row.endpoint || '(no endpoint)');
		increment(typeCounts, row.error_type || 'unknown');
		if (isSecurityAdjacentError(row)) {
			securityAdjacentRows.push(row);
		}
	}

	return {
		total: result.count,
		unresolved: unresolvedResult.count,
		criticalOpen: openCritical.count,
		securityAdjacent: securityAdjacentRows.length,
		byEndpoint: mapToSortedPairs(endpointCounts, 'endpoint').slice(0, 8),
		byType: mapToSortedPairs(typeCounts, 'type').slice(0, 8),
		recentCritical: openCritical.rows.slice(0, 10).map(formatErrorRow),
		recentSecurityAdjacent: securityAdjacentRows.slice(0, 10).map(formatErrorRow)
	};
}

function analyzeExternalAgents(
	sessionsResult: QueryResult<AgentCallSessionRow>,
	writesResult: QueryResult<AgentCallWriteRow>,
	callersResult: QueryResult<ExternalCallerRow>
): SecurityAnalysisPayload['externalAgents'] {
	const staleCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
	const activeCallers = callersResult.rows.filter((row) => isCallerActive(row.status)).length;
	const activeSessions = sessionsResult.rows.filter((row) => isAgentSessionActive(row)).length;
	const staleActiveSessions = sessionsResult.rows.filter(
		(row) => isAgentSessionActive(row) && toTime(row.started_at) < staleCutoff
	).length;
	const writeFailures = writesResult.rows.filter((row) => row.status === 'failed').length;
	const pendingWriteExecutions = writesResult.rows.filter(
		(row) => row.status === 'pending'
	).length;

	return {
		activeCallers,
		activeSessions,
		staleActiveSessions,
		writeExecutions: writesResult.count,
		writeFailures,
		pendingWriteExecutions,
		callers: callersResult.rows.slice(0, 20).map((row) => {
			const policy = asRecord(row.policy);
			const allowedProjects = asStringArray(policy.allowed_project_ids);
			return {
				id: row.id,
				provider: row.provider || 'unknown',
				callerKey: row.caller_key || 'unknown',
				status: row.status || 'unknown',
				createdAt: row.created_at,
				lastUsedAt: row.last_used_at,
				policyProjectCount: allowedProjects.length,
				policyMode: String(policy.mode ?? policy.scope_mode ?? 'configured')
			};
		}),
		sessions: sessionsResult.rows.slice(0, 20).map((row) => {
			const scope = asRecord(row.granted_scope);
			const projectIds = asStringArray(scope.project_ids);
			const allowedOps = asStringArray(scope.allowed_ops);
			return {
				id: row.id,
				startedAt: row.started_at,
				endedAt: row.ended_at,
				status: row.status,
				direction: row.direction,
				rejectionReason: row.rejection_reason,
				scopeMode: String(scope.mode ?? asRecord(row.requested_scope).mode ?? 'unknown'),
				allowedOpsCount: allowedOps.length,
				projectCount: projectIds.length,
				isStale: isAgentSessionActive(row) && toTime(row.started_at) < staleCutoff
			};
		}),
		writes: writesResult.rows.slice(0, 20).map((row) => ({
			id: row.id,
			createdAt: row.created_at,
			status: row.status,
			op: row.op,
			entityKind: row.entity_kind,
			error: truncate(extractError(row.error_payload), 160)
		}))
	};
}

function analyzeSensitiveAccess(
	profileResult: QueryResult<ProfileAccessAuditRow>,
	contactResult: QueryResult<ContactAccessAuditRow>
): SecurityAnalysisPayload['sensitiveAccess'] {
	const contactRows = contactResult.rows.map((row) => ({
		id: row.id,
		createdAt: row.created_at,
		source: 'contact' as const,
		accessType: row.access_type,
		contextType: row.context_type,
		reason: row.reason,
		actorId: row.actor_id,
		userId: row.user_id,
		metadata: sanitizeAccessMetadata(row.metadata)
	}));
	const profileRows = profileResult.rows.map((row) => ({
		id: row.id,
		createdAt: row.created_at,
		source: 'profile' as const,
		accessType: row.access_type,
		contextType: row.context_type,
		reason: row.reason,
		actorId: row.actor_id,
		userId: row.profile_id,
		metadata: {
			documentCount: Array.isArray(row.document_ids) ? row.document_ids.length : 0
		}
	}));
	const rows = [...contactRows, ...profileRows].sort(
		(a, b) => toTime(b.createdAt) - toTime(a.createdAt)
	);
	const sensitiveValueRequests = contactRows.filter((row) =>
		Boolean(row.metadata.requested_sensitive_values)
	).length;
	const sensitiveValueExposures = contactRows.filter((row) =>
		Boolean(row.metadata.exposed_sensitive_values)
	).length;

	return {
		total: profileResult.count + contactResult.count,
		profileAccesses: profileResult.count,
		contactAccesses: contactResult.count,
		sensitiveValueRequests,
		sensitiveValueExposures,
		recent: rows.slice(0, 20)
	};
}

function analyzeIntegrations(
	calendarTokens: QueryResult<CalendarTokenRow>,
	calendarWebhooks: QueryResult<CalendarWebhookRow>,
	pushSubscriptions: QueryResult<PushSubscriptionRow>,
	webhookEvents: QueryResult<WebhookEventRow>
): SecurityAnalysisPayload['integrations'] {
	const now = Date.now();
	const staleCutoff = now - 90 * 24 * 60 * 60 * 1000;
	const expiredCalendarTokenRecords = calendarTokens.rows.filter(
		(row) => typeof row.expiry_date === 'number' && row.expiry_date < now
	).length;
	const staleCalendarTokenRecords = calendarTokens.rows.filter((row) => {
		const lastUpdated = toTime(row.updated_at || row.created_at);
		return lastUpdated > 0 && lastUpdated < staleCutoff;
	}).length;
	const broadCalendarScopeRecords = calendarTokens.rows.filter((row) =>
		hasBroadCalendarScope(row.scope)
	).length;
	const activeCalendarWebhookChannels = calendarWebhooks.rows.filter(
		(row) => typeof row.expiration === 'number' && row.expiration > now
	).length;
	const expiredCalendarWebhookChannels = calendarWebhooks.rows.filter(
		(row) => typeof row.expiration === 'number' && row.expiration <= now
	).length;
	const activePushSubscriptions = pushSubscriptions.rows.filter(
		(row) => row.is_active === true
	).length;
	const staleActivePushSubscriptions = pushSubscriptions.rows.filter((row) => {
		if (row.is_active !== true) return false;
		const lastUsed = toTime(row.last_used_at || row.created_at);
		return lastUsed > 0 && lastUsed < staleCutoff;
	}).length;
	const failedWebhookRows = webhookEvents.rows.filter((row) => isFailedWebhook(row.status));

	return {
		calendarTokenRecords: calendarTokens.count,
		staleCalendarTokenRecords,
		expiredCalendarTokenRecords,
		broadCalendarScopeRecords,
		calendarWebhookChannels: calendarWebhooks.count,
		activeCalendarWebhookChannels,
		expiredCalendarWebhookChannels,
		pushSubscriptions: pushSubscriptions.count,
		activePushSubscriptions,
		staleActivePushSubscriptions,
		webhookEvents: webhookEvents.count,
		failedWebhooks: failedWebhookRows.length,
		recentWebhookFailures: failedWebhookRows.slice(0, 10).map((row) => ({
			id: row.id,
			createdAt: row.created_at,
			eventType: row.event_type,
			status: row.status,
			attempts: row.attempts ?? 0,
			error: truncate(row.error_message, 160)
		}))
	};
}

function buildFindings(input: {
	overview: SecurityAnalysisPayload['overview'];
	securityEventStream: SecurityAnalysisPayload['securityEventStream'];
	promptInjection: SecurityAnalysisPayload['promptInjection'];
	errors: SecurityAnalysisPayload['errors'];
	externalAgents: SecurityAnalysisPayload['externalAgents'];
	sensitiveAccess: SecurityAnalysisPayload['sensitiveAccess'];
	integrations: SecurityAnalysisPayload['integrations'];
	dataSources: DataSourceStatus[];
}): SecurityFinding[] {
	const findings: SecurityFinding[] = [];
	const add = (finding: SecurityFinding) => findings.push(finding);

	if (input.securityEventStream.authFailures >= 10) {
		add({
			id: 'elevated-auth-failures',
			severity: input.securityEventStream.authFailures >= 50 ? 'high' : 'medium',
			title: 'Authentication failures are elevated',
			summary: `${input.securityEventStream.authFailures} auth failure, denial, or blocked event(s) were recorded.`,
			evidence: input.securityEventStream.byEventType
				.filter((row) => row.label.startsWith('auth.'))
				.slice(0, 3)
				.map((row) => `${row.label}: ${row.count}`),
			recommendation:
				'Check login, OAuth, and password-reset failures by request context and verify abuse controls are rate-limiting repeated attempts.',
			source: SOURCE_LABELS.securityEvents
		});
	}

	if (input.securityEventStream.agentDeniedEvents > 0) {
		add({
			id: 'agent-denied-events',
			severity: 'medium',
			title: 'External agent activity was denied or failed',
			summary: `${input.securityEventStream.agentDeniedEvents} external-agent security event(s) were denied, blocked, or failed.`,
			evidence: input.securityEventStream.byEventType
				.filter((row) => row.label.startsWith('agent.'))
				.slice(0, 3)
				.map((row) => `${row.label}: ${row.count}`),
			recommendation:
				'Review denied BuildOS agent calls for invalid scopes, stale sessions, replay conflicts, and caller policies that need to be narrowed or rotated.',
			source: SOURCE_LABELS.securityEvents
		});
	}

	if (input.errors.criticalOpen > 0) {
		add({
			id: 'open-critical-errors',
			severity: 'high',
			title: 'Open critical errors need triage',
			summary: `${input.errors.criticalOpen} high or critical errors are still unresolved.`,
			evidence: input.errors.recentCritical
				.slice(0, 3)
				.map((row) => `${row.endpoint}: ${row.message}`),
			recommendation:
				'Start with the newest unresolved critical errors, resolve duplicates, and verify whether any expose sensitive data or bypass authorization checks.',
			source: SOURCE_LABELS.openCriticalErrors
		});
	}

	if (input.errors.securityAdjacent > 0) {
		add({
			id: 'security-adjacent-errors',
			severity: input.errors.securityAdjacent > 25 ? 'medium' : 'low',
			title: 'Security-adjacent endpoints are erroring',
			summary: `${input.errors.securityAdjacent} recent errors touched auth, admin, webhook, agent, token, permission, or calendar paths.`,
			evidence: input.errors.byEndpoint
				.slice(0, 3)
				.map((row) => `${row.endpoint}: ${row.count}`),
			recommendation:
				'Review the affected endpoints for failed authorization checks, token refresh failures, webhook validation problems, and noisy retries.',
			source: SOURCE_LABELS.errorLogs
		});
	}

	if (input.externalAgents.staleActiveSessions > 0) {
		add({
			id: 'stale-active-agent-sessions',
			severity: 'medium',
			title: 'External agent sessions are long-lived',
			summary: `${input.externalAgents.staleActiveSessions} active external agent session(s) have no end time and are older than 7 days.`,
			evidence: input.externalAgents.sessions
				.filter((session) => session.isStale)
				.slice(0, 3)
				.map(
					(session) =>
						`${session.scopeMode} session started ${formatDateOnly(session.startedAt)} with ${session.projectCount} project(s)`
				),
			recommendation:
				'Expire inactive external agent sessions and make the session lifecycle explicit so trusted callers do not stay active indefinitely.',
			source: SOURCE_LABELS.agentCallSessions
		});
	}

	const broadCaller = input.externalAgents.callers.find(
		(caller) => caller.policyProjectCount > 10
	);
	if (broadCaller) {
		add({
			id: 'broad-external-agent-scope',
			severity: 'medium',
			title: 'Trusted external agent has broad project scope',
			summary: `A trusted caller is scoped to ${broadCaller.policyProjectCount} project(s).`,
			evidence: [
				`${broadCaller.provider} caller ${broadCaller.callerKey} last used ${formatNullableDate(broadCaller.lastUsedAt)}`
			],
			recommendation:
				'Confirm this caller still needs access to every scoped project and rotate or narrow the caller policy when the workspace changes.',
			source: SOURCE_LABELS.externalCallers
		});
	}

	if (input.externalAgents.writeFailures > 0 || input.externalAgents.pendingWriteExecutions > 0) {
		add({
			id: 'external-agent-write-audit',
			severity: input.externalAgents.writeFailures > 0 ? 'medium' : 'low',
			title: 'External agent write audit needs review',
			summary: `${input.externalAgents.writeFailures} failed and ${input.externalAgents.pendingWriteExecutions} pending write execution(s) were recorded.`,
			evidence: input.externalAgents.writes
				.slice(0, 3)
				.map((row) => `${row.op}: ${row.status}`),
			recommendation:
				'Review failed writes for permission mismatches or replay conflicts and clear any stale pending idempotency records.',
			source: SOURCE_LABELS.agentCallWrites
		});
	}

	if (
		input.sensitiveAccess.sensitiveValueExposures > 0 ||
		input.sensitiveAccess.sensitiveValueRequests > 0
	) {
		add({
			id: 'sensitive-contact-access',
			severity: input.sensitiveAccess.sensitiveValueExposures > 0 ? 'high' : 'medium',
			title: 'Sensitive contact values were requested',
			summary: `${input.sensitiveAccess.sensitiveValueRequests} request(s), ${input.sensitiveAccess.sensitiveValueExposures} exposure(s).`,
			evidence: input.sensitiveAccess.recent
				.filter(
					(row) =>
						Boolean(row.metadata.requested_sensitive_values) ||
						Boolean(row.metadata.exposed_sensitive_values)
				)
				.slice(0, 3)
				.map(
					(row) =>
						`${row.contextType || 'unknown'} ${row.accessType} for ${row.reason || 'unspecified reason'}`
				),
			recommendation:
				'Validate that contact tools only expose sensitive values for explicit user-approved workflows and keep reasons mandatory.',
			source: SOURCE_LABELS.contactAccessAudit
		});
	}

	if (input.integrations.staleCalendarTokenRecords > 0) {
		add({
			id: 'stale-calendar-token-records',
			severity: 'medium',
			title: 'Stale calendar OAuth records remain stored',
			summary: `${input.integrations.staleCalendarTokenRecords} calendar token record(s) have not been updated in 90+ days.`,
			evidence: [
				`${input.integrations.calendarTokenRecords} total token record(s), ${input.integrations.broadCalendarScopeRecords} with broad calendar scopes`
			],
			recommendation:
				'Add a stale-token cleanup job or mark disconnected users so old refresh tokens are removed instead of retained indefinitely.',
			source: SOURCE_LABELS.calendarTokens
		});
	}

	if (input.integrations.expiredCalendarWebhookChannels > 0) {
		add({
			id: 'expired-calendar-webhooks',
			severity: 'medium',
			title: 'Expired calendar webhook channels are retained',
			summary: `${input.integrations.expiredCalendarWebhookChannels} calendar webhook channel record(s) are expired.`,
			evidence: [
				`${input.integrations.activeCalendarWebhookChannels} active and ${input.integrations.expiredCalendarWebhookChannels} expired channel(s)`
			],
			recommendation:
				'Renew active channels and delete expired channel records so webhook validation state reflects what Google can still call.',
			source: SOURCE_LABELS.calendarWebhooks
		});
	}

	if (input.integrations.staleActivePushSubscriptions > 0) {
		add({
			id: 'stale-active-push-subscriptions',
			severity: 'low',
			title: 'Active push subscriptions look stale',
			summary: `${input.integrations.staleActivePushSubscriptions} active push subscription(s) have not been used in 90+ days.`,
			evidence: [`${input.integrations.activePushSubscriptions} active push subscription(s)`],
			recommendation:
				'Deactivate stale push subscriptions after delivery failures or age-based checks to reduce retained browser endpoint keys.',
			source: SOURCE_LABELS.pushSubscriptions
		});
	}

	if (input.promptInjection.total === 0 && input.securityEventStream.detectionEvents === 0) {
		add({
			id: 'no-prompt-injection-events',
			severity: 'info',
			title: 'Prompt-injection log is empty for this range',
			summary:
				'No prompt-injection scanner events were recorded, so this page uses operational and access-control data for the main posture.',
			evidence: ['security_logs returned zero rows for the selected time period'],
			recommendation:
				'Confirm the detector still logs blocked, detected, false-positive, and rate-limit events when suspicious freeform input is submitted.',
			source: SOURCE_LABELS.securityLogs
		});
	}

	const securityEventSource = input.dataSources.find((source) => source.key === 'securityEvents');
	if (securityEventSource?.status === 'empty') {
		add({
			id: 'security-event-stream-empty',
			severity: 'info',
			title: 'Security event stream has no rows',
			summary:
				'The normalized security_events table is available, but no auth, agent, access, detection, or integration events were recorded for this range.',
			evidence: ['security_events returned zero rows for the selected time period'],
			recommendation:
				'Generate a login, logout, password-reset, prompt-injection, and BuildOS agent test event after deploying the migration to verify real-time coverage.',
			source: SOURCE_LABELS.securityEvents
		});
	}

	const failedSources = input.dataSources.filter((source) => source.status === 'error');
	if (failedSources.length > 0) {
		add({
			id: 'security-data-source-errors',
			severity: 'medium',
			title: 'Some security data sources failed to load',
			summary: `${failedSources.length} data source(s) could not be queried.`,
			evidence: failedSources.slice(0, 3).map((source) => `${source.label}: ${source.error}`),
			recommendation:
				'Fix data-source query failures before relying on the posture score. Missing audit data lowers confidence in this analysis.',
			source: 'Data coverage'
		});
	}

	if (findings.length === 0) {
		add({
			id: 'no-active-findings',
			severity: 'low',
			title: 'No active security findings in selected range',
			summary:
				'The available logs did not surface prompt-injection, external-agent, audit, webhook, or critical-error findings.',
			evidence: ['All queried data sources were empty or clean for the selected range.'],
			recommendation:
				'Keep the dashboard scheduled for regular review and verify test events appear in each audit source.',
			source: 'Computed analysis'
		});
	}

	return findings.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}

function buildPosture(
	overview: SecurityAnalysisPayload['overview'],
	findings: SecurityFinding[]
): SecurityAnalysisPayload['posture'] {
	let score = 100;

	score -= Math.min(Math.max(overview.authFailures - 10, 0) * 0.5, 12);
	score -= overview.agentDeniedEvents > 0 ? 10 : 0;
	score -= Math.min(overview.openCriticalErrors * 8, 24);
	score -= Math.min(overview.unresolvedErrors * 0.5, 10);
	score -= Math.min(overview.securityAdjacentErrors * 0.25, 8);
	score -= overview.staleActiveAgentSessions > 0 ? 12 : 0;
	score -= overview.activeAgentSessions > 0 ? 4 : 0;
	score -= overview.externalWriteFailures > 0 ? 10 : 0;
	score -= overview.sensitiveValueExposures > 0 ? 18 : 0;
	score -= overview.sensitiveValueRequests > 0 ? 8 : 0;
	score -= overview.staleCalendarTokenRecords > 0 ? 10 : 0;
	score -= overview.expiredCalendarWebhookChannels > 0 ? 8 : 0;
	score -= overview.failedWebhooks > 0 ? 6 : 0;
	score -= overview.rateLimitEvents > 0 ? 6 : 0;
	score -= overview.allowedFlaggedEvents > 0 ? 6 : 0;
	score -= findings.some((finding) => finding.id === 'security-data-source-errors') ? 20 : 0;

	score = Math.max(0, Math.min(100, Math.round(score)));

	const level =
		score >= 85 ? 'low' : score >= 70 ? 'moderate' : score >= 50 ? 'high' : 'critical';
	const topActionable = findings.find((finding) => finding.severity !== 'info') ?? findings[0];

	return {
		score,
		level,
		summary: topActionable?.title ?? 'No active findings'
	};
}

function normalizePatterns(
	value: unknown
): Array<{ pattern: string; severity: string; category: string }> {
	if (!Array.isArray(value)) return [];
	return value.map((item) => {
		const record = asRecord(item);
		return {
			pattern: String(record.pattern ?? 'Unknown pattern'),
			severity: String(record.severity ?? 'unknown'),
			category: String(record.category ?? 'unknown')
		};
	});
}

function normalizeLlmValidation(
	value: unknown
): SecurityAnalysisPayload['promptInjection']['recentEvents'][number]['llmValidation'] {
	const record = asRecord(value);
	if (Object.keys(record).length === 0) return null;

	return {
		isMalicious: Boolean(record.isMalicious),
		confidence: String(record.confidence ?? 'unknown'),
		shouldBlock: Boolean(record.shouldBlock),
		reason: truncate(String(record.reason ?? 'No reason recorded'), 240) ?? 'No reason recorded'
	};
}

function sanitizeEventMetadata(value: unknown): Record<string, unknown> {
	const record = asRecord(value);
	return Object.entries(record)
		.slice(0, 40)
		.reduce<Record<string, unknown>>((output, [key, nestedValue]) => {
			if (shouldHideMetadataKey(key)) {
				output[key] = '[redacted]';
				return output;
			}
			output[key] = sanitizeEventMetadataValue(nestedValue, 0);
			return output;
		}, {});
}

function sanitizeEventMetadataValue(value: unknown, depth: number): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return truncate(value, 180);
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (Array.isArray(value)) {
		if (depth > 2) return '[truncated]';
		return value.slice(0, 12).map((entry) => sanitizeEventMetadataValue(entry, depth + 1));
	}
	if (typeof value === 'object') {
		if (depth > 2) return '[truncated]';
		return Object.entries(value as Record<string, unknown>)
			.slice(0, 20)
			.reduce<Record<string, unknown>>((output, [key, nestedValue]) => {
				output[key] = shouldHideMetadataKey(key)
					? '[redacted]'
					: sanitizeEventMetadataValue(nestedValue, depth + 1);
				return output;
			}, {});
	}

	return String(value);
}

function shouldHideMetadataKey(key: string): boolean {
	if (
		key === 'emailDomain' ||
		key === 'email_domain' ||
		key === 'contentLength' ||
		key === 'idempotencyKeyPresent'
	) {
		return false;
	}
	return /(password|token|secret|authorization|cookie|otp|hash|raw|content|body|prompt|authorization[_-]?code|oauth[_-]?code|code[_-]?verifier|code[_-]?challenge)/i.test(
		key
	);
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
	const record = asRecord(value);
	const allowedKeys = [
		'source',
		'route',
		'operation',
		'attemptsInWindow',
		'rateLimit',
		'contentLength',
		'validationMode'
	];
	return pickKeys(record, allowedKeys);
}

function sanitizeAccessMetadata(value: unknown): Record<string, unknown> {
	const record = asRecord(value);
	const allowedKeys = [
		'count',
		'returned_count',
		'include_methods',
		'include_archived',
		'requested_sensitive_values',
		'exposed_sensitive_values',
		'method_type'
	];
	return pickKeys(record, allowedKeys);
}

function pickKeys(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
	return keys.reduce<Record<string, unknown>>((output, key) => {
		if (key in record) output[key] = record[key];
		return output;
	}, {});
}

function formatErrorRow(
	row: ErrorLogRow
): SecurityAnalysisPayload['errors']['recentCritical'][number] {
	return {
		id: row.id,
		createdAt: row.created_at,
		severity: row.severity || 'unknown',
		type: row.error_type || 'unknown',
		endpoint: row.endpoint || '(no endpoint)',
		resolved: Boolean(row.resolved),
		message: truncate(stripHtml(row.error_message), 180) ?? 'No message recorded'
	};
}

function isSecurityAdjacentError(row: ErrorLogRow): boolean {
	return SECURITY_ADJACENT_ERROR_PATTERN.test(
		[row.endpoint, row.error_type, row.error_message].filter(Boolean).join(' ')
	);
}

function isCallerActive(status: string): boolean {
	return !['disabled', 'revoked', 'deleted', 'inactive'].includes(
		String(status || '').toLowerCase()
	);
}

function isAgentSessionActive(row: AgentCallSessionRow): boolean {
	return row.status === 'active' && !row.ended_at;
}

function isFailedWebhook(status: string): boolean {
	return ['failed', 'error', 'retrying'].includes(String(status || '').toLowerCase());
}

function hasBroadCalendarScope(scope: string | null): boolean {
	if (!scope) return false;
	return scope.split(/\s+/).some((entry) => {
		const normalized = entry.trim();
		return (
			normalized === 'https://www.googleapis.com/auth/calendar' ||
			normalized === 'https://www.googleapis.com/auth/calendar.events'
		);
	});
}

function extractError(value: unknown): string | null {
	const record = asRecord(value);
	if (Object.keys(record).length === 0) return null;
	return String(record.message ?? record.error ?? record.code ?? JSON.stringify(record));
}

function mostRecentTimestamp(rows: unknown[]): string | null {
	const timestamps = rows
		.flatMap((row) => {
			const record = asRecord(row);
			return [
				record.created_at,
				record.started_at,
				record.updated_at,
				record.last_used_at,
				record.processed_at
			];
		})
		.map((value) => (typeof value === 'string' ? value : null))
		.filter((value): value is string => Boolean(value))
		.sort((a, b) => toTime(b) - toTime(a));

	return timestamps[0] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return {};
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

function increment(map: Map<string, number>, key: string): void {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function mapToSortedPairs<K extends string = 'label'>(
	map: Map<string, number>,
	keyName: K = 'label' as K
): Array<Record<K, string> & { count: number }> {
	return Array.from(map.entries())
		.map(
			([label, count]) =>
				({ [keyName]: label, count }) as Record<K, string> & { count: number }
		)
		.sort((a, b) => Number(b.count) - Number(a.count));
}

function severityWeight(severity: SecuritySeverity): number {
	switch (severity) {
		case 'critical':
			return 5;
		case 'high':
			return 4;
		case 'medium':
			return 3;
		case 'low':
			return 2;
		case 'info':
		default:
			return 1;
	}
}

function stripHtml(value: string): string {
	return value
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function truncate(value: string | null | undefined, maxLength: number): string | null {
	if (!value) return null;
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function toTime(value: string | null | undefined): number {
	if (!value) return 0;
	const time = new Date(value).getTime();
	return Number.isFinite(time) ? time : 0;
}

function formatDateOnly(value: string): string {
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	}).format(new Date(value));
}

function formatNullableDate(value: string | null): string {
	if (!value) return 'never';
	return formatDateOnly(value);
}
