// apps/web/src/lib/services/agentic-chat-v2/transport-lease.server.ts
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentChatTransportContextV1,
	type AgentChatTransportLeaseV1
} from '@buildos/shared-types';

export const AGENTIC_CHAT_TRANSPORT_LEASE_TTL_MS = 60_000;
export const AGENTIC_CHAT_TRANSPORT_LEASE_MAX_TTL_MS = 5 * 60_000;
export const AGENTIC_CHAT_TRANSPORT_LEASE_TOKEN_VERSION = 'agent_chat_transport_lease_v1';

const TOKEN_PREFIX = 'actl1';
const MINIMUM_SECRET_BYTES = 32;
const MAXIMUM_TOKEN_BYTES = 8 * 1024;
const MAXIMUM_FUTURE_SKEW_MS = 30_000;
const MAXIMUM_DATE_MS = 8_640_000_000_000_000;
const CLAIM_KEYS = new Set([
	'tokenVersion',
	'userId',
	'clientTurnId',
	'streamRunId',
	'context',
	'mode',
	'contractVersion',
	'decisionId',
	'issuedAtMs',
	'expiresAtMs',
	'killEpoch'
]);

type LeaseMode = AgentChatTransportLeaseV1['mode'];
type LeaseContractVersion = AgentChatTransportLeaseV1['contractVersion'];

export type AgenticChatTransportLeaseBinding = {
	userId: string;
	clientTurnId: string;
	streamRunId: string;
	context: AgentChatTransportContextV1;
};

export type AgenticChatTransportLeaseClaims = AgenticChatTransportLeaseBinding & {
	tokenVersion: typeof AGENTIC_CHAT_TRANSPORT_LEASE_TOKEN_VERSION;
	mode: LeaseMode;
	contractVersion: LeaseContractVersion;
	decisionId: string;
	issuedAtMs: number;
	expiresAtMs: number;
	killEpoch: number;
};

export type IssueAgenticChatTransportLeaseInput = AgenticChatTransportLeaseBinding & {
	secret: string;
	mode: LeaseMode;
	decisionId?: string;
	killEpoch?: number;
	nowMs?: number;
	ttlMs?: number;
};

export type VerifyAgenticChatTransportLeaseInput = {
	secret: string;
	token: string;
	expected: AgenticChatTransportLeaseBinding;
	nowMs?: number;
	currentKillEpoch?: number;
};

export type AgenticChatTransportLeaseErrorCode =
	| 'invalid_secret'
	| 'invalid_binding'
	| 'invalid_token'
	| 'invalid_signature'
	| 'not_yet_valid'
	| 'expired'
	| 'binding_mismatch'
	| 'transport_renegotiate';

export class AgenticChatTransportLeaseError extends Error {
	constructor(
		readonly code: AgenticChatTransportLeaseErrorCode,
		message: string
	) {
		super(message);
		this.name = 'AgenticChatTransportLeaseError';
	}
}

export function issueAgenticChatTransportLease(
	input: IssueAgenticChatTransportLeaseInput
): AgentChatTransportLeaseV1 {
	validateSecret(input.secret);
	validateBinding(input);
	const nowMs = safeTimestamp(input.nowMs ?? Date.now(), 'issued time');
	const ttlMs = positiveSafeInteger(input.ttlMs ?? AGENTIC_CHAT_TRANSPORT_LEASE_TTL_MS, 'ttl');
	if (ttlMs > AGENTIC_CHAT_TRANSPORT_LEASE_MAX_TTL_MS) {
		throw new AgenticChatTransportLeaseError(
			'invalid_binding',
			'Lease ttl exceeds the maximum'
		);
	}
	const expiresAtMs = nowMs + ttlMs;
	if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs > MAXIMUM_DATE_MS) {
		throw new AgenticChatTransportLeaseError('invalid_binding', 'Lease expiry is invalid');
	}
	const decisionId = input.decisionId ?? randomUUID();
	if (!isCanonicalUuid(decisionId)) {
		throw new AgenticChatTransportLeaseError('invalid_binding', 'Decision id is invalid');
	}
	const killEpoch = nonnegativeSafeInteger(input.killEpoch ?? 0, 'kill epoch');
	const contractVersion = contractVersionForMode(input.mode);
	const claims: AgenticChatTransportLeaseClaims = {
		tokenVersion: AGENTIC_CHAT_TRANSPORT_LEASE_TOKEN_VERSION,
		userId: input.userId.toLowerCase(),
		clientTurnId: input.clientTurnId,
		streamRunId: input.streamRunId,
		context: normalizeContext(input.context),
		mode: input.mode,
		contractVersion,
		decisionId: decisionId.toLowerCase(),
		issuedAtMs: nowMs,
		expiresAtMs,
		killEpoch
	};
	const encodedClaims = encodeBase64Url(JSON.stringify(claims));
	const signingInput = `${TOKEN_PREFIX}.${encodedClaims}`;
	const signature = sign(signingInput, input.secret);

	return {
		mode: claims.mode,
		contractVersion: claims.contractVersion,
		decisionId: claims.decisionId,
		token: `${signingInput}.${signature}`,
		expiresAt: new Date(expiresAtMs).toISOString()
	};
}

