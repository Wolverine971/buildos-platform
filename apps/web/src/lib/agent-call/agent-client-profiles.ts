// apps/web/src/lib/agent-call/agent-client-profiles.ts
import type {
	BuildosAgentAllowedOp,
	BuildosAgentBootstrapArtifact,
	BuildosAgentBootstrapOAuthGuidance,
	BuildosAgentScopeMode
} from '@buildos/shared-types';

export const AGENT_CLIENT_PROFILE_IDS = [
	'openclaw',
	'claude-code',
	'claude-browser',
	'chatgpt-actions',
	'chatgpt-developer-mode',
	'codex-cli',
	'custom-http'
] as const;

export type AgentClientProfileId = (typeof AGENT_CLIENT_PROFILE_IDS)[number];

export interface AgentClientProfile {
	id: AgentClientProfileId;
	label: string;
	provider: string;
	description: string;
	installationPlaceholder: string;
	installationHint: string;
	credentialDelivery: string;
	transport: string;
	setupStatus: 'ready' | 'requires_connector' | 'requires_oauth';
	requiresOAuth: boolean;
	customProvider?: boolean;
	allowSecretPrompt: boolean;
	secretHandlingNote: string;
	setupUrlLabel: string;
	pastePromptLabel: string;
	setupUrlDescription: string;
}

export interface AgentClientBootstrapContext {
	baseUrl: string;
	bearerToken: string;
	calleeHandle: string;
	callerKey: string;
	provider: string;
	scopeMode: BuildosAgentScopeMode;
	allowedOps: BuildosAgentAllowedOp[];
}

export interface AgentClientBootstrapInstructions {
	artifacts: BuildosAgentBootstrapArtifact[];
	storageTargets: string[];
	setupSteps: string[];
	followUpPrompt: string;
	oauth?: BuildosAgentBootstrapOAuthGuidance;
	openclaw?: {
		env_block: string;
		storage_targets: string[];
		setup_steps: string[];
		follow_up_prompt: string;
	};
}

