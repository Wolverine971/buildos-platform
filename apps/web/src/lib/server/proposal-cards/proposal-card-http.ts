// apps/web/src/lib/server/proposal-cards/proposal-card-http.ts
//
// Request parsing and failure responses shared by the four
// /api/chat/proposal-cards/[id] routes.
import { ApiResponse } from '$lib/utils/api-response';
import type { ProposalCardFailure } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** visibleDigest is a lowercase sha256 hex string. */
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const parsed: unknown = await request.json();
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** Absent is fine (cancel, nest); present must be a digest. */
export function parseSeenDigest(
	value: unknown
): { ok: true; digest: string | null } | { ok: false } {
	if (value === undefined || value === null) return { ok: true, digest: null };
	return typeof value === 'string' && DIGEST_PATTERN.test(value)
		? { ok: true, digest: value }
		: { ok: false };
}

export function proposalCardFailureResponse(result: ProposalCardFailure): Response {
	return ApiResponse.error(result.message, result.status, result.code, result.details);
}
