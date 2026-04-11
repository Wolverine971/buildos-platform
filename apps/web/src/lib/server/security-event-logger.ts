// apps/web/src/lib/server/security-event-logger.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';

type AdminSupabaseClient = {
	from: (table: string) => any;
};

export type SecurityEventDelivery = 'background' | 'bounded' | 'blocking';
export type SecurityEventWaitUntil = (promise: Promise<unknown>) => void;

export type SecurityEventLogOptions = {
	supabase?: AdminSupabaseClient;
	delivery?: SecurityEventDelivery;
	timeoutMs?: number;
	waitUntil?: SecurityEventWaitUntil;
};

export type SecurityEventCategory =
	| 'auth'
	| 'agent'
	| 'access'
	| 'admin'
	| 'detection'
	| 'webhook'
	| 'integration'
	| 'system';

export type SecurityEventOutcome =
	| 'success'
	| 'failure'
	| 'blocked'
	| 'allowed'
	| 'denied'
	| 'info';

export type SecurityEventSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type SecurityActorType = 'anonymous' | 'user' | 'admin' | 'external_agent' | 'system';

export type SecurityEventInput = {
	eventType: string;
	category: SecurityEventCategory;
	outcome: SecurityEventOutcome;
	severity?: SecurityEventSeverity;
	actorType?: SecurityActorType;
	actorUserId?: string | null;
	externalAgentCallerId?: string | null;
	targetType?: string | null;
	targetId?: string | null;
	requestId?: string | null;
	sessionId?: string | null;
	ipAddress?: string | null;
	userAgent?: string | null;
	riskScore?: number | null;
	reason?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt?: string;
};

export type SecurityRequestContext = {
	requestId: string | null;
	ipAddress: string | null;
	userAgent: string | null;
};

const METADATA_DENY_KEY =
	/(password|token|secret|authorization|cookie|otp|hash|raw|content|body|prompt|authorization[_-]?code|oauth[_-]?code|code[_-]?verifier|code[_-]?challenge|access[_-]?token|refresh[_-]?token|id[_-]?token)/i;
const SAFE_DENY_KEY_EXCEPTIONS = new Set([
	'emailDomain',
	'email_domain',
	'contentLength',
	'idempotencyKeyPresent',
	'requestedContentLength'
]);
const MAX_METADATA_DEPTH = 4;
const MAX_OBJECT_KEYS = 50;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;
const DEFAULT_BOUNDED_TIMEOUT_MS = 250;

export async function logSecurityEvent(
	input: SecurityEventInput,
	options: SecurityEventLogOptions = {}
): Promise<void> {
	const delivery = options.delivery ?? deliveryForSecurityEvent(input);
	if (delivery === 'blocking') {
		await persistSecurityEvent(input, options);
		return;
	}

	const writePromise = persistSecurityEvent(input, options);
	trackSecurityEventWrite(writePromise, options);

	if (delivery === 'bounded') {
		await waitForBoundedSecurityEventWrite(
			writePromise,
			options.timeoutMs ?? DEFAULT_BOUNDED_TIMEOUT_MS,
			input.eventType
		);
	}
}

export async function logSecurityEventBlocking(
	input: SecurityEventInput,
	options: Omit<SecurityEventLogOptions, 'delivery'> = {}
): Promise<void> {
	await persistSecurityEvent(input, options);
}

export function logSecurityEventAsync(
	input: SecurityEventInput,
	options: Omit<SecurityEventLogOptions, 'delivery'> = {}
): void {
	const writePromise = persistSecurityEvent(input, options);
	trackSecurityEventWrite(writePromise, options);
}

export function getSecurityEventWaitUntil(platform: unknown): SecurityEventWaitUntil | undefined {
	const platformRecord =
		platform && typeof platform === 'object' ? (platform as Record<string, unknown>) : null;
	const contextRecord =
		platformRecord?.context && typeof platformRecord.context === 'object'
			? (platformRecord.context as Record<string, unknown>)
			: null;
	const candidate = contextRecord?.waitUntil ?? platformRecord?.waitUntil;

	if (typeof candidate !== 'function') return undefined;

	return (promise: Promise<unknown>) => {
		candidate.call(contextRecord ?? platformRecord, promise);
	};
}

export function getSecurityEventLogOptions(platform: unknown): SecurityEventLogOptions {
	const waitUntil = getSecurityEventWaitUntil(platform);
	return waitUntil ? { waitUntil } : {};
}

async function persistSecurityEvent(
	input: SecurityEventInput,
	options: Pick<SecurityEventLogOptions, 'supabase'> = {}
): Promise<void> {
	try {
		const admin = (options.supabase ?? createAdminSupabaseClient()) as AdminSupabaseClient;
		const { error } = await admin.from('security_events').insert({
			created_at: input.createdAt ?? new Date().toISOString(),
			event_type: input.eventType,
			category: input.category,
			outcome: input.outcome,
			severity: input.severity ?? severityForOutcome(input.outcome),
			actor_type: input.actorType ?? inferActorType(input),
			actor_user_id: input.actorUserId ?? null,
			external_agent_caller_id: input.externalAgentCallerId ?? null,
			target_type: input.targetType ?? null,
			target_id: input.targetId ?? null,
			request_id: input.requestId ?? null,
			session_id: input.sessionId ?? null,
			ip_address: input.ipAddress ?? null,
			user_agent: truncateString(input.userAgent ?? null, 500),
			risk_score: normalizeRiskScore(input.riskScore),
			reason: truncateString(input.reason ?? null, 500),
			metadata: sanitizeSecurityMetadata(input.metadata ?? {})
		});

		if (error) {
			console.warn('[SecurityEvent] Failed to insert security event', {
				eventType: input.eventType,
				message: error.message
			});
		}
	} catch (error) {
		console.warn('[SecurityEvent] Failed to write security event', {
			eventType: input.eventType,
			message: error instanceof Error ? error.message : String(error)
		});
	}
}