export const AGENT_CLIENT_PROFILES: AgentClientProfile[] = [
	{
		id: 'openclaw',
		label: 'OpenClaw',
		provider: 'openclaw',
		description: 'Use OpenClaw env, SecretRef, or plugin config for the BuildOS key.',
		installationPlaceholder: 'studio-workspace',
		installationHint: 'e.g. Studio workspace',
		credentialDelivery: 'OpenClaw env or SecretRef',
		transport: 'OpenClaw connector or JSON-RPC HTTP fallback',
		setupStatus: 'requires_connector',
		requiresOAuth: false,
		allowSecretPrompt: true,
		secretHandlingNote: 'Store this in OpenClaw env or secret config, not OpenClaw chat.',
		setupUrlLabel: 'OpenClaw Setup URL',
		pastePromptLabel: 'Paste Into OpenClaw',
		setupUrlDescription:
			'Paste the prompt below into OpenClaw after the connector can fetch the setup URL and write secure config values.'
	},
	{
		id: 'claude-code',
		label: 'Claude Code',
		provider: 'claude-code',
		description: 'Use local MCP config, env vars, or a local adapter; never chat memory.',
		installationPlaceholder: 'macbook',
		installationHint: 'e.g. MacBook or worktree name',
		credentialDelivery: 'Claude Code MCP config env/header',
		transport: 'MCP adapter when available; JSON-RPC HTTP fallback',
		setupStatus: 'requires_connector',
		requiresOAuth: false,
		allowSecretPrompt: true,
		secretHandlingNote: 'Store this in local MCP config or env, not a Claude conversation.',
		setupUrlLabel: 'Claude Code Setup URL',
		pastePromptLabel: 'Paste Into Claude Code',
		setupUrlDescription:
			'Use this handoff when Claude Code can edit local config or run shell commands for the adapter setup.'
	},
	{
		id: 'claude-browser',
		label: 'Claude Browser',
		provider: 'claude-browser',
		description: 'Claude.ai needs a public remote MCP connector; OAuth is the right auth path.',
		installationPlaceholder: 'personal-claude',
		installationHint: 'e.g. Personal Claude account',
		credentialDelivery: 'Remote MCP OAuth connector',
		transport: 'Remote MCP over streamable HTTP or SSE',
		setupStatus: 'requires_oauth',
		requiresOAuth: true,
		allowSecretPrompt: false,
		secretHandlingNote:
			'Do not paste this bearer token into Claude.ai chat. Use it only behind a connector you control until OAuth is available.',
		setupUrlLabel: 'Claude Connector Setup URL',
		pastePromptLabel: 'Connector Admin Prompt',
		setupUrlDescription:
			'Claude browser cannot read local env. Use this as implementation guidance for a remote MCP/OAuth connector.'
	},
	{
		id: 'chatgpt-actions',
		label: 'ChatGPT Actions',
		provider: 'chatgpt-actions',
		description:
			'Private GPT Actions can store this as an API key secret; shared GPTs should use OAuth.',
		installationPlaceholder: 'private-gpt',
		installationHint: 'e.g. Private planning GPT',
		credentialDelivery: 'GPT Action API key secret',
		transport: 'OpenAPI Action against the BuildOS JSON-RPC gateway',
		setupStatus: 'ready',
		requiresOAuth: false,
		allowSecretPrompt: false,
		secretHandlingNote:
			'Put the token into the GPT Action authentication field, not normal ChatGPT chat.',
		setupUrlLabel: 'ChatGPT Action Setup URL',
		pastePromptLabel: 'Action Builder Prompt',
		setupUrlDescription:
			'Use the OpenAPI artifact and set Action authentication to API key bearer for a private GPT.'
	},
	{
		id: 'chatgpt-developer-mode',
		label: 'ChatGPT Developer Mode',
		provider: 'chatgpt-developer-mode',
		description: 'Full ChatGPT tools should come through a remote MCP connector with OAuth.',
		installationPlaceholder: 'developer-mode',
		installationHint: 'e.g. Developer Mode connector',
		credentialDelivery: 'Remote MCP OAuth connector',
		transport: 'Remote MCP over streamable HTTP or SSE',
		setupStatus: 'requires_oauth',
		requiresOAuth: true,
		allowSecretPrompt: false,
		secretHandlingNote:
			'Do not paste this bearer token into ChatGPT. Use OAuth for the remote MCP connector.',
		setupUrlLabel: 'ChatGPT MCP Setup URL',
		pastePromptLabel: 'Connector Builder Prompt',
		setupUrlDescription:
			'Developer Mode expects a remote MCP server. Use this as connector implementation guidance.'
	},
	{
		id: 'codex-cli',
		label: 'Codex CLI / IDE',
		provider: 'codex-cli',
		description: 'Use Codex MCP config with an env var reference or a local adapter.',
		installationPlaceholder: 'local-codex',
		installationHint: 'e.g. Local Codex profile',
		credentialDelivery: 'Codex MCP config env reference',
		transport: 'MCP adapter when available; JSON-RPC HTTP fallback',
		setupStatus: 'requires_connector',
		requiresOAuth: false,
		allowSecretPrompt: true,
		secretHandlingNote:
			'Store this in a local env var or secret-backed MCP config, not AGENTS.md.',
		setupUrlLabel: 'Codex Setup URL',
		pastePromptLabel: 'Paste Into Codex',
		setupUrlDescription:
			'Use this handoff when Codex can update local config or use a BuildOS adapter.'
	},
	{
		id: 'custom-http',
		label: 'Custom HTTP Client',
		provider: 'custom',
		description: 'Use the bearer token directly from your secret manager or env.',
		installationPlaceholder: 'my-agent',
		installationHint: 'e.g. My agent service',
		credentialDelivery: 'Env or secret manager',
		transport: 'BuildOS JSON-RPC HTTP gateway',
		setupStatus: 'ready',
		requiresOAuth: false,
		customProvider: true,
		allowSecretPrompt: true,
		secretHandlingNote: 'Store this in your service secret manager or env, not prompt text.',
		setupUrlLabel: 'HTTP Setup URL',
		pastePromptLabel: 'HTTP Client Prompt',
		setupUrlDescription:
			'Use this handoff for clients that can store env vars and call the BuildOS gateway directly.'
	}
];

const PROFILE_BY_ID = new Map(AGENT_CLIENT_PROFILES.map((profile) => [profile.id, profile]));
const PROFILE_BY_PROVIDER = new Map(
	AGENT_CLIENT_PROFILES.map((profile) => [profile.provider, profile])
);

export function getAgentClientProfile(id: unknown): AgentClientProfile {
	if (typeof id === 'string' && PROFILE_BY_ID.has(id as AgentClientProfileId)) {
		return PROFILE_BY_ID.get(id as AgentClientProfileId)!;
	}

	return PROFILE_BY_ID.get('custom-http')!;
}

export function inferAgentClientProfileId(
	provider: string,
	metadata?: Record<string, unknown> | null
): AgentClientProfileId {
	const metadataProfileId = metadata?.client_profile_id;
	if (
		typeof metadataProfileId === 'string' &&
		PROFILE_BY_ID.has(metadataProfileId as AgentClientProfileId)
	) {
		return metadataProfileId as AgentClientProfileId;
	}

	const providerProfile = PROFILE_BY_PROVIDER.get(provider.trim().toLowerCase());
	return providerProfile?.id ?? 'custom-http';
}

