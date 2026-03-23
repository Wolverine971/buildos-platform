// apps/web/src/lib/server/agent-call/bootstrap-link.service.ts
import { createHash, randomBytes } from 'crypto';
import type {
	AgentCallBootstrapLinkRecord,
	BuildosAgentBootstrapDocument,
	BuildosAgentCallerBootstrapSummary,
	ExternalAgentCallerRecord
} from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ensureUserBuildosAgent } from './callee-resolution';

const BOOTSTRAP_TTL_MS = 1000 * 60 * 30;
const INSTRUCTIONS_VERSION = 'openclaw_bootstrap_v1';

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/g, '');
}

function hashBootstrapToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function generateBootstrapToken(): string {
	return `bocs_${randomBytes(24).toString('base64url')}`;
}

function buildInstructionsUrl(baseUrl: string, setupToken: string): string {
	return `${normalizeBaseUrl(baseUrl)}/api/agent-call/bootstrap/${setupToken}`;
}

function buildFollowUpPrompt(): string {
	return [
		'Use the configured BuildOS credentials.',
		'Connect to BuildOS, list the available gateway tools, call tool_help for root, and then use tool_exec to list the visible projects.',
		'Do not ask the user to paste secrets into chat.',
		'If configuration is incomplete, say exactly which file, env var, or secret location still needs to be updated.'
	].join(' ');
}

function buildEnvBlock(params: {
	baseUrl: string;
	bearerToken: string;
	calleeHandle: string;
	callerKey: string;
}): string {
	return [
		`BUILDOS_BASE_URL=${normalizeBaseUrl(params.baseUrl)}`,
		`BUILDOS_AGENT_TOKEN=${params.bearerToken}`,
		`BUILDOS_CALLEE_HANDLE=${params.calleeHandle}`,
		`BUILDOS_CALLER_KEY=${params.callerKey}`
	].join('\n');
}

function buildPastePrompt(params: {
	instructionsUrl: string;
	expiresAt: string;
	provider: string;
}): string {
	const providerLabel = params.provider === 'openclaw' ? 'OpenClaw' : 'external agent';

	return [
		`You are being connected to BuildOS from ${providerLabel}.`,
		'',
		`Open this setup URL now and follow the instructions exactly:`,
		params.instructionsUrl,
		'',
		'Important rules:',
		'- Treat any tokens returned there as secrets.',
		'- Store the BuildOS values in secure config or env, not in normal chat memory.',
		'- Prefer the native BuildOS connector if one exists.',
		'- If no connector exists, use your shell/HTTP capability to call BuildOS directly as instructed.',
		'- Do not ask the user to paste the secret token into chat again.',
		'',
		`This setup link expires at ${params.expiresAt}.`
	].join('\n');
}

function formatBootstrapDocumentAsText(document: BuildosAgentBootstrapDocument): string {
	return [
		'BuildOS OpenClaw Bootstrap Instructions',
		`Version: ${document.instructions_version}`,
		`Expires: ${document.expires_at}`,
		'',
		document.summary,
		'',
		'This response contains secrets. Do not copy them into normal chat logs or memory.',
		'',
		'Store these values in OpenClaw config or env:',
		document.openclaw.env_block,
		'',
		'Preferred storage targets:',
		...document.openclaw.storage_targets.map((target) => `- ${target}`),
		'',
		'What to do next:',
		...document.openclaw.setup_steps.map((step, index) => `${index + 1}. ${step}`),
		'',
		'BuildOS gateway:',
		`- URL: ${document.buildos.dial_url}`,
		`- Auth: Authorization: Bearer <BUILDOS_AGENT_TOKEN>`,
		`- First method: ${document.gateway.first_method}`,
		...document.gateway.next_methods.map((method) => `- Then: ${method}`),
		'',
		'Follow-up prompt after configuration:',
		document.openclaw.follow_up_prompt
	].join('\n');
}

type BootstrapPayload = {
	bearer_token: string;
};

function parseBootstrapPayload(payload: unknown): BootstrapPayload {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw new AgentCallBootstrapError('Bootstrap payload is invalid', 500);
	}

	const candidate = payload as { bearer_token?: unknown };
	if (typeof candidate.bearer_token !== 'string' || !candidate.bearer_token.trim()) {
		throw new AgentCallBootstrapError('Bootstrap payload is missing bearer token', 500);
	}

	return {
		bearer_token: candidate.bearer_token
	};
}

export class AgentCallBootstrapError extends Error {
	constructor(
		message: string,
		public readonly status = 400
	) {
		super(message);
		this.name = 'AgentCallBootstrapError';
	}
}

export class AgentCallBootstrapLinkService {
	constructor(private readonly admin: any = createAdminSupabaseClient()) {}

