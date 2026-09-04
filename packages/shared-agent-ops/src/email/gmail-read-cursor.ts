// packages/shared-agent-ops/src/email/gmail-read-cursor.ts
// Encrypted, context-bound Gmail pagination cursors. Hosts inject how an
// encryption key version resolves; no SvelteKit dependency.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { resolveGmailTokenKeyFromEnv, type GmailTokenKeyResolver } from './gmail-token-crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ACTIVE_KEY_VERSION = 1;
const CURSOR_PREFIX = 'enc:gmail-cursor:v';
const CURSOR_CONTEXT = 'buildos:gmail-read-pagination';
const CURSOR_TTL_MS = 15 * 60 * 1000;
const MAX_PROVIDER_PAGE_TOKEN_LENGTH = 4_096;

export const MAX_GMAIL_READ_CURSOR_PAGE = 9;

type GmailReadCursorContext = {
	userId: string;
	connectionId: string;
	query: string;
};

type GmailReadCursorPayload = {
	pageToken: string;
	page: number;
	expiresAt: string;
};

export type GmailReadCursorOptions = {
	secret?: string;
	resolveKey?: GmailTokenKeyResolver;
};

export class GmailReadCursorError extends Error {
	constructor() {
		super('Invalid or expired Gmail pagination cursor');
		this.name = 'GmailReadCursorError';
	}
}

function getKeySecret(
	version: number,
	override: string | undefined,
	resolveKey: GmailTokenKeyResolver
): string {
	const secret = override?.trim() ?? resolveKey(version)?.trim();
	if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
		throw new GmailReadCursorError();
	}
	return secret;
}

function deriveKey(version: number, options: GmailReadCursorOptions): Buffer {
	const resolveKey = options.resolveKey ?? resolveGmailTokenKeyFromEnv;
	return createHash('sha256')
		.update(
			`${CURSOR_CONTEXT}:v${version}:${getKeySecret(version, options.secret, resolveKey)}`,
			'utf8'
		)
		.digest();
}

function queryHash(query: string): string {
	return createHash('sha256').update(query, 'utf8').digest('base64url');
}

function serializeContext(context: GmailReadCursorContext): Buffer {
	if (!context.userId || !context.connectionId || !context.query) {
		throw new GmailReadCursorError();
	}
	return Buffer.from(
		JSON.stringify({
			context: CURSOR_CONTEXT,
			userId: context.userId,
			connectionId: context.connectionId,
			queryHash: queryHash(context.query)
		}),
		'utf8'
	);
}

function validatePageToken(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length >= 1 &&
		value.length <= MAX_PROVIDER_PAGE_TOKEN_LENGTH &&
		!/\p{Cc}/u.test(value)
	);
}

function parseCursor(value: string): { version: number; payload: Buffer } {
	const match = /^enc:gmail-cursor:v(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
	if (!match) throw new GmailReadCursorError();
	const version = Number(match[1]);
	if (!Number.isInteger(version) || version < 1) throw new GmailReadCursorError();
	return { version, payload: Buffer.from(match[2]!, 'base64url') };
}

export function issueGmailReadCursor(
	params: GmailReadCursorContext & {
		pageToken: string;
		page: number;
		now: Date;
	},
	options: GmailReadCursorOptions = {}
): string {
	if (
		!validatePageToken(params.pageToken) ||
		!Number.isInteger(params.page) ||
		params.page < 1 ||
		params.page > MAX_GMAIL_READ_CURSOR_PAGE ||
		Number.isNaN(params.now.getTime())
	) {
		throw new GmailReadCursorError();
	}

	const version = ACTIVE_KEY_VERSION;
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, deriveKey(version, options), iv);
	cipher.setAAD(serializeContext(params));
	const payload: GmailReadCursorPayload = {
		pageToken: params.pageToken,
		page: params.page,
		expiresAt: new Date(params.now.getTime() + CURSOR_TTL_MS).toISOString()
	};
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify(payload), 'utf8'),
		cipher.final()
	]);
	const packed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
	return `${CURSOR_PREFIX}${version}.${packed}`;
}

export function consumeGmailReadCursor(
	params: GmailReadCursorContext & { cursor: string; now: Date },
	options: GmailReadCursorOptions = {}
): { pageToken: string; page: number } {
	try {
		const { version, payload } = parseCursor(params.cursor);
		if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) throw new GmailReadCursorError();
		const iv = payload.subarray(0, IV_LENGTH);
		const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
		const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
		const decipher = createDecipheriv(ALGORITHM, deriveKey(version, options), iv);
		decipher.setAAD(serializeContext(params));
		decipher.setAuthTag(authTag);
		const decoded = JSON.parse(
			Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
		) as Partial<GmailReadCursorPayload>;
		const expiresAt =
			typeof decoded.expiresAt === 'string' ? Date.parse(decoded.expiresAt) : NaN;
		if (
			!validatePageToken(decoded.pageToken) ||
			!Number.isInteger(decoded.page) ||
			(decoded.page ?? 0) < 1 ||
			(decoded.page ?? 0) > MAX_GMAIL_READ_CURSOR_PAGE ||
			!Number.isFinite(expiresAt) ||
			expiresAt <= params.now.getTime()
		) {
			throw new GmailReadCursorError();
		}
		return { pageToken: decoded.pageToken, page: decoded.page } as {
			pageToken: string;
			page: number;
		};
	} catch {
		throw new GmailReadCursorError();
	}
}
