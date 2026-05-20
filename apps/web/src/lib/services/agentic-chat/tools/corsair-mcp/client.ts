// apps/web/src/lib/services/agentic-chat/tools/corsair-mcp/client.ts
import { env } from '$env/dynamic/private';

export const CORSAIR_MCP_ENABLED_ENV = 'CORSAIR_MCP_ENABLED';
export const CORSAIR_MCP_URL_ENV = 'CORSAIR_MCP_URL';
export const CORSAIR_MCP_ACCESS_TOKEN_ENV = 'CORSAIR_MCP_ACCESS_TOKEN';
export const CORSAIR_MCP_TIMEOUT_MS_ENV = 'CORSAIR_MCP_TIMEOUT_MS';
export const CORSAIR_MCP_PROTOCOL_VERSION_ENV = 'CORSAIR_MCP_PROTOCOL_VERSION';

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

type EnvLike = Record<string, string | undefined>;
type JsonRpcId = string | number;

export interface CorsairMcpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
	annotations?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ListCorsairMcpToolsResult {
	status: 'ok' | 'configuration_error' | 'auth_required' | 'error';
	tools: CorsairMcpTool[];
	message?: string;
	code?: string;
	auth?: CorsairMcpAuthMetadata;
	server?: unknown;
}

export interface CallCorsairMcpToolArgs {
	name: string;
	arguments?: Record<string, unknown>;
	reason?: string;
}

export interface CallCorsairMcpToolResult {
	status: 'ok' | 'configuration_error' | 'auth_required' | 'error';
	tool_name: string;
	result?: unknown;
	message?: string;
	code?: string;
	auth?: CorsairMcpAuthMetadata;
}

export interface CorsairMcpAuthMetadata {
	resourceMetadataUrl?: string;
	resource?: string;
	authorizationServers?: string[];
	wwwAuthenticate?: string;
}

interface CorsairMcpOptions {
	env?: EnvLike;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
}

interface CorsairMcpConfig {
	enabled: boolean;
	url?: string;
	accessToken?: string;
	timeoutMs: number;
	protocolVersion: string;
}

interface JsonRpcResponse {
	jsonrpc?: '2.0';
	id?: JsonRpcId | null;
	result?: unknown;
	error?: {
		code?: number;
		message?: string;
		data?: unknown;
	};
}

class CorsairMcpClientError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly auth?: CorsairMcpAuthMetadata
	) {
		super(message);
		this.name = 'CorsairMcpClientError';
	}
}

function normalizeOptionalString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(source: EnvLike = env, timeoutOverride?: number): CorsairMcpConfig {
	const url = normalizeOptionalString(source[CORSAIR_MCP_URL_ENV]);
	const enabled = parseBoolean(source[CORSAIR_MCP_ENABLED_ENV], Boolean(url));
	const timeoutMs =
		timeoutOverride ?? parsePositiveInt(source[CORSAIR_MCP_TIMEOUT_MS_ENV], DEFAULT_TIMEOUT_MS);
	const protocolVersion =
		normalizeOptionalString(source[CORSAIR_MCP_PROTOCOL_VERSION_ENV]) ??
		DEFAULT_PROTOCOL_VERSION;

	return {
		enabled,
		url,
		accessToken: normalizeOptionalString(source[CORSAIR_MCP_ACCESS_TOKEN_ENV]),
		timeoutMs,
		protocolVersion
	};
}

function validateUrl(value: string | undefined): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
		return parsed.toString();
	} catch {
		return null;
	}
}

function authMetadataFromHeaders(headers: Headers): CorsairMcpAuthMetadata | undefined {
	const wwwAuthenticate = headers.get('www-authenticate') ?? undefined;
	if (!wwwAuthenticate) return undefined;

	const resourceMetadataUrl = wwwAuthenticate.match(/resource_metadata="([^"]+)"/i)?.[1];
	return {
		wwwAuthenticate,
		...(resourceMetadataUrl ? { resourceMetadataUrl } : {})
	};
}

