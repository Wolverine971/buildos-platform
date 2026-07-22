// apps/web/src/lib/utils/client-route-recovery.ts
const RECOVERY_ATTEMPT_STORAGE_KEY = 'buildos:route-load-recovery';
const RECOVERY_ATTEMPT_WINDOW_MS = 60_000;

type RecoveryAttempt = {
	route: string;
	attemptedAt: number;
	moduleUrl: string | null;
};

export type RouteLoadRecoveryContext = {
	route: string;
	storage: Pick<Storage, 'getItem' | 'setItem'>;
	reload: () => void;
	refreshModule?: (moduleUrl: string) => Promise<void>;
	now?: number;
};

function getErrorDetails(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}

	if (error && typeof error === 'object') {
		const candidate = error as { name?: unknown; message?: unknown };
		return {
			name: typeof candidate.name === 'string' ? candidate.name : '',
			message: typeof candidate.message === 'string' ? candidate.message : ''
		};
	}

	return { name: '', message: typeof error === 'string' ? error : '' };
}

export function isRecoverableRouteLoadError(error: unknown): boolean {
	const { name, message } = getErrorDetails(error);
	const normalized = `${name}: ${message}`;

	return (
		/ChunkLoadError/i.test(normalized) ||
		/Loading (?:CSS )?chunk .+ failed/i.test(normalized) ||
		/Failed to fetch dynamically imported module/i.test(normalized) ||
		/Error loading dynamically imported module/i.test(normalized) ||
		/Importing a module script failed/i.test(normalized) ||
		/Cannot read properties of undefined \(reading ['"]universal['"]\)/i.test(normalized)
	);
}

function getFailedModuleUrl(error: unknown): string | null {
	const { message } = getErrorDetails(error);
	const dynamicImportMatch = message.match(
		/(?:Failed to fetch|Error loading) dynamically imported module:\s*(\S+)/i
	);
	if (dynamicImportMatch?.[1]) return dynamicImportMatch[1];

	const immutableAssetMatch = message.match(/https?:\/\/\S+\/_app\/immutable\/\S+\.js/i);
	return immutableAssetMatch?.[0] ?? null;
}

function readRecoveryAttempt(storage: RouteLoadRecoveryContext['storage']): RecoveryAttempt | null {
	try {
		const serialized = storage.getItem(RECOVERY_ATTEMPT_STORAGE_KEY);
		if (!serialized) return null;

		const attempt = JSON.parse(serialized) as Partial<RecoveryAttempt>;
		if (typeof attempt.route !== 'string' || typeof attempt.attemptedAt !== 'number') {
			return null;
		}

		return {
			route: attempt.route,
			attemptedAt: attempt.attemptedAt,
			moduleUrl: typeof attempt.moduleUrl === 'string' ? attempt.moduleUrl : null
		};
	} catch {
		return null;
	}
}

/**
 * Recover when a client route module belongs to a deployment that is no longer
 * available at the edge. A failed immutable module is refreshed before the
 * reload, and the session marker prevents an unavailable asset from creating a
 * reload loop. A generic manifest error may upgrade once to a module refresh.
 */
export function recoverFromRouteLoadError(
	error: unknown,
	context: RouteLoadRecoveryContext
): boolean {
	if (!isRecoverableRouteLoadError(error)) return false;

	const now = context.now ?? Date.now();
	const moduleUrl = getFailedModuleUrl(error);
	const previousAttempt = readRecoveryAttempt(context.storage);
	const upgradesToModuleRefresh = Boolean(moduleUrl && !previousAttempt?.moduleUrl);
	if (
		previousAttempt?.route === context.route &&
		now - previousAttempt.attemptedAt < RECOVERY_ATTEMPT_WINDOW_MS &&
		!upgradesToModuleRefresh
	) {
		return false;
	}

	try {
		context.storage.setItem(
			RECOVERY_ATTEMPT_STORAGE_KEY,
			JSON.stringify({
				route: context.route,
				attemptedAt: now,
				moduleUrl
			} satisfies RecoveryAttempt)
		);
	} catch {
		// Without a persistent marker, reloading could trap the page in a loop.
		return false;
	}

	if (moduleUrl && context.refreshModule) {
		void context
			.refreshModule(moduleUrl)
			.catch(() => undefined)
			.finally(context.reload);
	} else {
		context.reload();
	}
	return true;
}
