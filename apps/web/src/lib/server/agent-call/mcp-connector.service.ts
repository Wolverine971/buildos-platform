// apps/web/src/lib/server/agent-call/mcp-connector.service.ts
import { json } from '@sveltejs/kit';
import type { AgentCallScope, ExternalAgentCallerRecord } from '@buildos/shared-types';
import {
	getSecurityRequestContext,
	logSecurityEventAsync,
	type SecurityEventLogOptions
} from '$lib/server/security-event-logger';
import {
	authenticateOAuthMcpRequest,
	BUILDOS_CONNECTOR_PUBLIC_NAME,
	BUILDOS_MCP_SERVER_NAME,
	createMcpCallSession,
	mcpResourceUrl,
	OAuthConnectorError,
	protectedResourceMetadataUrl
} from './oauth-connector.service';
import { executeBuildosAgentGatewayTool } from './external-tool-gateway';
import { getPublicBuildosAgentTools } from './public-tool-registry';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import {
	extractAllowedOpsFromPolicy,
	extractScopeModeFromPolicy,
	isWriteOp,
	requiredScopeModeForOp
} from './agent-call-policy';
import { authenticateExternalAgentCaller, AgentCallAuthError } from './caller-auth';

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
	jsonrpc?: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: Record<string, unknown>;
};

type JsonRpcResponse = {
	jsonrpc: '2.0';
	id: JsonRpcId;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
};

const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * MCP-Protocol-Version values this server accepts. When the header is absent we
 * fall back to backwards-compatible behavior (MCP spec §Transports); when it is
 * present but unrecognized we reject with HTTP 400.
 */
const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

const MCP_CORS_ALLOW_HEADERS = 'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id';
const MCP_CORS_EXPOSE_HEADERS = 'WWW-Authenticate, MCP-Protocol-Version, Mcp-Session-Id';

/**
 * Browser origins permitted to make cross-origin MCP requests. `build-os.com`
 * and any `*.build-os.com` subdomain are allowed; localhost is allowed only when
 * the server itself is running on loopback (local dev). Requests with no `Origin`
 * header are server-side callers (Claude/OpenAI cloud connectors) and are always
 * permitted. This is the DNS-rebinding defense from the MCP security guidance.
 */
const MCP_ALLOWED_ORIGIN_EXACT = new Set(['https://build-os.com']);
const MCP_ALLOWED_ORIGIN_SUFFIX = '.build-os.com';

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoopbackHost(hostname: string): boolean {
	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '::1' ||
		hostname === '[::1]'
	);
}

export function isAllowedMcpOrigin(originHeader: string | null, serverOrigin: string): boolean {
	if (!originHeader) {
		// No browser Origin → non-browser/server-side caller. CORS does not apply.
		return true;
	}
	if (originHeader === serverOrigin) {
		return true;
	}
	if (MCP_ALLOWED_ORIGIN_EXACT.has(originHeader)) {
		return true;
	}

	let parsed: URL;
	try {
		parsed = new URL(originHeader);
	} catch {
		return false;
	}

	if (parsed.protocol === 'https:' && parsed.hostname.endsWith(MCP_ALLOWED_ORIGIN_SUFFIX)) {
		return true;
	}

	// Allow localhost browser clients (e.g. MCP Inspector) only in local dev,
	// inferred from the server's own origin being loopback.
	try {
		const server = new URL(serverOrigin);
		if (isLoopbackHost(server.hostname) && isLoopbackHost(parsed.hostname)) {
			return true;
		}
	} catch {
		/* fall through to deny */
	}

	return false;
}

/**
 * CORS headers for an MCP response. We echo the request `Origin` only when it is
 * allow-listed; disallowed or absent origins get no `Access-Control-Allow-Origin`
 * (browsers then block cross-origin reads). `Vary: Origin` keeps caches correct.
 */
function mcpCorsHeaders(originHeader: string | null, serverOrigin: string): Record<string, string> {
	const headers: Record<string, string> = { Vary: 'Origin' };
	if (originHeader && isAllowedMcpOrigin(originHeader, serverOrigin)) {
		headers['Access-Control-Allow-Origin'] = originHeader;
		headers['Access-Control-Expose-Headers'] = MCP_CORS_EXPOSE_HEADERS;
	}
	return headers;
}

