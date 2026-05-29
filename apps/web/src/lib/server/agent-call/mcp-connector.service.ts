// apps/web/src/lib/server/agent-call/mcp-connector.service.ts
import { json } from '@sveltejs/kit';
import type { AgentCallScope, ExternalAgentCallerRecord } from '@buildos/shared-types';
import type { SecurityEventLogOptions } from '$lib/server/security-event-logger';
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mcpAuthChallengeHeaders(origin: string): Headers {
	return new Headers({
		'WWW-Authenticate': `Bearer resource_metadata="${protectedResourceMetadataUrl(origin)}", scope="buildos.read offline_access"`,
		'Cache-Control': 'no-store',
		'Access-Control-Allow-Origin': '*'
	});
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

function responseJson(body: unknown, status = 200): Response {
	return json(body, {
		status,
		headers: {
			'Cache-Control': 'no-store',
			'Access-Control-Allow-Origin': '*'
		}
	});
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

		case 'tools/list':
			return {
				tools: getPublicBuildosAgentTools(auth.scope).map(toMcpTool)
			};

		case 'tools/call': {
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
				toolName: readToolName(params.rawParams),
				arguments: readToolArguments(params.rawParams),
				securityEventOptions: params.securityEventOptions
			});
			const isError = result.ok === false || Boolean(result.error);
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(result, null, 2)
					}
				],
				structuredContent: result,
				...(isError ? { isError: true } : {})
			};
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
	let parsedBody: unknown;
	try {
		parsedBody = await params.request.json();
	} catch {
		return responseJson(jsonRpcError(null, -32700, 'Parse error'), 400);
	}

	if (Array.isArray(parsedBody)) {
		return responseJson(jsonRpcError(null, -32600, 'Batch requests are not supported'), 400);
	}

	let rpcRequest: JsonRpcRequest;
	try {
		rpcRequest = parseJsonRpcRequest(parsedBody);
	} catch (error) {
		return responseJson(
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
		return new Response(null, { status: 202 });
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
		return responseJson(jsonRpcResult(id, result));
	} catch (error) {
		if (error instanceof OAuthConnectorError && error.status === 401) {
			return new Response(JSON.stringify(jsonRpcError(id, -32001, error.description)), {
				status: 401,
				headers: {
					...Object.fromEntries(mcpAuthChallengeHeaders(params.url.origin)),
					'Content-Type': 'application/json'
				}
			});
		}

		if (error instanceof OAuthConnectorError && error.code === 'method_not_found') {
			return responseJson(jsonRpcError(id, -32601, error.description), 400);
		}

		if (error instanceof OAuthConnectorError) {
			return responseJson(jsonRpcError(id, -32003, error.description), error.status);
		}

		if (error instanceof Error) {
			return responseJson(jsonRpcError(id, -32602, error.message), 400);
		}

		return responseJson(jsonRpcError(id, -32603, 'BuildOS MCP request failed'), 500);
	}
}

export function handleBuildosMcpGet(url: URL): Response {
	return new Response(
		JSON.stringify({
			name: BUILDOS_CONNECTOR_PUBLIC_NAME,
			server: BUILDOS_MCP_SERVER_NAME,
			resource: mcpResourceUrl(url.origin),
			authorization: protectedResourceMetadataUrl(url.origin)
		}),
		{
			status: 401,
			headers: {
				...Object.fromEntries(mcpAuthChallengeHeaders(url.origin)),
				'Content-Type': 'application/json'
			}
		}
	);
}
