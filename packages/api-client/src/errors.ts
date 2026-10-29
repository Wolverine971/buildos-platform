// packages/api-client/src/errors.ts
/**
 * The one error the client throws. Every failure a screen can act on is a
 * `BuildOsApiError`: envelope failures (`success: false`), non-2xx statuses, and
 * transport failures (status 0, `isNetworkError`), so offline captures can show a
 * "waiting to send" state without inspecting the cause.
 */

/** Billing-gate fields the server hook puts on a 402 (apps/web/src/hooks.server.ts). */
export type UpgradeRequiredInfo = {
	read_only: boolean;
	blocked_capability: string;
	activation_path: string;
	billing_state?: string;
	billing_tier?: string;
};

export type BuildOsApiErrorInit = {
	message: string;
	/** HTTP status; 0 when the request never reached the server. */
	status: number;
	/** Envelope `code`, e.g. `UNAUTHORIZED`, `UPGRADE_REQUIRED`, `INVALID_REQUEST`. */
	code?: string;
	/** Envelope `details` (validation field, etc.). */
	details?: unknown;
	/** Parsed response body, when there was one. */
	body?: unknown;
	isNetworkError?: boolean;
	cause?: unknown;
};

export class BuildOsApiError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly details?: unknown;
	readonly body?: unknown;
	readonly isNetworkError: boolean;
	readonly cause?: unknown;

	constructor(init: BuildOsApiErrorInit) {
		super(init.message);
		// Keeps `instanceof` working after Babel/Hermes class transforms on native.
		Object.setPrototypeOf(this, new.target.prototype);
		this.name = 'BuildOsApiError';
		this.status = init.status;
		this.code = init.code;
		this.details = init.details;
		this.body = init.body;
		this.isNetworkError = init.isNetworkError === true;
		this.cause = init.cause;
	}

	/** Session missing or expired: sign the person back in. */
	isUnauthorized(): boolean {
		return this.status === 401;
	}

	/** Billing gate: the workspace is read-only until billing is activated. */
	isUpgradeRequired(): boolean {
		return this.status === 402 || this.code === 'UPGRADE_REQUIRED';
	}

	/** The 402 payload, or null when this is not a billing-gate error. */
	get upgrade(): UpgradeRequiredInfo | null {
		if (!this.isUpgradeRequired()) return null;
		const body = isRecord(this.body) ? this.body : {};
		return {
			read_only: body.read_only === true,
			blocked_capability:
				typeof body.blocked_capability === 'string'
					? body.blocked_capability
					: 'other_mutation',
			activation_path:
				typeof body.activation_path === 'string'
					? body.activation_path
					: '/billing/activate',
			billing_state: typeof body.billing_state === 'string' ? body.billing_state : undefined,
			billing_tier: typeof body.billing_tier === 'string' ? body.billing_tier : undefined
		};
	}
}

/**
 * Structural guard: survives duplicate module copies (Metro, mixed CJS/ESM) where
 * `instanceof` would fail.
 */
export function isBuildOsApiError(value: unknown): value is BuildOsApiError {
	if (value instanceof BuildOsApiError) return true;
	return (
		isRecord(value) &&
		value.name === 'BuildOsApiError' &&
		typeof value.status === 'number' &&
		typeof value.isNetworkError === 'boolean'
	);
}

/** Wrap a thrown `fetch` failure (DNS, offline, TLS) as a status-0 network error. */
export function toNetworkError(cause: unknown): BuildOsApiError {
	const message =
		cause instanceof Error && cause.message ? cause.message : 'Network request failed';
	return new BuildOsApiError({ message, status: 0, isNetworkError: true, cause });
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
