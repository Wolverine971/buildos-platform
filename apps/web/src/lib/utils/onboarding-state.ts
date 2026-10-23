// apps/web/src/lib/utils/onboarding-state.ts
/** Shared milestone math and account-scoped browser drafts. No authorization decisions here. */
export const ONBOARDING_STEPS = ['Intent', 'Capture', 'Notifications', 'People', 'Ready'] as const;
const LAST_STEP = ONBOARDING_STEPS.length - 1;

export function onboardingStep(
	step: unknown,
	intent?: string | null,
	stakes?: string | null
): number {
	const saved =
		typeof step === 'number' && Number.isInteger(step)
			? Math.max(0, Math.min(LAST_STEP, step))
			: 0;
	return Math.max(saved, intent && stakes ? 1 : 0);
}

export function onboardingProgress(step: number, completed = false): number {
	return completed ? 100 : Math.round((onboardingStep(step) * 100) / ONBOARDING_STEPS.length);
}

const PREFIX = 'buildos:onboarding:';
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function onboardingStorageKey(userId: string, part: string): string {
	return `${PREFIX}${userId}:${part}`;
}

export function readOnboardingDraft<T>(userId: string, part: string): T | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const key = onboardingStorageKey(userId, part);
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const saved = JSON.parse(raw);
		if (
			saved.userId !== userId ||
			!Number.isFinite(saved.savedAt) ||
			Date.now() - saved.savedAt > MAX_DRAFT_AGE_MS
		) {
			localStorage.removeItem(key);
			return null;
		}
		return saved.value as T;
	} catch {
		return null;
	}
}

export function writeOnboardingDraft(userId: string, part: string, value: unknown): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(
			onboardingStorageKey(userId, part),
			JSON.stringify({ userId, savedAt: Date.now(), value })
		);
	} catch {
		// A disabled/full browser store must not prevent saving a project on the server.
	}
}

export function clearOnboardingDrafts(userId?: string): void {
	if (typeof window === 'undefined') return;
	for (const storageName of ['localStorage', 'sessionStorage'] as const) {
		try {
			const storage = window[storageName];
			for (let i = storage.length - 1; i >= 0; i--) {
				const key = storage.key(i);
				if (
					key?.startsWith(userId ? `${PREFIX}${userId}:` : PREFIX) ||
					[
						'buildos_onboarding_state',
						'buildos_onboarding_step2_state',
						'onboarding_modal_dismissed'
					].includes(key ?? '')
				) {
					storage.removeItem(key!);
				}
			}
		} catch {
			/* Storage can be unavailable in private browsing. */
		}
	}
}

// A handle typed on the signup page, held in this tab until onboarding can claim it for the
// new account. sessionStorage survives the Google round trip but not a new tab, and the
// onboarding prefix means sign-out clears it, so it never lands on someone else's account.
const SIGNUP_HANDLE_KEY = `${PREFIX}signup-handle`;
const HANDLE_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizeHandleInput(value: string): string {
	return value.trim().replace(/^@+/, '').toLowerCase();
}

export function isValidHandle(value: string): boolean {
	return value.length >= 3 && value.length <= 24 && HANDLE_SHAPE.test(value);
}

export function saveSignupHandle(value: string): void {
	if (typeof sessionStorage === 'undefined') return;
	const handle = normalizeHandleInput(value);
	try {
		if (isValidHandle(handle)) sessionStorage.setItem(SIGNUP_HANDLE_KEY, handle);
		else sessionStorage.removeItem(SIGNUP_HANDLE_KEY);
	} catch {
		/* Storage can be unavailable in private browsing. */
	}
}

/** Reads and forgets the signup handle, so it is claimed at most once. */
export function takeSignupHandle(): string | null {
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const handle = sessionStorage.getItem(SIGNUP_HANDLE_KEY);
		sessionStorage.removeItem(SIGNUP_HANDLE_KEY);
		return handle && isValidHandle(handle) ? handle : null;
	} catch {
		return null;
	}
}

export type ActivationPacket = {
	project: {
		id: string;
		name: string;
		description: string | null;
		next_step_short: string | null;
	};
	start_here: {
		id: string;
		title: string | null;
		excerpt: string | null;
		truncated: boolean;
	} | null;
	counts: { tasks: number; goals: number; documents: number; plans: number; milestones: number };
	sample_entities: Array<{ kind: 'task' | 'goal' | 'document'; id: string; name: string }>;
};