export function verifyAgenticChatTransportLease(
	input: VerifyAgenticChatTransportLeaseInput
): AgenticChatTransportLeaseClaims {
	validateSecret(input.secret);
	validateBinding(input.expected);
	if (
		typeof input.token !== 'string' ||
		input.token.length === 0 ||
		Buffer.byteLength(input.token, 'utf8') > MAXIMUM_TOKEN_BYTES
	) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease token is invalid');
	}
	const parts = input.token.split('.');
	if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX || !parts[1] || !parts[2]) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease token is malformed');
	}
	const signingInput = `${parts[0]}.${parts[1]}`;
	const actualSignature = decodeCanonicalBase64Url(parts[2], 'invalid_signature');
	const expectedSignature = Buffer.from(sign(signingInput, input.secret), 'base64url');
	if (
		actualSignature.byteLength !== expectedSignature.byteLength ||
		!timingSafeEqual(actualSignature, expectedSignature)
	) {
		throw new AgenticChatTransportLeaseError('invalid_signature', 'Lease signature is invalid');
	}

	let value: unknown;
	try {
		value = JSON.parse(decodeCanonicalBase64Url(parts[1], 'invalid_token').toString('utf8'));
	} catch (error) {
		if (error instanceof AgenticChatTransportLeaseError) throw error;
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease claims are invalid');
	}
	if (encodeBase64Url(JSON.stringify(value)) !== parts[1]) {
		throw new AgenticChatTransportLeaseError(
			'invalid_token',
			'Lease claims encoding is noncanonical'
		);
	}
	const claims = parseClaims(value);
	const nowMs = safeTimestamp(input.nowMs ?? Date.now(), 'verification time');
	if (claims.issuedAtMs > nowMs + MAXIMUM_FUTURE_SKEW_MS) {
		throw new AgenticChatTransportLeaseError('not_yet_valid', 'Lease is not yet valid');
	}
	if (nowMs >= claims.expiresAtMs) {
		throw new AgenticChatTransportLeaseError('expired', 'Lease has expired');
	}
	if (!sameBinding(claims, input.expected)) {
		throw new AgenticChatTransportLeaseError(
			'binding_mismatch',
			'Lease binding does not match'
		);
	}
	const currentKillEpoch = nonnegativeSafeInteger(input.currentKillEpoch ?? 0, 'kill epoch');
	if (claims.mode === 'worker_realtime' && claims.killEpoch < currentKillEpoch) {
		throw new AgenticChatTransportLeaseError(
			'transport_renegotiate',
			'Worker lease predates the current kill epoch'
		);
	}
	return claims;
}

export function parseAgenticChatWorkerKillEpoch(value: string | undefined): number {
	if (value === undefined || value === '') return 0;
	if (!/^(0|[1-9][0-9]*)$/.test(value)) {
		throw new AgenticChatTransportLeaseError(
			'invalid_binding',
			'Configured worker kill epoch is invalid'
		);
	}
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) {
		throw new AgenticChatTransportLeaseError(
			'invalid_binding',
			'Configured worker kill epoch is invalid'
		);
	}
	return parsed;
}

function parseClaims(value: unknown): AgenticChatTransportLeaseClaims {
	if (!isRecord(value)) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease claims are invalid');
	}
	const mode = value.mode;
	const contractVersion = value.contractVersion;
	const context = value.context;
	if (
		value.tokenVersion !== AGENTIC_CHAT_TRANSPORT_LEASE_TOKEN_VERSION ||
		(mode !== 'legacy_sse' && mode !== 'worker_realtime') ||
		contractVersion !== contractVersionForMode(mode) ||
		!isCanonicalUuid(value.userId) ||
		!canonicalBoundedString(value.clientTurnId, 256) ||
		!canonicalBoundedString(value.streamRunId, 256) ||
		!isCanonicalUuid(value.decisionId) ||
		!isRecord(context) ||
		Object.keys(value).length !== CLAIM_KEYS.size ||
		Object.keys(value).some((key) => !CLAIM_KEYS.has(key))
	) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease claims are invalid');
	}
	const normalizedContext = parseContext(context);
	const issuedAtMs = safeTimestampClaim(value.issuedAtMs);
	const expiresAtMs = safeTimestampClaim(value.expiresAtMs);
	const killEpoch = safeNonnegativeIntegerClaim(value.killEpoch);
	if (
		expiresAtMs <= issuedAtMs ||
		expiresAtMs - issuedAtMs > AGENTIC_CHAT_TRANSPORT_LEASE_MAX_TTL_MS
	) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease lifetime is invalid');
	}
	return {
		tokenVersion: AGENTIC_CHAT_TRANSPORT_LEASE_TOKEN_VERSION,
		userId: value.userId.toLowerCase(),
		clientTurnId: value.clientTurnId,
		streamRunId: value.streamRunId,
		context: normalizedContext,
		mode,
		contractVersion: contractVersionForMode(mode),
		decisionId: value.decisionId.toLowerCase(),
		issuedAtMs,
		expiresAtMs,
		killEpoch
	};
}

