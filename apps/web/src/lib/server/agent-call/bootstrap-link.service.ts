// apps/web/src/lib/server/agent-call/bootstrap-link.service.ts
import { createHash, randomBytes } from 'crypto';
import type {
	AgentCallBootstrapLinkRecord,
	BuildosAgentBootstrapDocument,
	BuildosAgentCallerBootstrapSummary,
	ExternalAgentCallerRecord
} from '@buildos/shared-types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	describeScopeMode,
	extractAllowedOpsFromPolicy,
	extractScopeModeFromPolicy
} from './agent-call-policy';
import {
	buildAgentClientBootstrapInstructions,
	getAgentClientProfile,
	inferAgentClientProfileId
} from '$lib/agent-call/agent-client-profiles';
import { ensureUserBuildosAgent } from './callee-resolution';

const BOOTSTRAP_TTL_MS = 1000 * 60 * 30;
const INSTRUCTIONS_VERSION = 'agent_profile_bootstrap_v1';

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

function buildPastePrompt(params: {
	instructionsUrl: string;
	expiresAt: string;
	clientLabel: string;
	requiresOAuth: boolean;
	secretHandlingNote: string;
}): string {
	return [
		`You are being connected to BuildOS from ${params.clientLabel}.`,
		'',
		`Open this setup URL now and follow the instructions exactly:`,
		params.instructionsUrl,
		'',
		'Important rules:',
		'- Treat any tokens returned there as secrets.',
		'- Store the BuildOS values in secure config or env, not in normal chat memory.',
		`- ${params.secretHandlingNote}`,
		'- Prefer the native BuildOS connector if one exists.',
		'- If no connector exists, use your shell/HTTP capability to call BuildOS directly as instructed.',
		'- After setup, use get_onto_project_status first when working inside an existing project.',
		'- Do not ask the user to paste the secret token into chat again.',
		...(params.requiresOAuth
			? [
					'- This client needs a remote connector/OAuth path for production; do not treat browser chat as secret storage.'
				]
			: []),
		'',
		`This setup link expires at ${params.expiresAt}.`
	].join('\n');
}

function formatBootstrapDocumentAsText(document: BuildosAgentBootstrapDocument): string {
	return [
		`BuildOS ${document.client.label} Bootstrap Instructions`,
		`Version: ${document.instructions_version}`,
		`Expires: ${document.expires_at}`,
		`Client profile: ${document.client_profile_id}`,
		'',
		document.summary,
		'',
		'This response contains secrets. Do not copy them into normal chat logs or memory.',
		'',
		'Client:',
		`- Credential delivery: ${document.client.credential_delivery}`,
		`- Transport: ${document.client.transport}`,
		`- Setup status: ${document.client.setup_status}`,
		`- Requires OAuth: ${document.client.requires_oauth ? 'yes' : 'no'}`,
		'',
		'Preferred storage targets:',
		...document.storage_targets.map((target) => `- ${target}`),
		'',
		'Artifacts:',
		...document.artifacts.flatMap((artifact) => [
			`## ${artifact.label} (${artifact.kind}${artifact.sensitive ? ', sensitive' : ''})`,
			artifact.content,
			''
		]),
		'',
		'What to do next:',
		...document.setup_steps.map((step, index) => `${index + 1}. ${step}`),
		...(document.oauth
			? [
					'',
					'OAuth guidance:',
					`- Recommended: ${document.oauth.recommended ? 'yes' : 'no'}`,
					`- Required: ${document.oauth.required ? 'yes' : 'no'}`,
					`- Reason: ${document.oauth.reason}`,
					...document.oauth.next_steps.map((step) => `- ${step}`)
				]
			: []),
		'',
		'BuildOS gateway:',
		`- URL: ${document.buildos.dial_url}`,
		`- Auth: Authorization: Bearer <BUILDOS_AGENT_TOKEN>`,
		`- Scope mode: ${document.buildos.scope_mode}`,
		`- Allowed ops: ${document.buildos.allowed_ops.join(', ')}`,
		`- First method: ${document.gateway.first_method}`,
		...document.gateway.next_methods.map((method) => `- Then: ${method}`),
		'',
		'Follow-up prompt after configuration:',
		document.follow_up_prompt
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
		const profile = getAgentClientProfile(
			inferAgentClientProfileId(params.caller.provider, params.caller.metadata)
		);

		return {
			instructions_url: instructionsUrl,
			expires_at: expiresAt,
			paste_prompt: buildPastePrompt({
				instructionsUrl,
				expiresAt,
				clientLabel: profile.label,
				requiresOAuth: profile.requiresOAuth,
				secretHandlingNote: profile.secretHandlingNote
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
		const scopeMode = extractScopeModeFromPolicy(caller.policy);
		const allowedOps = extractAllowedOpsFromPolicy(caller.policy, scopeMode);
		const baseUrl = normalizeBaseUrl(params.baseUrl);
		const clientProfileId = inferAgentClientProfileId(caller.provider, caller.metadata);
		const profile = getAgentClientProfile(clientProfileId);
		const instructions = buildAgentClientBootstrapInstructions(profile, {
			baseUrl,
			bearerToken: payload.bearer_token,
			calleeHandle: buildosAgent.agent_handle,
			callerKey: caller.caller_key,
			provider: caller.provider,
			scopeMode,
			allowedOps
		});

		await this.admin
			.from('agent_call_bootstrap_links')
			.update({ last_accessed_at: new Date().toISOString() })
			.eq('id', bootstrapLink.id);

		return {
			provider: caller.provider,
			client_profile_id: profile.id,
			instructions_version: INSTRUCTIONS_VERSION,
			expires_at: bootstrapLink.expires_at,
			summary: `Use this document to store BuildOS credentials for ${profile.label} and connect through the BuildOS call gateway. This key grants ${describeScopeMode(scopeMode)} access and exposes ${allowedOps.length} BuildOS ops as scoped direct tools. ${profile.requiresOAuth ? 'For this client, production setup should use remote connector OAuth instead of pasted bearer-token chat handoff.' : 'If a native BuildOS connector is unavailable, use shell/HTTP calls as the fallback path.'}`,
			client: {
				label: profile.label,
				credential_delivery: profile.credentialDelivery,
				transport: profile.transport,
				requires_oauth: profile.requiresOAuth,
				setup_status: profile.setupStatus
			},
			buildos: {
				base_url: baseUrl,
				dial_url: `${baseUrl}/api/agent-call/buildos`,
				auth_scheme: 'Bearer',
				agent_token: payload.bearer_token,
				callee_handle: buildosAgent.agent_handle,
				caller_key: caller.caller_key,
				scope_mode: scopeMode,
				allowed_ops: allowedOps
			},
			artifacts: instructions.artifacts,
			storage_targets: instructions.storageTargets,
			setup_steps: instructions.setupSteps,
			follow_up_prompt: instructions.followUpPrompt,
			...(instructions.oauth ? { oauth: instructions.oauth } : {}),
			...(instructions.openclaw ? { openclaw: instructions.openclaw } : {}),
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
