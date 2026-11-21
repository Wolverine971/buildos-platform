// apps/web/src/lib/server/consumption-billing.ts

export { CONSUMPTION_BILLING_LIMITS } from '@buildos/shared-types';

// Feature flag for staged rollout. Keep disabled until migration + QA are complete.
export const CONSUMPTION_BILLING_GUARD_ENABLED =
	(process.env.PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE ?? 'false') === 'true';

// Post-mutation auto-escalation (Pro -> Power) is independently controlled.
export const CONSUMPTION_AUTO_POWER_UPGRADE_ENABLED =
	(process.env.PRIVATE_ENABLE_CONSUMPTION_AUTO_POWER_UPGRADE ?? 'false') === 'true';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// A frozen account is read-only: every write under /api/ is refused unless it is listed here.
// New endpoints are therefore blocked by default, so a feature added later cannot spend money
// for an account that has stopped paying. What stays open: paying, signing in and out, leaving,
// preferences, read-style POSTs, telemetry, machine callers, and stopping or undoing work.
const ALLOWED_MUTATION_PREFIXES_WHEN_FROZEN = [
	// Paying, signing in and out, leaving
	'/api/stripe/',
	'/api/billing/',
	'/api/auth/',
	'/api/account/',
	'/api/legal/',
	// Preferences and identity
	'/api/users/',
	'/api/notification-preferences/',
	'/api/brief-preferences/',
	'/api/sms/preferences/',
	'/api/sms/verify/',
	'/api/profile/me/',
	'/api/push/',
	// Connecting or disconnecting Google; the mail and calendar lookups here are reads
	'/api/integrations/',
	// Searches sent as POST
	'/api/search/',
	// Answering someone who asked for access
	'/api/people/',
	// Telemetry and public surfaces
	'/api/feedback/',
	'/api/visitors/',
	'/api/public/',
	'/api/error-tracking/',
	'/api/email-tracking/',
	'/api/notification-tracking/',
	'/api/share/',
	// Machine callers that authenticate on their own. /api/agent-call/ carries an outside
	// agent's reads as POSTs, so it cannot be blocked by method; its writes go through the
	// agent gateway, which does not check the freeze yet.
	'/api/webhooks/',
	'/api/internal/',
	'/api/agent-call/',
	// Cancelling something already queued
	'/api/queue-jobs/',
	'/api/sms/scheduled/'
];

// Stopping, undoing, or changing the settings of work that already exists.
const ALLOWED_MUTATION_PATTERNS_WHEN_FROZEN = [
	/^\/api\/agent-runs\/[^/]+\/(cancel|pause|commit)\/?$/,
	/^\/api\/agent-operatives\/[^/]+\/?$/,
	/^\/api\/cycles\/[^/]+\/?$/,
	/^\/api\/brief-jobs\/cancel\/?$/,
	/^\/api\/daily-briefs\/cancel\/?$/,
	/^\/api\/consolidation\/runs\/[^/]+\/(cancel|undo|veto)\/?$/,
	/^\/api\/knowledge\/research\/cancel\/?$/,
	/^\/api\/workspace\/(capture\/sort|graduate)\/undo\/?$/
];

// The lists below only choose the message a blocked request gets; they do not decide what is
// blocked. Paid model or research work:
const AI_MUTATION_PREFIXES_WHEN_FROZEN = [
	'/api/agent/',
	'/api/agentic-chat/',
	'/api/chat/',
	'/api/daily-briefs/generate',
	'/api/daily-briefs/ensure-today',
	'/api/brief-jobs/',
	'/api/transcribe',
	'/api/consolidation/',
	'/api/inbox/',
	'/api/workspace/find/',
	'/api/workspace/capture/sort',
	'/api/workspace/suggestions/',
	'/api/knowledge/enrich',
	'/api/knowledge/research/',
	'/api/profile/builder/draft',
	'/api/profile/builder/updates',
	'/api/libri/',
	'/api/lab/'
];

// Edits to the person's own records:
const WORKSPACE_MUTATION_PREFIXES_WHEN_FROZEN = [
	'/api/onto/',
	'/api/projects/',
	'/api/tasks/',
	'/api/daily-briefs/',
	'/api/brief-templates/',
	'/api/project-briefs/',
	'/api/time-blocks/',
	'/api/voice-notes/',
	'/api/voice-note-groups/',
	'/api/calendar/',
	'/api/workspace/',
	'/api/knowledge/',
	'/api/today/',
	'/api/profile/',
	'/api/onboarding/',
	'/api/agent-operatives/',
	'/api/cycles/'
];

// Agent runs, operatives and cycles: the calls that start or continue paid work.
const AI_MUTATION_PATTERNS_WHEN_FROZEN = [
	/^\/api\/agent-runs\/?$/,
	/^\/api\/agent-runs\/[^/]+\/(answer|resume|steer)\/?$/,
	/^\/api\/agent-operatives\/[^/]+\/run\/?$/,
	/^\/api\/cycles\/[^/]+\/run\/?$/
];

export type FrozenMutationCapability = 'ai_compute' | 'workspace_write' | 'other_mutation';

function matchesPrefix(pathname: string, prefix: string): boolean {
	if (prefix.endsWith('/')) {
		const rootPath = prefix.slice(0, -1);
		return pathname === rootPath || pathname.startsWith(prefix);
	}
	return pathname.startsWith(prefix);
}

export function classifyFrozenMutationCapability(pathname: string): FrozenMutationCapability {
	for (const prefix of AI_MUTATION_PREFIXES_WHEN_FROZEN) {
		if (matchesPrefix(pathname, prefix)) return 'ai_compute';
	}
	if (AI_MUTATION_PATTERNS_WHEN_FROZEN.some((pattern) => pattern.test(pathname))) {
		return 'ai_compute';
	}
	for (const prefix of WORKSPACE_MUTATION_PREFIXES_WHEN_FROZEN) {
		if (matchesPrefix(pathname, prefix)) return 'workspace_write';
	}
	return 'other_mutation';
}

export function isAllowedFrozenMutation(pathname: string): boolean {
	for (const prefix of ALLOWED_MUTATION_PREFIXES_WHEN_FROZEN) {
		if (matchesPrefix(pathname, prefix)) return true;
	}
	return ALLOWED_MUTATION_PATTERNS_WHEN_FROZEN.some((pattern) => pattern.test(pathname));
}

export function shouldGuardMutationForConsumptionBilling(
	pathname: string,
	method: string
): boolean {
	if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
	if (!pathname.startsWith('/api/')) return false;
	if (pathname.startsWith('/api/cron/')) return false;

	// Block by default: anything not explicitly open to a frozen account is guarded.
	return !isAllowedFrozenMutation(pathname);
}
