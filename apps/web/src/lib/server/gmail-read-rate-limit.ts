// apps/web/src/lib/server/gmail-read-rate-limit.ts
// Preserve the web call signature while the quota rules live in the shared
// package. The web binds its process-wide in-memory limiter singleton.
import { rateLimiter } from '$lib/utils/rate-limiter';
import {
	checkGmailReadRateLimit as checkSharedGmailReadRateLimit,
	type GmailReadOperation,
	type GmailReadRateLimitDecision
} from '@buildos/shared-agent-ops/email/gmail-read-rate-limit';

export type {
	GmailReadOperation,
	GmailReadRateLimitDecision
} from '@buildos/shared-agent-ops/email/gmail-read-rate-limit';

export function checkGmailReadRateLimit(params: {
	userId: string;
	connectionIds: string[];
	operation: GmailReadOperation;
}): GmailReadRateLimitDecision {
	return checkSharedGmailReadRateLimit({ ...params, limiter: rateLimiter });
}