export function buildBuildosEnvBlock(params: {
	baseUrl: string;
	bearerToken: string;
	calleeHandle: string;
	callerKey: string;
}): string {
	return [
		`BUILDOS_BASE_URL=${params.baseUrl.replace(/\/+$/g, '')}`,
		`BUILDOS_AGENT_TOKEN=${params.bearerToken}`,
		`BUILDOS_CALLEE_HANDLE=${params.calleeHandle}`,
		`BUILDOS_CALLER_KEY=${params.callerKey}`
	].join('\n');
}

export function buildCallerKeyForProfile(params: {
	profileId: AgentClientProfileId;
	provider: string;
	slug: string;
}): string {
	if (params.profileId === 'openclaw') {
		return `openclaw:workspace:${params.slug}`;
	}

	if (params.profileId === 'claude-code' || params.profileId === 'codex-cli') {
		return `${params.provider}:local:${params.slug}`;
	}

	if (
		params.profileId === 'claude-browser' ||
		params.profileId === 'chatgpt-actions' ||
		params.profileId === 'chatgpt-developer-mode'
	) {
		return `${params.provider}:connector:${params.slug}`;
	}

	return `${params.provider}:installation:${params.slug}`;
}

function buildGatewayDialPayload(context: AgentClientBootstrapContext): string {
	return JSON.stringify(
		{
			method: 'call.dial',
			params: {
				callee_handle: context.calleeHandle,
				client: {
					provider: context.provider,
					caller_key: context.callerKey
				},
				requested_scope: {
					mode: context.scopeMode,
					allowed_ops: context.allowedOps
				}
			}
		},
		null,
		2
	);
}

function buildChatGptActionSchema(context: AgentClientBootstrapContext): string {
	return JSON.stringify(
		{
			openapi: '3.1.0',
			info: {
				title: 'BuildOS Agent Gateway',
				version: '1.0.0'
			},
			servers: [
				{
					url: context.baseUrl
				}
			],
			paths: {
				'/api/agent-call/buildos': {
					post: {
						operationId: 'callBuildosAgentGateway',
						summary: 'Call the BuildOS agent gateway',
						description:
							'Use call.dial first, then tools/list, tools/call, and call.hangup.',
						security: [
							{
								buildosBearer: []
							}
						],
						requestBody: {
							required: true,
							content: {
								'application/json': {
									schema: {
										type: 'object',
										required: ['method', 'params'],
										properties: {
											method: {
												type: 'string',
												enum: [
													'call.dial',
													'tools/list',
													'tools/call',
													'call.hangup'
												]
											},
											params: {
												type: 'object',
												additionalProperties: true
											}
										}
									}
								}
							}
						},
						responses: {
							'200': {
								description: 'BuildOS gateway response'
							}
						}
					}
				}
			},
			components: {
				securitySchemes: {
					buildosBearer: {
						type: 'http',
						scheme: 'bearer'
					}
				}
			}
		},
		null,
		2
	);
}

