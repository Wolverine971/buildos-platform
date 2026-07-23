// apps/web/src/lib/server/gmail-relevance/metadata-crypto.ts
import { env as privateEnv } from '$env/dynamic/private';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ACTIVE_KEY_VERSION = 1;
const ENCRYPTED_PREFIX = 'enc:gmail-relevance:v';
const CRYPTO_CONTEXT = 'buildos:gmail-relevance-metadata';
const MAX_VALUE_BYTES = 8_192;

export type EmailRelevanceProtectedValueKind =
	| 'provider_message'
	| 'provider_thread'
	| 'page_cursor'
	| 'evidence'
	| 'rule_value';

export type EmailRelevanceCryptoContext = {
	userId: string;
	connectionScopeId?: string;
	connectionId?: string;
	kind: EmailRelevanceProtectedValueKind;
	projectId?: string;
};

type EmailRelevanceCryptoOptions = { secret?: string };

export class EmailRelevanceCryptoError extends Error {
	constructor() {
		super('Email relevance protected value is unavailable');
		this.name = 'EmailRelevanceCryptoError';
	}
}

function privateValue(name: string): string | undefined {
	return privateEnv[name] ?? process.env[name];
}

function keySecret(version: number, override?: string): string {
	const secret =
		override?.trim() ?? privateValue(`PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V${version}`)?.trim();
	if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
		throw new EmailRelevanceCryptoError();
	}
	return secret;
}

function deriveKey(
	version: number,
	purpose: 'encryption' | 'fingerprint',
	secret?: string
): Buffer {
	return createHash('sha256')
		.update(`${CRYPTO_CONTEXT}:${purpose}:v${version}:${keySecret(version, secret)}`, 'utf8')
		.digest();
}

function serializedContext(context: EmailRelevanceCryptoContext): Buffer {
	if (
		!context.userId ||
		(context.kind === 'rule_value'
			? !context.projectId || !context.connectionId || Boolean(context.connectionScopeId)
			: !context.connectionScopeId ||
				Boolean(context.projectId) ||
				Boolean(context.connectionId))
	) {
		throw new EmailRelevanceCryptoError();
	}
	return Buffer.from(
		JSON.stringify({
			context: CRYPTO_CONTEXT,
			userId: context.userId,
			...(context.connectionScopeId ? { connectionScopeId: context.connectionScopeId } : {}),
			...(context.connectionId ? { connectionId: context.connectionId } : {}),
			kind: context.kind,
			...(context.projectId ? { projectId: context.projectId } : {})
		}),
		'utf8'
	);
}

function assertValue(value: string): void {
	if (!value || Buffer.byteLength(value, 'utf8') > MAX_VALUE_BYTES || /\p{Cc}/u.test(value)) {
		throw new EmailRelevanceCryptoError();
	}
}

function parseEnvelope(value: string): { version: number; payload: Buffer } {
	const match = /^enc:gmail-relevance:v(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
	if (!match) throw new EmailRelevanceCryptoError();
	const version = Number(match[1]);
	if (!Number.isInteger(version) || version < 1) throw new EmailRelevanceCryptoError();
	return { version, payload: Buffer.from(match[2]!, 'base64url') };
}

export function getActiveEmailRelevanceKeyVersion(): number {
	return ACTIVE_KEY_VERSION;
}

export function encryptEmailRelevanceValue(
	value: string,
	context: EmailRelevanceCryptoContext,
	options: EmailRelevanceCryptoOptions = {}
): string {
	assertValue(value);
	if (value.startsWith(ENCRYPTED_PREFIX)) throw new EmailRelevanceCryptoError();
	const version = ACTIVE_KEY_VERSION;
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, deriveKey(version, 'encryption', options.secret), iv);
	cipher.setAAD(serializedContext(context));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
	return `${ENCRYPTED_PREFIX}${version}.${payload}`;
}

export function decryptEmailRelevanceValue(
	envelope: string,
	context: EmailRelevanceCryptoContext,
	options: EmailRelevanceCryptoOptions = {}
): string {
	try {
		const { version, payload } = parseEnvelope(envelope);
		if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) throw new EmailRelevanceCryptoError();
		const decipher = createDecipheriv(
			ALGORITHM,
			deriveKey(version, 'encryption', options.secret),
			payload.subarray(0, IV_LENGTH)
		);
		decipher.setAAD(serializedContext(context));
		decipher.setAuthTag(payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH));
		const value = Buffer.concat([
			decipher.update(payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH)),
			decipher.final()
		]).toString('utf8');
		assertValue(value);
		return value;
	} catch {
		throw new EmailRelevanceCryptoError();
	}
}

export function hashEmailRelevanceValue(
	value: string,
	context: EmailRelevanceCryptoContext,
	options: EmailRelevanceCryptoOptions = {}
): string {
	assertValue(value);
	const version = ACTIVE_KEY_VERSION;
	return createHmac('sha256', deriveKey(version, 'fingerprint', options.secret))
		.update(serializedContext(context))
		.update('\u0000', 'utf8')
		.update(value, 'utf8')
		.digest('hex');
}
