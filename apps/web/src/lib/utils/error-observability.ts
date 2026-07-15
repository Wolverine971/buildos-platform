// apps/web/src/lib/utils/error-observability.ts
const CLIENT_ERROR_REPORT_ENDPOINT = '/api/error-tracking/client';

const KNOWN_NON_ACTIONABLE_PATHS = new Set([
	'/.well-known/apple-app-site-association',
	'/.well-known/assetlinks.json',
	'/.well-known/ai-plugin.json',
	'/.well-known/dnt-policy.txt',
	'/.well-known/gpc.json',
	'/.well-known/jwks.json',
	'/.well-known/security.txt',
	'/.well-known/traffic-advice',
	'/.well-known/trust.txt',
	'/.env',
	'/.astro/manifest.json',
	'/.next/build-manifest.json',
	'/.vite/manifest.json',
	'/__/firebase/init.json',
	'/__env.js',
	'/ads.txt',
	'/api/openapi.json',
	'/app-ads.txt',
	'/app-config.json',
	'/humans.txt',
	'/apple-app-site-association',
	'/asset-manifest.json',
	'/assets/manifest.json',
	'/atom.xml',
	'/build-manifest.json',
	'/build/manifest.json',
	'/config.js',
	'/dist/.vite/manifest.json',
	'/dist/manifest.json',
	'/env.js',
	'/env.json',
	'/feed.xml',
	'/feeds/all.atom.xml',
	'/firebase-config.json',
	'/firebase-service-account.json',
	'/gcp-credentials.json',
	'/google-credentials.json',
	'/google-service-account.json',
	'/index.xml',
	'/key.json',
	'/keys/service-account.json',
	'/magento_version',
	'/manifest.json',
	'/manifest.webmanifest',
	'/meta.json',
	'/_next/build-manifest.json',
	'/_next/static/buildmanifest.js',
	'/_nuxt/builds/latest.json',
	'/_nuxt/manifest.json',
	'/release_notes.txt',
	'/rss.xml',
	'/runtime-config.js',
	'/sa.json',
	'/security.txt',
	'/sitemap_index.xml',
	'/service-account.json',
	'/serviceaccountkey.json',
	'/settings.json',
	'/static/manifest.json',
	'/stats.json',
	'/swagger.json',
	'/webpack-stats.json',
	'/wp-login.php',
	'/xmlrpc.php'
]);

const KNOWN_NON_ACTIONABLE_SUBSTRINGS = [
	'/.env',
	'/hello-dolly',
	'/setup-config.php',
	'/wp-admin/',
	'/wp-content/',
	'/wp-json/',
	'/wordpress/'
];

const KNOWN_NON_ACTIONABLE_PATTERNS = [
	/^\/api\/(?:swagger|openapi)\.(?:json|ya?ml)$/i,
	/^\/(?:__env|env|runtime-config|app-config|firebase-config|settings)\.(?:js|json)$/i,
	/^\/(?:keys\/)?(?:service-account|serviceaccountkey|firebase-service-account|google-service-account|google-credentials|gcp-credentials|key|sa)\.json$/i,
	/^\/(?:assets\/|static\/|dist\/|build\/)?(?:asset-)?manifest\.json$/i,
	/^\/(?:_next|\.next)\/(?:build-manifest\.json|static\/buildmanifest\.js)$/i,
	/^\/(?:_nuxt|\.nuxt)\/(?:manifest\.json|builds\/latest\.json)$/i,
	/^\/(?:\.astro|\.vite|dist\/\.vite)\/manifest\.json$/i,
	/^\/(?:webpack-stats|stats)\.json$/i,
	/^\/(?:feed|atom|index)\.xml$/i,
	/^\/feeds\/[^/]+\.atom\.xml$/i,
	/^\/rss(?:\/[^/]+)?\.xml$/i,
	/^\/administrator\/manifests\/files\/[^/]+\.xml$/i,
	/^\/language\/[a-z]{2}-[a-z]{2}\/[^/]+\.xml$/i,
	/^\/media\/system\/js\/[^/]+\.js$/i,
	/^\/\.well-known\/(?:ai-plugin|dnt-policy|gpc|jwks|security|trust)\.(?:json|txt)$/i
];

const GENERIC_CLIENT_NETWORK_ERROR_MESSAGES = new Set([
	'failed to fetch',
	'load failed',
	'networkerror when attempting to fetch resource.'
]);

const PRIVATE_CONFIG_PROBE_PREFIXES = [
	'/.anthropic/',
	'/.aws/',
	'/.azure/',
	'/.claude/',
	'/.codex/',
	'/.config/',
	'/.cursor/',
	'/.docker/',
	'/.gcp/',
	'/.gemini/',
	'/.git/',
	'/.npm/',
	'/.openai/',
	'/.openclaw/',
	'/.ssh/',
	'/.vscode/'
];