function buildProfileArtifacts(
	profile: AgentClientProfile,
	context: AgentClientBootstrapContext
): BuildosAgentBootstrapArtifact[] {
	const envBlock = buildBuildosEnvBlock({
		baseUrl: context.baseUrl,
		bearerToken: context.bearerToken,
		calleeHandle: context.calleeHandle,
		callerKey: context.callerKey
	});
	const artifacts: BuildosAgentBootstrapArtifact[] = [
		{
			id: 'buildos-env',
			label: 'BuildOS environment values',
			kind: 'env',
			content: envBlock,
			sensitive: true
		}
	];

	if (profile.id === 'openclaw') {
		artifacts.push({
			id: 'openclaw-env-config',
			label: 'OpenClaw config env block',
			kind: 'json',
			content: JSON.stringify(
				{
					env: {
						vars: {
							BUILDOS_BASE_URL: context.baseUrl,
							BUILDOS_AGENT_TOKEN: '${BUILDOS_AGENT_TOKEN}',
							BUILDOS_CALLEE_HANDLE: context.calleeHandle,
							BUILDOS_CALLER_KEY: context.callerKey
						}
					}
				},
				null,
				2
			),
			sensitive: false
		});
	}

	if (profile.id === 'chatgpt-actions') {
		artifacts.push({
			id: 'chatgpt-action-openapi',
			label: 'ChatGPT Action OpenAPI schema',
			kind: 'openapi',
			content: buildChatGptActionSchema(context),
			sensitive: false
		});
	}

	if (profile.id === 'codex-cli') {
		artifacts.push({
			id: 'codex-mcp-config-target',
			label: 'Codex MCP config target',
			kind: 'toml',
			content: [
				'# Use this shape when the BuildOS MCP facade or local adapter is available.',
				'[mcp_servers.buildos]',
				'url = "${BUILDOS_BASE_URL}/mcp/buildos"',
				'bearer_token_env_var = "BUILDOS_AGENT_TOKEN"'
			].join('\n'),
			sensitive: false
		});
	}

	if (profile.id === 'claude-code') {
		artifacts.push({
			id: 'claude-code-mcp-target',
			label: 'Claude Code MCP config target',
			kind: 'json',
			content: JSON.stringify(
				{
					mcpServers: {
						buildos: {
							type: 'http',
							url: '${BUILDOS_BASE_URL}/mcp/buildos',
							headers: {
								Authorization: 'Bearer ${BUILDOS_AGENT_TOKEN}'
							}
						}
					}
				},
				null,
				2
			),
			sensitive: false
		});
	}

	artifacts.push({
		id: 'gateway-dial-payload',
		label: 'Gateway call.dial payload',
		kind: 'json',
		content: buildGatewayDialPayload(context),
		sensitive: false
	});

	return artifacts;
}

function oauthGuidanceForProfile(
	profile: AgentClientProfile
): BuildosAgentBootstrapOAuthGuidance | undefined {
	if (profile.id === 'claude-browser') {
		return {
			recommended: true,
			required: true,
			reason: 'Claude browser and cloud-brokered connectors cannot read local env vars, so BuildOS should expose a remote MCP connector protected by OAuth.',
			next_steps: [
				'Ship a BuildOS remote MCP facade over the existing agent-call gateway.',
				'Add OAuth authorization, callback, token exchange, refresh, and revocation endpoints.',
				'Register the connector URL in Claude settings and let each user connect through OAuth.'
			]
		};
	}

	if (profile.id === 'chatgpt-developer-mode') {
		return {
			recommended: true,
			required: true,
			reason: 'ChatGPT Developer Mode remote MCP connectors are cloud-originated and should authenticate per user with OAuth rather than a pasted shared bearer token.',
			next_steps: [
				'Expose the BuildOS MCP facade over streamable HTTP.',
				'Publish OAuth metadata and implement dynamic or static client registration.',
				'Map OAuth grants to the same scoped external caller policy used by bearer keys.'
			]
		};
	}

	if (profile.id === 'chatgpt-actions') {
		return {
			recommended: true,
			required: false,
			reason: 'API key bearer auth is acceptable for a private GPT Action, but OAuth is cleaner for shared GPTs or multi-user workspace installs.',
			next_steps: [
				'Keep bearer Action auth for private single-user GPTs.',
				'Use OAuth before publishing a shared GPT Action or workspace-wide connector.',
				'Re-use the existing caller policy when minting tokens during the OAuth callback.'
			]
		};
	}

	return undefined;
}

function storageTargetsForProfile(profile: AgentClientProfile): string[] {
	switch (profile.id) {
		case 'openclaw':
			return [
				'OpenClaw process environment',
				'~/.openclaw/.env',
				'~/.openclaw/openclaw.json env block',
				'OpenClaw BuildOS plugin or connector config'
			];
		case 'claude-code':
			return [
				'Claude Code local or user-scoped MCP config',
				'Environment variables passed to the BuildOS adapter',
				'Private shell profile or project-local untracked .env'
			];
		case 'claude-browser':
			return [
				'BuildOS remote MCP connector OAuth grant',
				'Connector backend secret storage during pre-OAuth development'
			];
		case 'chatgpt-actions':
			return [
				'GPT Action authentication field using API key bearer',
				'BuildOS OAuth grant for shared or workspace GPTs'
			];
		case 'chatgpt-developer-mode':
			return ['BuildOS remote MCP connector OAuth grant'];
		case 'codex-cli':
			return [
				'Local env var referenced by Codex MCP config',
				'OS keychain or secret-backed environment loader',
				'Project-local untracked .env used by the BuildOS adapter'
			];
		default:
			return ['Service secret manager', 'Environment variables', 'Private untracked config'];
	}
}