function validateBinding(binding: AgenticChatTransportLeaseBinding): void {
	if (
		!isCanonicalUuid(binding.userId) ||
		!canonicalBoundedString(binding.clientTurnId, 256) ||
		!canonicalBoundedString(binding.streamRunId, 256)
	) {
		throw new AgenticChatTransportLeaseError('invalid_binding', 'Lease binding is invalid');
	}
	normalizeContext(binding.context);
}

function normalizeContext(context: AgentChatTransportContextV1): AgentChatTransportContextV1 {
	if (
		!context ||
		!canonicalBoundedString(context.type, 128) ||
		(context.entityId !== null && !isCanonicalUuid(context.entityId)) ||
		(context.projectId !== null && !isCanonicalUuid(context.projectId))
	) {
		throw new AgenticChatTransportLeaseError('invalid_binding', 'Lease context is invalid');
	}
	return {
		type: context.type,
		entityId: context.entityId?.toLowerCase() ?? null,
		projectId: context.projectId?.toLowerCase() ?? null
	};
}

function parseContext(value: Record<string, unknown>): AgentChatTransportContextV1 {
	if (
		!canonicalBoundedString(value.type, 128) ||
		(value.entityId !== null && !isCanonicalUuid(value.entityId)) ||
		(value.projectId !== null && !isCanonicalUuid(value.projectId)) ||
		Object.keys(value).some(
			(key) => key !== 'type' && key !== 'entityId' && key !== 'projectId'
		)
	) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease context is invalid');
	}
	return {
		type: value.type,
		entityId: value.entityId?.toLowerCase() ?? null,
		projectId: value.projectId?.toLowerCase() ?? null
	};
}

function sameBinding(
	claims: AgenticChatTransportLeaseClaims,
	expected: AgenticChatTransportLeaseBinding
): boolean {
	const context = normalizeContext(expected.context);
	return (
		claims.userId === expected.userId.toLowerCase() &&
		claims.clientTurnId === expected.clientTurnId &&
		claims.streamRunId === expected.streamRunId &&
		claims.context.type === context.type &&
		claims.context.entityId === context.entityId &&
		claims.context.projectId === context.projectId
	);
}

function contractVersionForMode(mode: LeaseMode): LeaseContractVersion {
	if (mode === 'worker_realtime') return AGENTIC_CHAT_WORKER_CONTRACT_VERSION;
	if (mode === 'legacy_sse') return 'legacy_internal_v1';
	throw new AgenticChatTransportLeaseError('invalid_binding', 'Lease mode is invalid');
}

function validateSecret(secret: string): void {
	if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < MINIMUM_SECRET_BYTES) {
		throw new AgenticChatTransportLeaseError(
			'invalid_secret',
			'Agentic Chat transport lease secret is missing or too short'
		);
	}
}

function sign(value: string, secret: string): string {
	return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function encodeBase64Url(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeCanonicalBase64Url(
	value: string,
	code: Extract<AgenticChatTransportLeaseErrorCode, 'invalid_token' | 'invalid_signature'>
): Buffer {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) {
		throw new AgenticChatTransportLeaseError(code, 'Lease token encoding is invalid');
	}
	const decoded = Buffer.from(value, 'base64url');
	if (decoded.toString('base64url') !== value) {
		throw new AgenticChatTransportLeaseError(code, 'Lease token encoding is noncanonical');
	}
	return decoded;
}

function safeTimestamp(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 0 || value > MAXIMUM_DATE_MS) {
		throw new AgenticChatTransportLeaseError('invalid_binding', `Lease ${label} is invalid`);
	}
	return value;
}

function safeTimestampClaim(value: unknown): number {
	if (
		!Number.isSafeInteger(value) ||
		(value as number) < 0 ||
		(value as number) > MAXIMUM_DATE_MS
	) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease timestamp is invalid');
	}
	return value as number;
}

function positiveSafeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new AgenticChatTransportLeaseError('invalid_binding', `Lease ${label} is invalid`);
	}
	return value;
}

function nonnegativeSafeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new AgenticChatTransportLeaseError('invalid_binding', `Lease ${label} is invalid`);
	}
	return value;
}

function safeNonnegativeIntegerClaim(value: unknown): number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		throw new AgenticChatTransportLeaseError('invalid_token', 'Lease kill epoch is invalid');
	}
	return value as number;
}

function canonicalBoundedString(value: unknown, maxLength: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maxLength &&
		value === value.trim()
	);
}

function isCanonicalUuid(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
