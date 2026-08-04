// apps/web/src/lib/services/agentic-chat-v2/worker-transport-client.ts
import type {
	AgentChatTransportLeaseRequestV1,
	AgentChatTransportLeaseV1,
	LastTurnContext,
	ProjectFocus
} from '@buildos/shared-types';

const TRANSPORT_ENDPOINT = '/api/agent/v2/transport';
const WORKER_TURNS_ENDPOINT = '/api/agent/v2/turns';
const TRANSPORT_TIMEOUT_MS = 3_000;
const MAX_LEASE_TOKEN_LENGTH = 8 * 1024;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AgenticChatWorkerTextCommand = {
	leaseToken: string;
	clientTurnId: string;
	streamRunId: string;
	sessionId: string;
	context: AgentChatTransportLeaseRequestV1['context'];
	message: string;
	projectFocus: ProjectFocus | null;
	lastTurnContext: LastTurnContext | null;
	preparedPromptKey: string | null;
};

export async function requestAgenticChatTransportLease(input: {
	request: AgentChatTransportLeaseRequestV1;
	fetchImpl?: typeof fetch;
}): Promise<AgentChatTransportLeaseV1 | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), TRANSPORT_TIMEOUT_MS);
	try {
		const response = await (input.fetchImpl ?? fetch)(TRANSPORT_ENDPOINT, {
			method: 'POST',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json'
			},
			credentials: 'same-origin',
			cache: 'no-store',
			signal: controller.signal,
			body: JSON.stringify(input.request)
		});
		if (!response.ok) return null;
		const value: unknown = await response.json();
		return parseTransportLeaseEnvelope(value);
	} catch {
		// Negotiation has no durable side effect. A transport failure before a
		// worker lease is received may safely preserve the existing legacy path.
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function requestAgenticChatWorkerAdmission(input: {
	command: AgenticChatWorkerTextCommand;
	fetchImpl?: typeof fetch;
}): Promise<{ response: Response; payload: unknown | null }> {
	const response = await (input.fetchImpl ?? fetch)(WORKER_TURNS_ENDPOINT, {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		credentials: 'same-origin',
		cache: 'no-store',
		body: JSON.stringify(buildWorkerAdmissionBody(input.command))
	});
	if (!response.ok) return { response, payload: null };
	return { response, payload: await response.json() };
}

function buildWorkerAdmissionBody(command: AgenticChatWorkerTextCommand) {
	return {
		leaseToken: command.leaseToken,
		clientTurnId: command.clientTurnId,
		streamRunId: command.streamRunId,
		sessionId: command.sessionId,
		context: command.context,
		message: command.message,
		// Slice 7 is deliberately text-only. Image/voice admission stays on the
		// legacy path until the canary proves lifecycle and receipt convergence.
		attachments: [],
		projectFocus: command.projectFocus
			? {
					focusType: command.projectFocus.focusType,
					focusEntityId: command.projectFocus.focusEntityId ?? null,
					focusEntityName: command.projectFocus.focusEntityName ?? null,
					projectId: command.projectFocus.projectId,
					projectName: command.projectFocus.projectName
				}
			: null,
		lastTurnContext: command.lastTurnContext,
		voiceNoteGroupId: null,
		preparedPromptKey: command.preparedPromptKey
	};
}

function parseTransportLeaseEnvelope(value: unknown): AgentChatTransportLeaseV1 | null {
	if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
	const data = value.data;
	if (
		!hasExactKeys(data, ['mode', 'contractVersion', 'decisionId', 'token', 'expiresAt']) ||
		!CANONICAL_UUID.test(String(data.decisionId)) ||
		!canonicalLeaseToken(data.token) ||
		typeof data.expiresAt !== 'string' ||
		!Number.isFinite(Date.parse(data.expiresAt))
	) {
		return null;
	}
	if (
		(data.mode === 'legacy_sse' && data.contractVersion === 'legacy_internal_v1') ||
		(data.mode === 'worker_realtime' && data.contractVersion === 'agentic_chat_worker_v1')
	) {
		return data as AgentChatTransportLeaseV1;
	}
	return null;
}

function canonicalLeaseToken(value: unknown): value is string {
	return Boolean(
		typeof value === 'string' &&
			value.length > 0 &&
			value.length <= MAX_LEASE_TOKEN_LENGTH &&
			value === value.trim() &&
			value.startsWith('actl1.') &&
			/^[\x21-\x7e]+$/.test(value)
	);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const actual = Object.keys(value);
	return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