function deliveryForSecurityEvent(input: SecurityEventInput): SecurityEventDelivery {
	if (
		input.outcome === 'blocked' ||
		input.outcome === 'denied' ||
		input.severity === 'high' ||
		input.severity === 'critical' ||
		input.eventType === 'agent.auth.failed'
	) {
		return 'bounded';
	}

	return 'background';
}

function trackSecurityEventWrite(
	writePromise: Promise<void>,
	options: Pick<SecurityEventLogOptions, 'waitUntil'>
): void {
	if (!options.waitUntil) {
		void writePromise;
		return;
	}

	try {
		options.waitUntil(writePromise);
	} catch (error) {
		console.warn('[SecurityEvent] Failed to enqueue security event background write', {
			message: error instanceof Error ? error.message : String(error)
		});
		void writePromise;
	}
}

async function waitForBoundedSecurityEventWrite(
	writePromise: Promise<void>,
	timeoutMs: number,
	eventType: string
): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const timedOut = Symbol('security-event-timeout');

	const result = await Promise.race([
		writePromise.then(() => undefined),
		new Promise<typeof timedOut>((resolve) => {
			timeout = setTimeout(() => resolve(timedOut), Math.max(0, timeoutMs));
		})
	]);

	if (timeout) {
		clearTimeout(timeout);
	}

	if (result === timedOut) {
		console.warn('[SecurityEvent] Security event write exceeded bounded wait', {
			eventType,
			timeoutMs
		});
	}
}

export function getSecurityRequestContext(request: Request): SecurityRequestContext {
	return {
		requestId: getRequestIdFromHeaders(request.headers),
		ipAddress: getClientIpFromHeaders(request.headers),
		userAgent: request.headers.get('user-agent') || null
	};
}

export function getRequestIdFromHeaders(headers: Headers): string | null {
	return (
		headers.get('x-request-id') ||
		headers.get('x-vercel-id') ||
		headers.get('x-amzn-trace-id') ||
		null
	);
}

export function getClientIpFromHeaders(headers: Headers): string | null {
	const candidates = [
		headers.get('cf-connecting-ip'),
		headers.get('x-real-ip'),
		headers.get('x-client-ip'),
		headers.get('x-forwarded-for')
	];

	for (const value of candidates) {
		const normalized = normalizeIpCandidate(value);
		if (normalized) return normalized;
	}

	return null;
}

export function getEmailDomain(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().toLowerCase();
	const atIndex = trimmed.lastIndexOf('@');
	if (atIndex <= 0 || atIndex === trimmed.length - 1) return null;
	return trimmed.slice(atIndex + 1);
}

export function sanitizeSecurityMetadata(value: unknown): Record<string, unknown> {
	const sanitized = sanitizeMetadataValue(value, 0);
	return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
		? (sanitized as Record<string, unknown>)
		: {};
}

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
	if (value === null || value === undefined) return null;

	if (typeof value === 'string') {
		return truncateString(value, MAX_STRING_LENGTH);
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (Array.isArray(value)) {
		if (depth >= MAX_METADATA_DEPTH) return '[truncated]';
		return value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => sanitizeMetadataValue(item, depth + 1));
	}

	if (typeof value === 'object') {
		if (depth >= MAX_METADATA_DEPTH) return '[truncated]';

		return Object.entries(value as Record<string, unknown>)
			.slice(0, MAX_OBJECT_KEYS)
			.reduce<Record<string, unknown>>((output, [key, nestedValue]) => {
				if (shouldRedactMetadataKey(key)) {
					output[key] = '[redacted]';
					return output;
				}

				output[key] = sanitizeMetadataValue(nestedValue, depth + 1);
				return output;
			}, {});
	}

	return String(value);
}

function shouldRedactMetadataKey(key: string): boolean {
	if (SAFE_DENY_KEY_EXCEPTIONS.has(key)) return false;
	return METADATA_DENY_KEY.test(key);
}

function truncateString(value: string | null, maxLength: number): string | null {
	if (!value) return value;
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function normalizeIpCandidate(value: string | null): string | null {
	const candidate = value?.split(',')[0]?.trim();
	if (!candidate || candidate.length > 64) return null;

	if (/^[a-f0-9:.]+$/i.test(candidate)) {
		return candidate;
	}

	return null;
}

function normalizeRiskScore(value: number | null | undefined): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(100, Math.round(value)));
}

function inferActorType(input: SecurityEventInput): SecurityActorType {
	if (input.externalAgentCallerId) return 'external_agent';
	if (input.actorUserId) return 'user';
	return 'system';
}

function severityForOutcome(outcome: SecurityEventOutcome): SecurityEventSeverity {
	switch (outcome) {
		case 'blocked':
		case 'denied':
			return 'medium';
		case 'failure':
			return 'low';
		default:
			return 'info';
	}
}