async function loadProtectedResourceMetadata(
	auth: CorsairMcpAuthMetadata | undefined,
	fetchFn: typeof fetch,
	timeoutMs: number
): Promise<CorsairMcpAuthMetadata | undefined> {
	if (!auth?.resourceMetadataUrl) return auth;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchFn(auth.resourceMetadataUrl, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal: controller.signal
		});
		if (!response.ok) return auth;
		const body = await response.json().catch(() => null);
		if (!body || typeof body !== 'object') return auth;
		const record = body as Record<string, unknown>;
		const authorizationServers = Array.isArray(record.authorization_servers)
			? record.authorization_servers.filter(
					(item): item is string => typeof item === 'string'
				)
			: undefined;
		return {
			...auth,
			resource: typeof record.resource === 'string' ? record.resource : auth.resource,
			authorizationServers
		};
	} catch {
		return auth;
	} finally {
		clearTimeout(timeout);
	}
}

function parseEventStreamBody(body: string): unknown {
	const dataLines: string[] = [];
	for (const line of body.split(/\r?\n/)) {
		if (!line.startsWith('data:')) continue;
		const data = line.slice('data:'.length).trim();
		if (!data || data === '[DONE]') continue;
		dataLines.push(data);
	}

	for (const data of dataLines) {
		try {
			return JSON.parse(data);
		} catch {
			continue;
		}
	}

	throw new CorsairMcpClientError(
		'Corsair MCP returned an unreadable event stream.',
		'MCP_SSE_PARSE_FAILED'
	);
}

async function parseMcpResponse(response: Response): Promise<JsonRpcResponse> {
	const contentType = response.headers.get('content-type') ?? '';
	if (contentType.includes('text/event-stream')) {
		const parsed = parseEventStreamBody(await response.text());
		return parsed as JsonRpcResponse;
	}

	const text = await response.text();
	if (!text.trim()) return {};

	try {
		return JSON.parse(text) as JsonRpcResponse;
	} catch {
		throw new CorsairMcpClientError('Corsair MCP returned invalid JSON.', 'MCP_INVALID_JSON');
	}
}