function setupStepsForProfile(
	profile: AgentClientProfile,
	context: AgentClientBootstrapContext
): string[] {
	const commonGatewaySteps = [
		`Authenticate to ${context.baseUrl}/api/agent-call/buildos with Authorization: Bearer <BUILDOS_AGENT_TOKEN>.`,
		`Request ${context.scopeMode} during call.dial unless this session only needs narrower access.`,
		'Call call.dial first, then tools/list.',
		'Use direct tools returned by tools/list for normal BuildOS reads and writes.',
		'Use tool_search only when the exact BuildOS tool is unknown.',
		'Use tool_schema before first-time or uncertain writes, then call the returned direct tool_name.',
		'Call call.hangup when the session is finished.'
	];

	switch (profile.id) {
		case 'openclaw':
			return [
				'Store the env block in OpenClaw env or SecretRef-backed config, not in chat memory.',
				'Use the BuildOS OpenClaw connector when it is available.',
				'If no connector exists, use exec plus curl to POST to the BuildOS gateway.',
				...commonGatewaySteps,
				'If configuration cannot be updated directly, tell the user exactly which OpenClaw config file or secret location needs to change.'
			];
		case 'claude-code':
			return [
				'Store the BuildOS token in a local env var or MCP server config, not in a Claude conversation.',
				'Use a BuildOS MCP adapter or facade when available; pass the token through an env var or Authorization header.',
				'Until the MCP facade is available, use shell/HTTP calls against the JSON-RPC gateway.',
				...commonGatewaySteps
			];
		case 'claude-browser':
			return [
				'Do not paste the bearer token into Claude.ai chat.',
				'Use this token only behind a remote MCP connector you control during development.',
				'For production, replace bearer-token handoff with OAuth so each Claude user grants BuildOS access explicitly.',
				'The remote MCP server must be publicly reachable from Anthropic infrastructure.'
			];
		case 'chatgpt-actions':
			return [
				'Create a private GPT Action and set authentication to API key bearer.',
				'Paste the BuildOS token into the Action authentication secret, not into normal ChatGPT messages.',
				'Import the OpenAPI artifact from this bootstrap document.',
				...commonGatewaySteps,
				'Use OAuth instead before publishing a shared GPT or workspace-wide Action.'
			];
		case 'chatgpt-developer-mode':
			return [
				'Do not paste the bearer token into ChatGPT messages.',
				'Expose BuildOS through a remote MCP facade over streamable HTTP.',
				'Protect the connector with OAuth so ChatGPT receives a per-user grant.',
				'Use the existing BuildOS caller policy to scope the tools exposed through MCP.'
			];
		case 'codex-cli':
			return [
				'Store the BuildOS token in an env var or OS-backed secret loader, not in AGENTS.md or committed config.',
				'Reference the env var from Codex MCP config when using a BuildOS MCP adapter or facade.',
				'Until the MCP facade is available, use shell/HTTP calls against the JSON-RPC gateway.',
				...commonGatewaySteps
			];
		default:
			return [
				'Store the BuildOS token in your client secret manager or env.',
				...commonGatewaySteps,
				'Never echo the token into logs, normal chat history, or model memory.'
			];
	}
}

function followUpPromptForProfile(profile: AgentClientProfile): string {
	if (profile.requiresOAuth) {
		return [
			'Use the configured BuildOS remote MCP connector.',
			'If OAuth is not configured yet, explain that this client cannot safely store a pasted BuildOS bearer token.',
			'Do not ask the user to paste secrets into chat.'
		].join(' ');
	}

	return [
		'Use the configured BuildOS credentials.',
		'Connect to BuildOS, list the available BuildOS tools, then call the scoped direct tools by name.',
		'Use tool_search only when the exact tool is unknown, and tool_schema when you need exact arguments before a write.',
		'Do not ask the user to paste secrets into chat.',
		'If configuration is incomplete, say exactly which file, env var, or secret location still needs to be updated.'
	].join(' ');
}

export function buildAgentClientBootstrapInstructions(
	profile: AgentClientProfile,
	context: AgentClientBootstrapContext
): AgentClientBootstrapInstructions {
	const artifacts = buildProfileArtifacts(profile, context);
	const storageTargets = storageTargetsForProfile(profile);
	const setupSteps = setupStepsForProfile(profile, context);
	const followUpPrompt = followUpPromptForProfile(profile);

	return {
		artifacts,
		storageTargets,
		setupSteps,
		followUpPrompt,
		oauth: oauthGuidanceForProfile(profile),
		...(profile.id === 'openclaw'
			? {
					openclaw: {
						env_block:
							artifacts.find((artifact) => artifact.id === 'buildos-env')?.content ??
							'',
						storage_targets: storageTargets,
						setup_steps: setupSteps,
						follow_up_prompt: followUpPrompt
					}
				}
			: {})
	};
}
