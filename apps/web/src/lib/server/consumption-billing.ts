// apps/web/src/lib/server/consumption-billing.ts

export const CONSUMPTION_BILLING_LIMITS = {
	FREE_PROJECT_LIMIT: 5,
	FREE_CREDIT_LIMIT: 400,
	PRO_INCLUDED_CREDITS: 2000,
	POWER_INCLUDED_CREDITS: 7500
} as const;

// Feature flag for staged rollout. Keep disabled until migration + QA are complete.
export const CONSUMPTION_BILLING_GUARD_ENABLED =
	(process.env.PRIVATE_ENABLE_CONSUMPTION_BILLING_GATE ?? 'false') === 'true';

// Post-mutation auto-escalation (Pro -> Power) is independently controlled.
export const CONSUMPTION_AUTO_POWER_UPGRADE_ENABLED =
	(process.env.PRIVATE_ENABLE_CONSUMPTION_AUTO_POWER_UPGRADE ?? 'false') === 'true';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_MUTATION_PREFIXES_WHEN_FROZEN = [
	'/api/stripe/',
	'/api/auth/',
	'/api/webhooks/',
	'/api/public/',
	'/api/billing/',
	'/api/account/',
	'/api/users/preferences/',
	'/api/users/calendar-preferences/',
	'/api/notification-preferences/',
	'/api/sms/preferences/',
	'/api/sms/verify/',
	'/api/feedback/',
	'/api/visitors/'
];

// Explicit write-block matrix for frozen accounts.
const AI_MUTATION_PREFIXES_WHEN_FROZEN = [
	'/api/agent/',
	'/api/agentic-chat/',
	'/api/braindumps/generate',
	'/api/braindumps/stream',
	'/api/chat/',
	'/api/daily-briefs/generate',
	'/api/tree-agent/',
	'/api/transcribe'
];

const WORKSPACE_MUTATION_PREFIXES_WHEN_FROZEN = [
	'/api/onto/',
	'/api/projects/',
	'/api/tasks/',
	'/api/braindumps/',
	'/api/daily-briefs/',
	'/api/brief-templates/',
	'/api/project-briefs/',
	'/api/templates/',
	'/api/notes/',
	'/api/time-blocks/',
	'/api/voice-notes/',
	'/api/voice-note-groups/',
	'/api/calendar/'
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
	for (const prefix of WORKSPACE_MUTATION_PREFIXES_WHEN_FROZEN) {
		if (matchesPrefix(pathname, prefix)) return 'workspace_write';
	}
	return 'other_mutation';
}

export function isAllowedFrozenMutation(pathname: string): boolean {
	for (const prefix of ALLOWED_MUTATION_PREFIXES_WHEN_FROZEN) {
		if (matchesPrefix(pathname, prefix)) return true;
	}
	return false;
}

export function shouldGuardMutationForConsumptionBilling(
	pathname: string,
	method: string
): boolean {
	if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
	if (!pathname.startsWith('/api/')) return false;
	if (pathname.startsWith('/api/cron/')) return false;

	if (isAllowedFrozenMutation(pathname)) return false;

	return classifyFrozenMutationCapability(pathname) !== 'other_mutation';
}
