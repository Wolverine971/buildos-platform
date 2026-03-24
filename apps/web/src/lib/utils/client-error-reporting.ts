// apps/web/src/lib/utils/client-error-reporting.ts
import { browser } from '$app/environment';
import { sanitizeLogData } from '$lib/utils/logging-helpers';

export const CLIENT_ERROR_REPORT_ENDPOINT = '/api/error-tracking/client';

const REPORT_DEDUPE_WINDOW_MS = 30_000;
const recentReportFingerprints = new Map<string, number>();

export type ClientErrorReport = {
	kind: 'runtime' | 'fetch_network';
	error: unknown;
	endpoint?: string;
	method?: string;
	url?: string;
	status?: number;
	statusText?: string;
	metadata?: Record<string, unknown>;
};

export function isClientErrorReportEndpoint(pathname?: string | null): boolean {
	return pathname === CLIENT_ERROR_REPORT_ENDPOINT;
}

export function isAbortLikeClientError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const maybeError = error as { name?: string; message?: string };
	const name = maybeError.name?.toLowerCase() ?? '';
	const message = maybeError.message?.toLowerCase() ?? '';
	return (
		name === 'aborterror' ||
		message.includes('aborted') ||
		message.includes('cancelled') ||
		message.includes('canceled')
	);
}

function getCsrfToken(): string | undefined {
	if (!browser) return undefined;
	const metaTag = document.querySelector('meta[name="csrf-token"]');
	return metaTag?.getAttribute('content') || undefined;
}

function pruneRecentFingerprints(now: number): void {
	for (const [fingerprint, timestamp] of recentReportFingerprints.entries()) {
		if (now - timestamp > REPORT_DEDUPE_WINDOW_MS) {
			recentReportFingerprints.delete(fingerprint);
		}
	}
}

function buildFingerprint(payload: Record<string, unknown>): string {
	return JSON.stringify([
		payload.kind,
		payload.endpoint,
		payload.method,
		payload.status,
		payload.statusText,
		(payload.error as Record<string, unknown> | undefined)?.message
	]);
}

function normalizeClientError(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack
		};
	}

	if (typeof error === 'string') {
		return {
			name: 'Error',
			message: error
		};
	}

	if (error && typeof error === 'object') {
		const candidate = error as {
			name?: unknown;
			message?: unknown;
			stack?: unknown;
		};
		return {
			name: typeof candidate.name === 'string' ? candidate.name : 'Error',
			message:
				typeof candidate.message === 'string' ? candidate.message : 'Client runtime error',
			stack: typeof candidate.stack === 'string' ? candidate.stack : undefined,
			details: sanitizeLogData(error)
		};
	}

	return {
		name: 'Error',
		message: String(error)
	};
}

export async function reportClientError(
	report: ClientErrorReport,
	transport: typeof fetch = fetch
): Promise<void> {
	if (!browser) return;

	const payload = {
		kind: report.kind,
		error: normalizeClientError(report.error),
		endpoint: report.endpoint,
		method: report.method,
		url: report.url,
		status: report.status,
		statusText: report.statusText,
		metadata: sanitizeLogData(report.metadata ?? {})
	};

	const now = Date.now();
	pruneRecentFingerprints(now);

	const fingerprint = buildFingerprint(payload);
	const lastReportedAt = recentReportFingerprints.get(fingerprint);
	if (lastReportedAt && now - lastReportedAt < REPORT_DEDUPE_WINDOW_MS) {
		return;
	}
	recentReportFingerprints.set(fingerprint, now);

	const headers = new Headers({
		'Content-Type': 'application/json'
	});
	const csrfToken = getCsrfToken();
	if (csrfToken) {
		headers.set('x-csrf-token', csrfToken);
	}

	try {
		await transport(CLIENT_ERROR_REPORT_ENDPOINT, {
			method: 'POST',
			headers,
			body: JSON.stringify(payload),
			keepalive: true
		});
	} catch (error) {
		console.error('[ClientErrorReporting] Failed to report client error:', error);
	}
}
