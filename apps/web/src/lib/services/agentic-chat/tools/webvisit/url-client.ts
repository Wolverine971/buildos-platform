// apps/web/src/lib/services/agentic-chat/tools/webvisit/url-client.ts
import { env } from '$env/dynamic/private';
import {
	fetchPublicUrl,
	type FetchPublicUrlOptions,
	type FetchPublicUrlResult
} from '@buildos/shared-agent-ops/web/safe-fetch';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 2_000_000;

export type FetchUrlOptions = FetchPublicUrlOptions;
export type FetchUrlResult = FetchPublicUrlResult;

function parseNumber(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Chat wrapper around the shared SSRF-safe fetcher. Environment-specific
 * defaults stay in the web app; URL validation and redirect checks are shared
 * with durable Agent Runs.
 */
export function fetchUrl(inputUrl: string, options: FetchUrlOptions = {}): Promise<FetchUrlResult> {
	return fetchPublicUrl(inputUrl, {
		...options,
		timeoutMs: options.timeoutMs ?? parseNumber(env.WEB_VISIT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
		maxBytes: options.maxBytes ?? parseNumber(env.WEB_VISIT_MAX_BYTES, DEFAULT_MAX_BYTES),
		userAgent: options.userAgent ?? 'BuildOS-AgenticChat/1.0'
	});
}