function mcpAuthChallengeHeaders(
	serverOrigin: string,
	cors: Record<string, string>
): Record<string, string> {
	return {
		'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(serverOrigin)}", scope="buildos.read offline_access"`,
		'Cache-Control': 'no-store',
		...cors
	};
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
	return {
		jsonrpc: '2.0',
		id,
		result
	};
}

function jsonRpcError(
	id: JsonRpcId,
	code: number,
	message: string,
	data?: unknown
): JsonRpcResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: {
			code,
			message,
			...(data === undefined ? {} : { data })
		}
	};
}

function isJsonContentType(contentType: string | null): boolean {
	if (!contentType) return false;
	return contentType.toLowerCase().split(';')[0]?.trim() === 'application/json';
}

/**
 * Streamable HTTP clients must send `Accept: application/json, text/event-stream`.
 * We tolerate a missing header (many simple HTTP clients omit it) but reject an
 * Accept that explicitly excludes both JSON and SSE.
 */
function acceptsMcpResponse(accept: string | null): boolean {
	if (!accept) return true;
	const normalized = accept.toLowerCase();
	return (
		normalized.includes('application/json') ||
		normalized.includes('text/event-stream') ||
		normalized.includes('*/*')
	);
}

function isSupportedProtocolVersion(version: string | null): boolean {
	if (!version) return true;
	return SUPPORTED_MCP_PROTOCOL_VERSIONS.has(version.trim());
}