async function postJsonRpc(params: {
	url: string;
	method: string;
	rpcParams?: Record<string, unknown>;
	config: CorsairMcpConfig;
	fetchFn: typeof fetch;
	sessionId?: string;
}): Promise<{ body: JsonRpcResponse; sessionId?: string }> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), params.config.timeoutMs);
	const id = `corsair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const headers: Record<string, string> = {
		Accept: 'application/json, text/event-stream',
		'Content-Type': 'application/json',
		'MCP-Protocol-Version': params.config.protocolVersion
	};

	if (params.config.accessToken) {
		headers.Authorization = `Bearer ${params.config.accessToken}`;
	}
	if (params.sessionId) {
		headers['mcp-session-id'] = params.sessionId;
	}

	try {
		const response = await params.fetchFn(params.url, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id,
				method: params.method,
				...(params.rpcParams ? { params: params.rpcParams } : {})
			}),
			signal: controller.signal
		});

		const nextSessionId = response.headers.get('mcp-session-id') ?? params.sessionId;
		if (response.status === 401) {
			const auth = await loadProtectedResourceMetadata(
				authMetadataFromHeaders(response.headers),
				params.fetchFn,
				params.config.timeoutMs
			);
			throw new CorsairMcpClientError(
				'Corsair MCP requires OAuth/Bearer authentication. Configure CORSAIR_MCP_ACCESS_TOKEN for server-side chat tool calls.',
				'MCP_AUTH_REQUIRED',
				auth
			);
		}

		const body = await parseMcpResponse(response);
		if (!response.ok) {
			throw new CorsairMcpClientError(
				`Corsair MCP request failed with HTTP ${response.status}.`,
				'MCP_HTTP_ERROR'
			);
		}
		if (body.error) {
			throw new CorsairMcpClientError(
				body.error.message ?? 'Corsair MCP returned a JSON-RPC error.',
				'MCP_JSON_RPC_ERROR'
			);
		}

		return {
			body,
			...(nextSessionId ? { sessionId: nextSessionId } : {})
		};
	} catch (error) {
		if (error instanceof CorsairMcpClientError) throw error;
		const aborted = error instanceof DOMException && error.name === 'AbortError';
		throw new CorsairMcpClientError(
			aborted ? 'Corsair MCP request timed out.' : 'Corsair MCP request failed.',
			aborted ? 'MCP_TIMEOUT' : 'MCP_NETWORK_ERROR'
		);
	} finally {
		clearTimeout(timeout);
	}
}

async function initializeSession(params: {
	url: string;
	config: CorsairMcpConfig;
	fetchFn: typeof fetch;
}): Promise<{ server?: unknown; sessionId?: string }> {
	const response = await postJsonRpc({
		url: params.url,
		method: 'initialize',
		rpcParams: {
			protocolVersion: params.config.protocolVersion,
			capabilities: {},
			clientInfo: {
				name: 'buildos-agentic-chat',
				version: '2026-05-20'
			}
		},
		config: params.config,
		fetchFn: params.fetchFn
	});

	return {
		server: response.body.result,
		sessionId: response.sessionId
	};
}

function configurationError(message: string): ListCorsairMcpToolsResult {
	return {
		status: 'configuration_error',
		code: 'MCP_NOT_CONFIGURED',
		message,
		tools: []
	};
}

function callConfigurationError(toolName: string, message: string): CallCorsairMcpToolResult {
	return {
		status: 'configuration_error',
		code: 'MCP_NOT_CONFIGURED',
		message,
		tool_name: toolName
	};
}

function normalizeTools(result: unknown): CorsairMcpTool[] {
	if (!result || typeof result !== 'object' || Array.isArray(result)) return [];
	const tools = (result as Record<string, unknown>).tools;
	if (!Array.isArray(tools)) return [];
	return tools.filter(
		(tool): tool is CorsairMcpTool =>
			Boolean(tool) &&
			typeof tool === 'object' &&
			!Array.isArray(tool) &&
			typeof (tool as Record<string, unknown>).name === 'string'
	);
}

export async function listCorsairMcpTools(
	options: CorsairMcpOptions = {}
): Promise<ListCorsairMcpToolsResult> {
	const config = readConfig(options.env, options.timeoutMs);
	if (!config.enabled) {
		return configurationError('Corsair MCP integration is disabled.');
	}

	const url = validateUrl(config.url);
	if (!url) {
		return configurationError('Corsair MCP URL is not configured. Set CORSAIR_MCP_URL.');
	}

	const fetchFn = options.fetchFn ?? fetch;
	try {
		const initialized = await initializeSession({ url, config, fetchFn });
		const response = await postJsonRpc({
			url,
			method: 'tools/list',
			config,
			fetchFn,
			sessionId: initialized.sessionId
		});

		return {
			status: 'ok',
			tools: normalizeTools(response.body.result),
			server: initialized.server
		};
	} catch (error) {
		if (error instanceof CorsairMcpClientError && error.code === 'MCP_AUTH_REQUIRED') {
			return {
				status: 'auth_required',
				code: error.code,
				message: error.message,
				auth: error.auth,
				tools: []
			};
		}
		return {
			status: 'error',
			code: error instanceof CorsairMcpClientError ? error.code : 'MCP_ERROR',
			message: error instanceof Error ? error.message : String(error),
			tools: []
		};
	}
}

export async function callCorsairMcpTool(
	args: CallCorsairMcpToolArgs,
	options: CorsairMcpOptions = {}
): Promise<CallCorsairMcpToolResult> {
	const toolName = typeof args.name === 'string' ? args.name.trim() : '';
	if (!toolName) {
		return {
			status: 'error',
			code: 'MCP_TOOL_NAME_REQUIRED',
			message: 'Corsair MCP tool name is required.',
			tool_name: ''
		};
	}

	const config = readConfig(options.env, options.timeoutMs);
	if (!config.enabled) {
		return callConfigurationError(toolName, 'Corsair MCP integration is disabled.');
	}

	const url = validateUrl(config.url);
	if (!url) {
		return callConfigurationError(
			toolName,
			'Corsair MCP URL is not configured. Set CORSAIR_MCP_URL.'
		);
	}

	const fetchFn = options.fetchFn ?? fetch;
	try {
		const initialized = await initializeSession({ url, config, fetchFn });
		const response = await postJsonRpc({
			url,
			method: 'tools/call',
			rpcParams: {
				name: toolName,
				arguments: args.arguments ?? {}
			},
			config,
			fetchFn,
			sessionId: initialized.sessionId
		});

		return {
			status: 'ok',
			tool_name: toolName,
			result: response.body.result
		};
	} catch (error) {
		if (error instanceof CorsairMcpClientError && error.code === 'MCP_AUTH_REQUIRED') {
			return {
				status: 'auth_required',
				code: error.code,
				message: error.message,
				auth: error.auth,
				tool_name: toolName
			};
		}
		return {
			status: 'error',
			code: error instanceof CorsairMcpClientError ? error.code : 'MCP_ERROR',
			message: error instanceof Error ? error.message : String(error),
			tool_name: toolName
		};
	}
}
