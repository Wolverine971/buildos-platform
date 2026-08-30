// apps/web/src/lib/services/agentic-chat/legacy-execution/http-stream/lifecycle.server.ts
import { waitUntil } from '@vercel/functions';

type WaitUntilRegistrar = (promise: Promise<unknown>) => void | undefined;

type VercelRequestContextProvider = {
	get?: () => {
		waitUntil?: WaitUntilRegistrar;
	};
};

const VERCEL_REQUEST_CONTEXT_SYMBOL = Symbol.for('@vercel/request-context');

export function isLegacyDetachedLifecycleEnabled(value: string | undefined): boolean {
	return value === '1' || value?.toLowerCase() === 'true';
}

function hasVercelWaitUntilContext(): boolean {
	const contextProvider = (
		globalThis as typeof globalThis & Record<symbol, VercelRequestContextProvider | undefined>
	)[VERCEL_REQUEST_CONTEXT_SYMBOL];
	return typeof contextProvider?.get?.().waitUntil === 'function';
}

export function registerLegacyTurnPromise(
	promise: Promise<unknown>,
	options: {
		enabled: boolean;
		isAvailable?: () => boolean;
		register?: WaitUntilRegistrar;
	}
): boolean {
	if (!options.enabled) return false;

	const isAvailable = options.isAvailable ?? hasVercelWaitUntilContext;
	if (!isAvailable()) return false;

	const register = options.register ?? waitUntil;
	register(promise);
	return true;
}

export function shouldCloseLegacySseSink(params: {
	streamDetached: boolean;
	detachedLifecycleRegistered: boolean;
}): boolean {
	return !params.streamDetached || params.detachedLifecycleRegistered;
}