function logMcpTransportRejection(params: {
	request: Request;
	eventType: string;
	reason: string;
	severity: 'low' | 'medium';
	metadata?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): void {
	const context = getSecurityRequestContext(params.request);
	logSecurityEventAsync(
		{
			eventType: params.eventType,
			category: 'agent',
			outcome: 'blocked',
			severity: params.severity,
			actorType: 'anonymous',
			reason: params.reason,
			requestId: context.requestId,
			ipAddress: context.ipAddress,
			userAgent: context.userAgent,
			metadata: params.metadata ?? null
		},
		params.securityEventOptions ?? {}
	);
}

function inferToolOp(toolName: string): string {
	const registryEntry = getToolRegistry().byToolName[toolName];
	return registryEntry?.op ?? normalizeGatewayOpName(toolName);
}

function titleFromToolName(toolName: string): string {
	return toolName
		.split(/[_\-.]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function isDestructiveOp(op: string): boolean {
	return (
		op.includes('.delete') ||
		op.includes('.unlink') ||
		op.includes('.archive') ||
		op.includes('.move')
	);
}

function toMcpTool(tool: ReturnType<typeof getPublicBuildosAgentTools>[number]) {
	const op = inferToolOp(tool.name);
	const requiredScopeMode = requiredScopeModeForOp(op);
	const write = requiredScopeMode === 'read_write' || isWriteOp(op);
	const title = titleFromToolName(tool.name);

	return {
		name: tool.name,
		title,
		description: tool.description,
		inputSchema: tool.inputSchema,
		annotations: {
			title,
			readOnlyHint: !write,
			destructiveHint: write ? isDestructiveOp(op) : false,
			idempotentHint: !write,
			openWorldHint: false
		}
	};
}

function readToolName(params: unknown): string {
	if (!isRecord(params) || typeof params.name !== 'string' || !params.name.trim()) {
		throw new Error('tools/call params.name is required');
	}
	return params.name.trim();
}

function readToolArguments(params: unknown): Record<string, unknown> | undefined {
	if (!isRecord(params) || params.arguments === undefined) {
		return undefined;
	}
	if (!isRecord(params.arguments)) {
		throw new Error('tools/call params.arguments must be an object');
	}
	return params.arguments;
}

function scopeFromCallerPolicy(caller: ExternalAgentCallerRecord): AgentCallScope {
	const scopeMode = extractScopeModeFromPolicy(caller.policy);
	const allowedProjectIds = caller.policy?.allowed_project_ids;
	return {
		mode: scopeMode,
		allowed_ops: extractAllowedOpsFromPolicy(caller.policy, scopeMode),
		...(Array.isArray(allowedProjectIds)
			? {
					project_ids: allowedProjectIds.filter(
						(id: unknown): id is string => typeof id === 'string'
					)
				}
			: {})
	};
}

/**
 * Authenticate a remote MCP request, accepting either:
 *  - an OAuth access token (browser / cloud connectors that completed the OAuth
 *    consent flow), or
 *  - a static BuildOS agent key (`boca_...`) pasted into MCP config headers by
 *    local clients such as Claude Code, Codex, or any custom HTTP client.
 *
 * OAuth is tried first. If the token is not a known OAuth token (401), we fall
 * back to the static-key path. Either way the returned scope is enforced
 * identically downstream. An OAuth denial (403, e.g. revoked grant) is NOT
 * downgraded to the static path.
 */
async function authenticateBuildosMcpRequest(params: {
	admin: any;
	request: Request;
	url: URL;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<{ caller: ExternalAgentCallerRecord; scope: AgentCallScope }> {
	try {
		const oauth = await authenticateOAuthMcpRequest({
			admin: params.admin,
			request: params.request,
			resource: mcpResourceUrl(params.url.origin),
			securityEventOptions: params.securityEventOptions
		});
		return { caller: oauth.caller, scope: oauth.scope };
	} catch (oauthError) {
		// Only fall back for "unrecognized token" (401). Explicit OAuth denials
		// (403 insufficient_scope / revoked grant) must not be retried as a key.
		if (!(oauthError instanceof OAuthConnectorError) || oauthError.status !== 401) {
			throw oauthError;
		}

		try {
			const caller = await authenticateExternalAgentCaller(
				params.admin,
				params.request,
				params.securityEventOptions
			);
			return { caller, scope: scopeFromCallerPolicy(caller) };
		} catch (callerError) {
			// The static key also failed to authenticate. Surface the original OAuth
			// 401 so MCP clients still receive the WWW-Authenticate challenge and can
			// discover the OAuth flow.
			if (
				callerError instanceof AgentCallAuthError &&
				(callerError.status === 401 || callerError.status === 403)
			) {
				throw oauthError;
			}
			throw callerError;
		}
	}
}

// ---------------------------------------------------------------------------
// Phase 2: tool profiles + ChatGPT-style search/fetch compatibility surface.
// All of this lives in the connector layer: the bearer agent-call gateway is
// untouched, and search/fetch are thin read-only wrappers over existing tools.
// ---------------------------------------------------------------------------

type McpToolProfile = 'general' | 'chatgpt_data_app' | 'local_admin';

const DISCOVERY_TOOL_NAMES = new Set(['skill_load', 'tool_search', 'tool_schema']);

/**
 * The active tool profile, selected via `?profile=` on the connector URL — a
 * lightweight stand-in until OAuth-consent profile selection lands (spec Phase 4).
 * Unknown/absent → `general`.
 *  - general:          curated read/write tools per grant; no registry-discovery tools.
 *  - chatgpt_data_app: ONLY read-only `search`/`fetch`, even if the grant allows writes.
 *  - local_admin:      full grant surface including discovery tools (local/dev clients).
 */
function parseMcpProfile(url: URL): McpToolProfile {
	const raw = url.searchParams.get('profile');
	if (raw === 'chatgpt_data_app' || raw === 'local_admin') {
		return raw;
	}
	return 'general';
}

const MCP_SEARCH_FETCH_TOOLS = [
	{
		name: 'search',
		title: 'Search',
		description:
			'Search BuildOS projects, tasks, plans, goals, documents, milestones, and risks within the connected scope. Returns matching records with ids to pass to fetch.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['query'],
			properties: {
				query: { type: 'string', description: 'Free-text search query.' }
			}
		},
		annotations: {
			title: 'Search',
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		}
	},
	{
		name: 'fetch',
		title: 'Fetch',
		description:
			'Fetch the full scoped content of a single BuildOS record by id (the id returned by search, e.g. "task:<uuid>").',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: {
				id: {
					type: 'string',
					description: 'Record id from search results, formatted as "<type>:<uuid>".'
				}
			}
		},
		annotations: {
			title: 'Fetch',
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false
		}
	}
];

const MCP_FETCH_CONFIG: Record<string, { op: string; idArg: string; resultKey: string }> = {
	project: { op: 'onto.project.get', idArg: 'project_id', resultKey: 'project' },
	task: { op: 'onto.task.get', idArg: 'task_id', resultKey: 'task' },
	document: { op: 'onto.document.get', idArg: 'document_id', resultKey: 'document' },
	goal: { op: 'onto.goal.get', idArg: 'goal_id', resultKey: 'goal' },
	plan: { op: 'onto.plan.get', idArg: 'plan_id', resultKey: 'plan' },
	milestone: { op: 'onto.milestone.get', idArg: 'milestone_id', resultKey: 'milestone' },
	risk: { op: 'onto.risk.get', idArg: 'risk_id', resultKey: 'risk' }
};

/**
 * A read-only projection of a grant. search/fetch must never escalate to writes,
 * so we drop write ops while preserving the grant's project scoping and any
 * explicit op restrictions.
 */
function readOnlyScopeFrom(scope: AgentCallScope): AgentCallScope {
	const readOps = Array.isArray(scope.allowed_ops)
		? scope.allowed_ops.filter((op) => !isWriteOp(op))
		: undefined;
	return {
		mode: 'read_only',
		...(readOps ? { allowed_ops: readOps } : {}),
		...(Array.isArray(scope.project_ids) ? { project_ids: scope.project_ids } : {})
	};
}

function resolveGatewayToolName(op: string): string | undefined {
	return getToolRegistry().ops[op]?.tool_name;
}

function wrapMcpToolResult(result: Record<string, unknown>) {
	const isError = result.ok === false || Boolean(result.error);
	return {
		content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
		structuredContent: result,
		...(isError ? { isError: true } : {})
	};
}

async function runMcpSearch(params: {
	admin: any;
	caller: ExternalAgentCallerRecord;
	scope: AgentCallScope;
	origin: string;
	query: string;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	const searchToolName = resolveGatewayToolName('onto.search');
	if (!searchToolName) {
		return { ok: false, error: { code: 'INTERNAL', message: 'search is unavailable' } };
	}
	const readScope = readOnlyScopeFrom(params.scope);
	const callSessionId = await createMcpCallSession({
		admin: params.admin,
		caller: params.caller,
		scope: readScope
	});
	const result = await executeBuildosAgentGatewayTool({
		admin: params.admin,
		userId: params.caller.user_id,
		callerId: params.caller.id,
		callSessionId,
		scope: readScope,
		toolName: searchToolName,
		arguments: { query: params.query, limit: 20 },
		securityEventOptions: params.securityEventOptions
	});
	if (result.ok === false || result.error) {
		return result;
	}
	const rawResults = Array.isArray(result.results) ? result.results : [];
	const results = rawResults
		.filter((row): row is Record<string, unknown> => isRecord(row))
		.map((row) => ({
			id: `${String(row.type)}:${String(row.id)}`,
			title: typeof row.title === 'string' && row.title ? row.title : '(untitled)',
			url: `${params.origin}/projects/${String(row.project_id ?? '')}`,
			text: typeof row.snippet === 'string' ? row.snippet : ''
		}));
	return { results };
}

async function runMcpFetch(params: {
	admin: any;
	caller: ExternalAgentCallerRecord;
	scope: AgentCallScope;
	origin: string;
	id: string;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	const separator = params.id.indexOf(':');
	const type = separator === -1 ? '' : params.id.slice(0, separator);
	const entityId = separator === -1 ? '' : params.id.slice(separator + 1);
	const config = MCP_FETCH_CONFIG[type];
	if (!config || !entityId) {
		return {
			ok: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: `Unsupported fetch id "${params.id}". Expected "<type>:<uuid>".`
			}
		};
	}
	const toolName = resolveGatewayToolName(config.op);
	if (!toolName) {
		return { ok: false, error: { code: 'INTERNAL', message: 'fetch is unavailable' } };
	}
	const readScope = readOnlyScopeFrom(params.scope);
	const callSessionId = await createMcpCallSession({
		admin: params.admin,
		caller: params.caller,
		scope: readScope
	});
	const result = await executeBuildosAgentGatewayTool({
		admin: params.admin,
		userId: params.caller.user_id,
		callerId: params.caller.id,
		callSessionId,
		scope: readScope,
		toolName,
		arguments: { [config.idArg]: entityId },
		securityEventOptions: params.securityEventOptions
	});
	const entity = result[config.resultKey];
	if (!isRecord(entity)) {
		// Pass through the gateway's error/not-found shape unchanged.
		return result;
	}
	const title =
		(typeof entity.title === 'string' && entity.title) ||
		(typeof entity.name === 'string' && entity.name) ||
		'(untitled)';
	let text =
		typeof entity.content === 'string'
			? entity.content
			: typeof entity.description === 'string'
				? entity.description
				: '';
	// For a project fetch, lead with the START HERE orientation document so the
	// agent gets the "lay of the land" instead of just the one-line description.
	const startHere = isRecord(result.start_here) ? result.start_here : null;
	if (type === 'project' && startHere && typeof startHere.content === 'string') {
		text = text ? `${startHere.content}\n\n---\n\n${text}` : startHere.content;
	}
	return {
		id: params.id,
		title,
		text,
		url: `${params.origin}/projects/${String(entity.project_id ?? entityId)}`,
		metadata: {
			type,
			project_id: entity.project_id ?? null,
			type_key: entity.type_key ?? null,
			state_key: entity.state_key ?? null,
			updated_at: entity.updated_at ?? null
		}
	};
}

async function dispatchMcpMethod(params: {
	admin: any;
	request: Request;
	url: URL;
	method: string;
	rawParams: unknown;
	securityEventOptions?: SecurityEventLogOptions;
}) {
	const auth = await authenticateBuildosMcpRequest({
		admin: params.admin,
		request: params.request,
		url: params.url,
		securityEventOptions: params.securityEventOptions
	});

	switch (params.method) {
		case 'initialize':
			return {
				protocolVersion: MCP_PROTOCOL_VERSION,
				capabilities: {
					tools: {
						listChanged: false
					}
				},
				serverInfo: {
					name: 'buildos',
					title: BUILDOS_MCP_SERVER_NAME,
					version: '2026-05-13'
				},
				instructions:
					'Use BuildOS tools to read scoped project context. Write tools are available only when the user approved write access.'
			};

		case 'tools/list': {
			const profile = parseMcpProfile(params.url);
			if (profile === 'chatgpt_data_app') {
				return { tools: MCP_SEARCH_FETCH_TOOLS };
			}
			let tools = getPublicBuildosAgentTools(auth.scope);
			if (profile === 'general') {
				tools = tools.filter((tool) => !DISCOVERY_TOOL_NAMES.has(tool.name));
			}
			return { tools: tools.map(toMcpTool) };
		}

		case 'tools/call': {
			const profile = parseMcpProfile(params.url);
			const toolName = readToolName(params.rawParams);
			const toolArgs = readToolArguments(params.rawParams);
			const origin = params.url.origin;

			// The data profile is a hard read-only surface: only search/fetch are
			// callable, even if the underlying grant has write access.
			if (profile === 'chatgpt_data_app') {
				if (toolName === 'search') {
					return wrapMcpToolResult(
						await runMcpSearch({
							admin: params.admin,
							caller: auth.caller,
							scope: auth.scope,
							origin,
							query: typeof toolArgs?.query === 'string' ? toolArgs.query : '',
							securityEventOptions: params.securityEventOptions
						})
					);
				}
				if (toolName === 'fetch') {
					return wrapMcpToolResult(
						await runMcpFetch({
							admin: params.admin,
							caller: auth.caller,
							scope: auth.scope,
							origin,
							id: typeof toolArgs?.id === 'string' ? toolArgs.id : '',
							securityEventOptions: params.securityEventOptions
						})
					);
				}
				return wrapMcpToolResult({
					ok: false,
					error: {
						code: 'FORBIDDEN',
						message: `Tool "${toolName}" is not available in the data profile. Use search or fetch.`
					}
				});
			}

			const callSessionId = await createMcpCallSession({
				admin: params.admin,
				caller: auth.caller,
				scope: auth.scope
			});
			const result = await executeBuildosAgentGatewayTool({
				admin: params.admin,
				userId: auth.caller.user_id,
				callerId: auth.caller.id,
				callSessionId,
				scope: auth.scope,
				toolName,
				arguments: toolArgs,
				securityEventOptions: params.securityEventOptions
			});
			return wrapMcpToolResult(result);
		}

		default:
			throw new OAuthConnectorError(
				`Method not found: ${params.method}`,
				400,
				'method_not_found'
			);
	}
}

function parseJsonRpcRequest(body: unknown): JsonRpcRequest {
	if (!isRecord(body) || typeof body.method !== 'string') {
		throw new OAuthConnectorError('MCP request must include a method', 400, 'invalid_request');
	}

	return body as JsonRpcRequest;
}

export async function handleBuildosMcpPost(params: {
	admin: any;
	request: Request;
	url: URL;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Response> {
	const serverOrigin = params.url.origin;
	const originHeader = params.request.headers.get('origin');
	const cors = mcpCorsHeaders(originHeader, serverOrigin);

	const respond = (body: unknown, status = 200): Response =>
		json(body, { status, headers: { 'Cache-Control': 'no-store', ...cors } });

	// Transport guards run before auth and body parsing: cheap, and they keep a
	// DNS-rebinding attacker from reaching the auth/DB layer at all.
	if (!isAllowedMcpOrigin(originHeader, serverOrigin)) {
		logMcpTransportRejection({
			request: params.request,
			eventType: 'mcp_origin_rejected',
			reason: 'Disallowed browser Origin for MCP request',
			severity: 'medium',
			metadata: { origin: originHeader },
			securityEventOptions: params.securityEventOptions
		});
		return respond(jsonRpcError(null, -32600, 'Origin not allowed'), 403);
	}

	if (!isJsonContentType(params.request.headers.get('content-type'))) {
		logMcpTransportRejection({
			request: params.request,
			eventType: 'mcp_protocol_rejected',
			reason: 'Unsupported Content-Type for MCP POST',
			severity: 'low',
			securityEventOptions: params.securityEventOptions
		});
		return respond(jsonRpcError(null, -32600, 'Content-Type must be application/json'), 415);
	}

	if (!acceptsMcpResponse(params.request.headers.get('accept'))) {
		logMcpTransportRejection({
			request: params.request,
			eventType: 'mcp_protocol_rejected',
			reason: 'Accept header excludes application/json and text/event-stream',
			severity: 'low',
			securityEventOptions: params.securityEventOptions
		});
		return respond(jsonRpcError(null, -32600, 'Accept must include application/json'), 406);
	}

	const protocolVersion = params.request.headers.get('mcp-protocol-version');
	if (!isSupportedProtocolVersion(protocolVersion)) {
		logMcpTransportRejection({
			request: params.request,
			eventType: 'mcp_protocol_rejected',
			reason: 'Unsupported MCP-Protocol-Version',
			severity: 'low',
			metadata: { protocol_version: protocolVersion },
			securityEventOptions: params.securityEventOptions
		});
		return respond(
			jsonRpcError(null, -32600, `Unsupported MCP-Protocol-Version: ${protocolVersion}`),
			400
		);
	}

	let parsedBody: unknown;
	try {
		parsedBody = await params.request.json();
	} catch {
		return respond(jsonRpcError(null, -32700, 'Parse error'), 400);
	}

	if (Array.isArray(parsedBody)) {
		return respond(jsonRpcError(null, -32600, 'Batch requests are not supported'), 400);
	}

	let rpcRequest: JsonRpcRequest;
	try {
		rpcRequest = parseJsonRpcRequest(parsedBody);
	} catch (error) {
		return respond(
			jsonRpcError(
				null,
				-32600,
				error instanceof Error ? error.message : 'Invalid MCP request'
			),
			400
		);
	}

	const id = rpcRequest.id ?? null;
	if (rpcRequest.method === 'notifications/initialized' && rpcRequest.id === undefined) {
		return new Response(null, { status: 202, headers: cors });
	}

	try {
		const result = await dispatchMcpMethod({
			admin: params.admin,
			request: params.request,
			url: params.url,
			method: rpcRequest.method ?? '',
			rawParams: rpcRequest.params,
			securityEventOptions: params.securityEventOptions
		});
		return respond(jsonRpcResult(id, result));
	} catch (error) {
		if (error instanceof OAuthConnectorError && error.status === 401) {
			return new Response(JSON.stringify(jsonRpcError(id, -32001, error.description)), {
				status: 401,
				headers: {
					...mcpAuthChallengeHeaders(serverOrigin, cors),
					'Content-Type': 'application/json'
				}
			});
		}

		if (error instanceof OAuthConnectorError && error.code === 'method_not_found') {
			return respond(jsonRpcError(id, -32601, error.description), 400);
		}

		if (error instanceof OAuthConnectorError) {
			return respond(jsonRpcError(id, -32003, error.description), error.status);
		}

		if (error instanceof Error) {
			return respond(jsonRpcError(id, -32602, error.message), 400);
		}

		return respond(jsonRpcError(id, -32603, 'BuildOS MCP request failed'), 500);
	}
}

/**
 * GET on the MCP endpoint. Streamable HTTP allows GET only for server-to-client
 * SSE streaming, which v1 does not offer. So: unauthenticated GET returns the
 * OAuth challenge (with a discovery body); authenticated GET returns 405 because
 * there is no stream to open. v1 is stateless and emits no `Mcp-Session-Id`.
 */
export async function handleBuildosMcpGet(params: {
	admin: any;
	request: Request;
	url: URL;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Response> {
	const serverOrigin = params.url.origin;
	const originHeader = params.request.headers.get('origin');
	const cors = mcpCorsHeaders(originHeader, serverOrigin);

	if (!isAllowedMcpOrigin(originHeader, serverOrigin)) {
		logMcpTransportRejection({
			request: params.request,
			eventType: 'mcp_origin_rejected',
			reason: 'Disallowed browser Origin for MCP GET',
			severity: 'medium',
			metadata: { origin: originHeader },
			securityEventOptions: params.securityEventOptions
		});
		return json(jsonRpcError(null, -32600, 'Origin not allowed'), {
			status: 403,
			headers: { 'Cache-Control': 'no-store', ...cors }
		});
	}

	const unauthenticatedChallenge = (): Response =>
		new Response(
			JSON.stringify({
				name: BUILDOS_CONNECTOR_PUBLIC_NAME,
				server: BUILDOS_MCP_SERVER_NAME,
				resource: mcpResourceUrl(serverOrigin),
				authorization: protectedResourceMetadataUrl(serverOrigin)
			}),
			{
				status: 401,
				headers: {
					...mcpAuthChallengeHeaders(serverOrigin, cors),
					'Content-Type': 'application/json'
				}
			}
		);

	try {
		await authenticateBuildosMcpRequest({
			admin: params.admin,
			request: params.request,
			url: params.url,
			securityEventOptions: params.securityEventOptions
		});
	} catch (error) {
		if (error instanceof OAuthConnectorError && error.status === 401) {
			return unauthenticatedChallenge();
		}
		if (error instanceof OAuthConnectorError) {
			return json(jsonRpcError(null, -32003, error.description), {
				status: error.status,
				headers: { 'Cache-Control': 'no-store', ...cors }
			});
		}
		throw error;
	}

	// Authenticated, but no server-to-client stream is offered in v1.
	return new Response(null, {
		status: 405,
		headers: { 'Cache-Control': 'no-store', Allow: 'POST, OPTIONS', ...cors }
	});
}

export function handleBuildosMcpOptions(request: Request, url: URL): Response {
	const originHeader = request.headers.get('origin');
	return new Response(null, {
		status: 204,
		headers: {
			...mcpCorsHeaders(originHeader, url.origin),
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': MCP_CORS_ALLOW_HEADERS
		}
	});
}
