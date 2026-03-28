// apps/web/src/lib/utils/error-observability.ts
const CLIENT_ERROR_REPORT_ENDPOINT = '/api/error-tracking/client';

const KNOWN_NON_ACTIONABLE_PATHS = new Set([
	'/.well-known/apple-app-site-association',
	'/.well-known/assetlinks.json',
	'/.well-known/traffic-advice',
	'/.env',
	'/ads.txt',
	'/apple-app-site-association',
	'/magento_version',
	'/release_notes.txt',
	'/wp-login.php',
	'/xmlrpc.php'
]);

const KNOWN_NON_ACTIONABLE_SUBSTRINGS = [
	'/.env',
	'/hello-dolly',
	'/setup-config.php',
	'/wp-admin/',
	'/wp-content/',
	'/wordpress/'
];

const FIRST_PARTY_ASSET_EXTENSIONS = new Set([
	'css',
	'gif',
	'ico',
	'jpg',
	'jpeg',
	'js',
	'json',
	'png',
	'svg',
	'txt',
	'webmanifest',
	'webp',
	'xml'
]);

export type GenericErrorEventFilterInput = {
	operation?: string;
	pathname?: string | null;
	status?: number;
	routeId?: string | null;
};

export type PersistedErrorEventLike = {
	endpoint?: string | null;
	error_message?: string | null;
	errorMessage?: string | null;
	metadata?: Record<string, unknown> | null;
	operation_type?: string | null;
	operationType?: string | null;
};

function normalizePathname(pathname: string | null | undefined): string | null {
	if (typeof pathname !== 'string') return null;

	const trimmed = pathname.trim();
	if (!trimmed) return null;

	try {
		return new URL(trimmed, 'https://build-os.com').pathname;
	} catch {
		if (!trimmed.startsWith('/')) {
			return `/${trimmed}`;
		}
		return trimmed;
	}
}

function getPathExtension(pathname: string): string | null {
	const lastSegment = pathname.split('/').pop();
	if (!lastSegment) return null;

	const dotIndex = lastSegment.lastIndexOf('.');
	if (dotIndex <= 0 || dotIndex === lastSegment.length - 1) return null;

	return lastSegment.slice(dotIndex + 1).toLowerCase();
}

export function isIgnorableProbePath(pathname: string | null | undefined): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath) return false;

	const lowerPath = normalizedPath.toLowerCase();
	if (KNOWN_NON_ACTIONABLE_PATHS.has(lowerPath)) {
		return true;
	}

	if (KNOWN_NON_ACTIONABLE_SUBSTRINGS.some((fragment) => lowerPath.includes(fragment))) {
		return true;
	}

	return /\.(?:php|asp|aspx|cgi|env|jsp)(?:$|[/?#])/i.test(lowerPath);
}

export function looksLikeFirstPartyAssetPath(pathname: string | null | undefined): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath) return false;

	if (
		normalizedPath === '/favicon.ico' ||
		normalizedPath === '/robots.txt' ||
		normalizedPath === '/sitemap.xml'
	) {
		return true;
	}

	const extension = getPathExtension(normalizedPath);
	return extension ? FIRST_PARTY_ASSET_EXTENSIONS.has(extension) : false;
}

export function getErrorStatus(error: unknown): number | undefined {
	if (error instanceof Response) {
		return Number.isFinite(error.status) ? error.status : undefined;
	}

	if (error && typeof error === 'object') {
		const status = (error as { status?: unknown }).status;
		if (typeof status === 'number' && Number.isFinite(status)) {
			return status;
		}
	}

	const message =
		error instanceof Error
			? error.message
			: typeof error === 'string'
				? error
				: typeof error === 'object' && error && 'message' in error
					? String((error as { message?: unknown }).message ?? '')
					: '';

	if (message.startsWith('Not found: ')) {
		return 404;
	}

	const statusMatch = message.match(/\bstatus\s+(\d{3})\b/i);
	if (!statusMatch) return undefined;

	const parsed = Number.parseInt(statusMatch[1] ?? '', 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function shouldTrackFailedClientResponse(
	pathname: string | null | undefined,
	status: number
): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath || normalizedPath === CLIENT_ERROR_REPORT_ENDPOINT) {
		return false;
	}

	return status >= 500;
}

export function shouldTrackServerResponseFailure(
	pathname: string | null | undefined,
	status: number
): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath || normalizedPath === CLIENT_ERROR_REPORT_ENDPOINT) {
		return false;
	}

	return (
		status >= 500 && (normalizedPath.startsWith('/api/') || normalizedPath.startsWith('/auth/'))
	);
}

export function shouldPersistGenericErrorEvent(input: GenericErrorEventFilterInput): boolean {
	switch (input.operation) {
		case 'hooks.response_status':
		case 'client_fetch_http':
			return typeof input.status === 'number' ? input.status >= 500 : true;
		case 'hooks.handle_error':
			if (typeof input.status !== 'number') {
				return true;
			}

			if (input.status >= 500) {
				return true;
			}

			if (input.status !== 404) {
				return false;
			}

			return (
				looksLikeFirstPartyAssetPath(input.pathname) &&
				!isIgnorableProbePath(input.pathname)
			);
		default:
			return true;
	}
}

export function shouldDisplayPersistedErrorLog(entry: PersistedErrorEventLike): boolean {
	const metadata =
		entry.metadata && typeof entry.metadata === 'object'
			? (entry.metadata as Record<string, unknown>)
			: {};
	const metadataStatus = metadata.status;
	const status =
		typeof metadataStatus === 'number' && Number.isFinite(metadataStatus)
			? metadataStatus
			: getErrorStatus(entry.error_message ?? entry.errorMessage ?? undefined);
	const routeId =
		typeof metadata.routeId === 'string' || metadata.routeId === null
			? (metadata.routeId as string | null)
			: undefined;

	return shouldPersistGenericErrorEvent({
		operation: entry.operation_type ?? entry.operationType ?? undefined,
		pathname: entry.endpoint,
		status,
		routeId
	});
}