const PRIVATE_CONFIG_PROBE_PATHS = new Set([
	'/.anthropic',
	'/.anthropic/config.json',
	'/.aws',
	'/.azure',
	'/.claude',
	'/.codex',
	'/.config',
	'/.cursor',
	'/.docker',
	'/.env',
	'/.env.development',
	'/.env.local',
	'/.env.production',
	'/.gcp',
	'/.gemini',
	'/.git',
	'/.netrc',
	'/.npm',
	'/.npmrc',
	'/.openai',
	'/.openai/config.json',
	'/.openclaw',
	'/.openclaw/openclaw.json',
	'/.pypirc',
	'/.ssh',
	'/.vscode',
	'/appsettings.development.json',
	'/appsettings.production.json',
	'/appsettings.json',
	'/application_default_credentials.json',
	'/client_secret.json',
	'/client_secrets.json',
	'/config.json',
	'/config.toml',
	'/config.yaml',
	'/config.yml',
	'/credentials.json',
	'/credentials.yaml',
	'/credentials.yml',
	'/firebase.json',
	'/firebase-adminsdk.json',
	'/firebase-credentials.json',
	'/firebase_credentials.json',
	'/gcloud-service-key.json',
	'/gcp-key.json',
	'/gcp-service-account.json',
	'/gcp.json',
	'/gcp_key.json',
	'/google-application-credentials.json',
	'/google-cloud.json',
	'/google-credentials.json',
	'/google-service-account.json',
	'/google-services.json',
	'/google_credentials.json',
	'/google_key.json',
	'/google_service_app.json',
	'/keyfile.json',
	'/sa-key.json',
	'/sa-private-key.json',
	'/secret.json',
	'/secrets.json',
	'/service-account-config.json',
	'/service-account-credentials.json',
	'/service-account-file.json',
	'/service-account-key.json',
	'/service-account.json',
	'/service_account.json',
	'/serviceaccount.json',
	'/serviceaccountcredentials.json',
	'/token.json',
	'/tokens.json'
]);

const PRIVATE_CONFIG_PROBE_DIRECTORY_PATTERN =
	/^\/(?:api\/)?(?:app|auth|config|credentials|secrets)\/[^/]+\.(?:json|ya?ml|toml)$/i;

const PRIVATE_CONFIG_PROBE_FILENAME_PATTERN =
	/^\/(?:api\/)?(?:appsettings(?:\.[a-z]+)?|application_default_credentials|client_secrets?|credentials?|firebase(?:[-_]?adminsdk|[-_]?credentials?)?|gcloud[-_]?service[-_]?key|gcp(?:[-_]?credentials?|[-_]?key|[-_]?service[-_]?account)?|google(?:[-_]?application[-_]?credentials|[-_]?cloud|[-_]?credentials?|[-_]?key|[-_]?service[-_]?app|[-_]?services?)|keyfile|sa(?:[-_]?key|[-_]?private[-_]?key)?|service[-_]?account(?:[-_]?config|[-_]?credentials?|[-_]?file|[-_]?key)?|serviceaccount(?:credentials|key)?)(?:\.[a-z0-9]+)?$/i;

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

function extractNotFoundPath(message: string | null | undefined): string | null {
	if (typeof message !== 'string') return null;
	const match = message.match(/^Not found:\s+(\S+)/i);
	return match?.[1] ?? null;
}

function getPersistedErrorPathname(entry: PersistedErrorEventLike): string | null {
	return (
		normalizePathname(entry.endpoint) ||
		normalizePathname(extractNotFoundPath(entry.error_message ?? entry.errorMessage))
	);
}

function isGenericClientNetworkErrorMessage(message: string | null | undefined): boolean {
	if (typeof message !== 'string') return false;
	return GENERIC_CLIENT_NETWORK_ERROR_MESSAGES.has(message.trim().toLowerCase());
}

function isPersistedClientNetworkNoise(entry: PersistedErrorEventLike): boolean {
	const metadata =
		entry.metadata && typeof entry.metadata === 'object'
			? (entry.metadata as Record<string, unknown>)
			: {};
	const operation = entry.operation_type ?? entry.operationType;
	const reportKind = metadata.reportKind;

	if (operation !== 'client_fetch_network' && reportKind !== 'fetch_network') {
		return false;
	}

	return isGenericClientNetworkErrorMessage(entry.error_message ?? entry.errorMessage);
}

export function isPrivateConfigProbePath(pathname: string | null | undefined): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath) return false;

	const lowerPath = normalizedPath.toLowerCase();
	if (PRIVATE_CONFIG_PROBE_PATHS.has(lowerPath)) {
		return true;
	}

	if (PRIVATE_CONFIG_PROBE_PREFIXES.some((prefix) => lowerPath.startsWith(prefix))) {
		return true;
	}

	return (
		/^\/\.env(?:[./_-]|$)/i.test(lowerPath) ||
		PRIVATE_CONFIG_PROBE_DIRECTORY_PATTERN.test(lowerPath) ||
		PRIVATE_CONFIG_PROBE_FILENAME_PATTERN.test(lowerPath)
	);
}

export function isIgnorableProbePath(pathname: string | null | undefined): boolean {
	const normalizedPath = normalizePathname(pathname);
	if (!normalizedPath) return false;

	const lowerPath = normalizedPath.toLowerCase();
	if (isPrivateConfigProbePath(lowerPath)) {
		return true;
	}

	if (KNOWN_NON_ACTIONABLE_PATHS.has(lowerPath)) {
		return true;
	}

	if (KNOWN_NON_ACTIONABLE_PATTERNS.some((pattern) => pattern.test(lowerPath))) {
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
		case 'client_fetch_network':
			return false;
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
		pathname: getPersistedErrorPathname(entry),
		status,
		routeId
	});
}

export function isPurgeablePersistedErrorNoise(entry: PersistedErrorEventLike): boolean {
	if (isPersistedClientNetworkNoise(entry)) {
		return true;
	}

	const pathname = getPersistedErrorPathname(entry);
	if (!pathname || !isIgnorableProbePath(pathname)) {
		return false;
	}

	const metadata =
		entry.metadata && typeof entry.metadata === 'object'
			? (entry.metadata as Record<string, unknown>)
			: {};
	const metadataStatus = metadata.status;
	const status =
		typeof metadataStatus === 'number' && Number.isFinite(metadataStatus)
			? metadataStatus
			: getErrorStatus(entry.error_message ?? entry.errorMessage ?? undefined);

	return status === 404;
}