	async createBootstrap(params: {
		userId: string;
		baseUrl: string;
		caller: ExternalAgentCallerRecord;
		bearerToken: string;
	}): Promise<BuildosAgentCallerBootstrapSummary> {
		const setupToken = generateBootstrapToken();
		const setupTokenHash = hashBootstrapToken(setupToken);
		const expiresAt = new Date(Date.now() + BOOTSTRAP_TTL_MS).toISOString();

		const { error: deleteError } = await this.admin
			.from('agent_call_bootstrap_links')
			.delete()
			.eq('external_agent_caller_id', params.caller.id);

		if (deleteError) {
			throw new AgentCallBootstrapError('Failed to clear previous bootstrap links', 500);
		}

		const { error } = await this.admin.from('agent_call_bootstrap_links').insert({
			user_id: params.userId,
			external_agent_caller_id: params.caller.id,
			setup_token_hash: setupTokenHash,
			payload: {
				bearer_token: params.bearerToken
			},
			expires_at: expiresAt
		});

		if (error) {
			throw new AgentCallBootstrapError('Failed to create bootstrap link', 500);
		}

		const instructionsUrl = buildInstructionsUrl(params.baseUrl, setupToken);

		return {
			instructions_url: instructionsUrl,
			expires_at: expiresAt,
			paste_prompt: buildPastePrompt({
				instructionsUrl,
				expiresAt,
				provider: params.caller.provider
			})
		};
	}

	async loadBootstrapDocument(params: {
		setupToken: string;
		baseUrl: string;
	}): Promise<BuildosAgentBootstrapDocument> {
		if (typeof params.setupToken !== 'string' || !params.setupToken.trim()) {
			throw new AgentCallBootstrapError('setup token is required', 400);
		}

		const { data, error } = await this.admin
			.from('agent_call_bootstrap_links')
			.select('*')
			.eq('setup_token_hash', hashBootstrapToken(params.setupToken))
			.maybeSingle();

		if (error) {
			throw new AgentCallBootstrapError('Failed to load bootstrap link', 500);
		}

		if (!data) {
			throw new AgentCallBootstrapError('Bootstrap link not found', 404);
		}

		const bootstrapLink = data as AgentCallBootstrapLinkRecord;
		const now = Date.now();
		const expiresAtMs = Date.parse(bootstrapLink.expires_at);
		if (Number.isNaN(expiresAtMs) || expiresAtMs <= now) {
			throw new AgentCallBootstrapError('Bootstrap link has expired', 410);
		}

		const { data: callerData, error: callerError } = await this.admin
			.from('external_agent_callers')
			.select('*')
			.eq('id', bootstrapLink.external_agent_caller_id)
			.maybeSingle();

		if (callerError) {
			throw new AgentCallBootstrapError('Failed to load caller for bootstrap link', 500);
		}

		if (!callerData) {
			throw new AgentCallBootstrapError('Bootstrap caller not found', 404);
		}

		const caller = callerData as ExternalAgentCallerRecord;
		if (caller.status !== 'trusted') {
			throw new AgentCallBootstrapError('Bootstrap caller is not trusted', 403);
		}

		const buildosAgent = await ensureUserBuildosAgent(this.admin, bootstrapLink.user_id);
		const payload = parseBootstrapPayload(bootstrapLink.payload);
		const baseUrl = normalizeBaseUrl(params.baseUrl);
		const envBlock = buildEnvBlock({
			baseUrl,
			bearerToken: payload.bearer_token,
			calleeHandle: buildosAgent.agent_handle,
			callerKey: caller.caller_key
		});

		await this.admin
			.from('agent_call_bootstrap_links')
			.update({ last_accessed_at: new Date().toISOString() })
			.eq('id', bootstrapLink.id);

		return {
			provider: caller.provider,
			instructions_version: INSTRUCTIONS_VERSION,
			expires_at: bootstrapLink.expires_at,
			summary:
				'Use this document to store BuildOS credentials in OpenClaw and connect through the BuildOS call gateway. If a native BuildOS connector is unavailable, use exec plus curl as the fallback path.',
			buildos: {
				base_url: baseUrl,
				dial_url: `${baseUrl}/api/agent-call/buildos`,
				auth_scheme: 'Bearer',
				agent_token: payload.bearer_token,
				callee_handle: buildosAgent.agent_handle,
				caller_key: caller.caller_key
			},
			openclaw: {
				env_block: envBlock,
				storage_targets: [
					'OpenClaw secret or env configuration',
					'~/.openclaw/.env',
					'BuildOS plugin or connector config'
				],
				setup_steps: [
					'Store the env block exactly as shown below in secure config, not in normal chat memory.',
					'If a BuildOS connector or plugin exists, use it.',
					'If no connector exists, use exec plus curl to POST to the BuildOS gateway.',
					'Authenticate with Authorization: Bearer <BUILDOS_AGENT_TOKEN>.',
					'First call method call.dial, then tools/list.',
					'Use tool_help with path root or a narrow namespace like onto.task to discover allowed ops.',
					'Use tool_exec with a canonical op like onto.project.list to execute BuildOS reads.',
					'When finished, call call.hangup.',
					'If you cannot update config directly, tell the user exactly which file or config screen must be updated.'
				],
				follow_up_prompt: buildFollowUpPrompt()
			},
			gateway: {
				first_method: 'call.dial',
				next_methods: ['tools/list', 'tools/call', 'call.hangup']
			}
		};
	}
}

export function serializeBootstrapDocumentAsText(document: BuildosAgentBootstrapDocument): string {
	return formatBootstrapDocumentAsText(document);
}
