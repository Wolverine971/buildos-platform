// apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { FastChatContextCache } from '$lib/services/agentic-chat-v2/context-cache';
import type { PreparedPromptClient } from './agent-chat-session';
import { createPrewarmController, type PrewarmControllerDeps } from './agent-chat-prewarm.svelte';

interface Flags {
	isOpen: boolean;
	isBrowser: boolean;
	selectedContextType: string | null;
	selectedEntityId: string | undefined;
	resolvedProjectFocus: ProjectFocus | null;
	isPreparingSession: boolean;
	currentSession: ChatSession | null;
	canPrimeActiveChatSession: boolean;
	inputValue: string;
	isVoiceBusy: boolean;
	isVoicePending: boolean;
	isTurnActive: boolean;
}

function defaultFlags(): Flags {
	return {
		isOpen: true,
		isBrowser: true,
		selectedContextType: 'project',
		selectedEntityId: 'project-1',
		resolvedProjectFocus: {
			projectId: 'project-1',
			projectName: 'Summer Campaign',
			focusType: 'project-wide',
			focusEntityId: null,
			focusEntityName: null
		} as unknown as ProjectFocus,
		isPreparingSession: false,
		currentSession: { id: 'session-1' } as ChatSession,
		canPrimeActiveChatSession: false,
		inputValue: '',
		isVoiceBusy: false,
		isVoicePending: false,
		isTurnActive: false
	};
}

function makeCache(params: { key: string; ageMs?: number }): FastChatContextCache {
	return {
		version: 2,
		key: params.key,
		created_at: new Date(Date.now() - (params.ageMs ?? 0)).toISOString(),
		context: {
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			projectName: 'Summer Campaign',
			focusEntityType: null,
			focusEntityId: null,
			focusEntityName: null,
			data: {}
		}
	};
}

function makePreparedPrompt(params: {
	cacheKey: string;
	key?: string;
	expiresInMs?: number;
}): PreparedPromptClient {
	return {
		id: params.key ?? 'prepared-1',
		key: params.key ?? 'prepared-key',
		cache_key: params.cacheKey,
		expires_at: new Date(Date.now() + (params.expiresInMs ?? 90_000)).toISOString()
	};
}

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index += 1) {
		await Promise.resolve();
	}
}

function createHarness(opts: Partial<Flags> = {}) {
	const flags: Flags = { ...defaultFlags(), ...opts };
	const prewarm = vi.fn().mockResolvedValue(null);
	const warmStreamTransport = vi.fn().mockResolvedValue(true);
	const hydrate = vi.fn();
	const deps: PrewarmControllerDeps = {
		getIsOpen: () => flags.isOpen,
		getIsBrowser: () => flags.isBrowser,
		getSelectedContextType: () => flags.selectedContextType as any,
		getSelectedEntityId: () => flags.selectedEntityId,
		getResolvedProjectFocus: () => flags.resolvedProjectFocus,
		getIsPreparingSession: () => flags.isPreparingSession,
		getIsTurnActive: () => flags.isTurnActive,
		getCurrentSession: () => flags.currentSession,
		getCanPrimeActiveChatSession: () => flags.canPrimeActiveChatSession,
		getInputValue: () => flags.inputValue,
		getIsVoiceBusy: () => flags.isVoiceBusy,
		getIsVoicePending: () => flags.isVoicePending,
		prewarmAgentContext: prewarm,
		warmStreamTransport,
		hydrateSessionFromEvent: hydrate
	};
	const controller = createPrewarmController(deps);
	return { flags, controller, prewarm, warmStreamTransport, hydrate, deps };
}

describe('PrewarmController — resolveCurrentKey', () => {
	it('returns null when no context type is selected', () => {
		const h = createHarness({ selectedContextType: null });
		expect(h.controller.resolveCurrentKey()).toBeNull();
	});

	it('returns a stable string for a selected project context', () => {
		const h = createHarness();
		const first = h.controller.resolveCurrentKey();
		const second = h.controller.resolveCurrentKey();
		expect(first).toBe(second);
		expect(typeof first).toBe('string');
		expect(first).toContain('project');
	});

	it('changes when the focused project changes', () => {
		const h = createHarness();
		const before = h.controller.resolveCurrentKey();
		h.flags.selectedEntityId = 'project-2';
		h.flags.resolvedProjectFocus = {
			...h.flags.resolvedProjectFocus!,
			projectId: 'project-2'
		};
		const after = h.controller.resolveCurrentKey();
		expect(before).not.toBe(after);
	});
});

describe('PrewarmController — matchingFreshContext', () => {
	it('returns null when the stored cache key mismatches', () => {
		const h = createHarness();
		h.controller.prewarmedContext = makeCache({ key: 'wrong' });
		expect(h.controller.matchingFreshContext('right')).toBeNull();
	});

	it('returns the cache when key + freshness both match', () => {
		const h = createHarness();
		const cache = makeCache({ key: 'same' });
		h.controller.prewarmedContext = cache;
		expect(h.controller.matchingFreshContext('same')).toBe(cache);
	});

	it('returns null when the stored cache is stale', () => {
		const h = createHarness();
		h.controller.prewarmedContext = makeCache({ key: 'same', ageMs: 1_000_000 });
		expect(h.controller.matchingFreshContext('same')).toBeNull();
	});

	it('returns null when the key is falsy', () => {
		const h = createHarness();
		h.controller.prewarmedContext = makeCache({ key: 'same' });
		expect(h.controller.matchingFreshContext(null)).toBeNull();
		expect(h.controller.matchingFreshContext(undefined)).toBeNull();
	});
});

describe('PrewarmController — resolveReadiness', () => {
	it('tracks context readiness independently from prepared prompt readiness', () => {
		const h = createHarness();
		const key = h.controller.resolveCurrentKey()!;
		h.controller.prewarmedContext = makeCache({ key });

		expect(h.controller.resolveReadiness(key)).toMatchObject({
			key,
			contextCacheReady: true,
			preparedPromptReady: false,
			preparedPromptRetryBlocked: false
		});
	});

	it('tracks prepared prompt readiness independently from context readiness', () => {
		const h = createHarness();
		const key = h.controller.resolveCurrentKey()!;
		h.controller.adoptPrepared(makePreparedPrompt({ cacheKey: key }));

		expect(h.controller.resolveReadiness(key)).toMatchObject({
			key,
			contextCacheReady: false,
			preparedPromptReady: true,
			preparedPromptRetryBlocked: false
		});
	});

	it('treats expired prepared prompts as not ready while preserving fresh context readiness', () => {
		const h = createHarness();
		const key = h.controller.resolveCurrentKey()!;
		h.controller.prewarmedContext = makeCache({ key });
		h.controller.preparedPrompt = makePreparedPrompt({ cacheKey: key, expiresInMs: -1_000 });

		expect(h.controller.resolveReadiness(key)).toMatchObject({
			key,
			contextCacheReady: true,
			preparedPromptReady: false
		});
	});
});

describe('PrewarmController — adopt', () => {
	it('stores a fresh cache', () => {
		const h = createHarness();
		const cache = makeCache({ key: 'abc' });
		h.controller.adopt(cache);
		expect(h.controller.prewarmedContext).toBe(cache);
	});

	it('ignores stale caches', () => {
		const h = createHarness();
		h.controller.adopt(makeCache({ key: 'abc', ageMs: 1_000_000 }));
		expect(h.controller.prewarmedContext).toBeNull();
	});

	it('is a no-op when nothing is passed', () => {
		const h = createHarness();
		h.controller.adopt(null);
		h.controller.adopt(undefined);
		expect(h.controller.prewarmedContext).toBeNull();
	});
});

describe('PrewarmController — invalidateIfStale', () => {
	it('is a no-op when no cache is stored', () => {
		const h = createHarness();
		h.controller.invalidateIfStale();
		expect(h.controller.prewarmedContext).toBeNull();
	});

	it('clears the cache when the active key drifts', () => {
		const h = createHarness();
		h.controller.prewarmedContext = makeCache({ key: 'drifted' });
		h.controller.invalidateIfStale();
		expect(h.controller.prewarmedContext).toBeNull();
	});

	it('clears the cache when the stored cache is stale', () => {
		const h = createHarness();
		const activeKey = h.controller.resolveCurrentKey()!;
		h.controller.prewarmedContext = makeCache({ key: activeKey, ageMs: 1_000_000 });
		h.controller.invalidateIfStale();
		expect(h.controller.prewarmedContext).toBeNull();
	});

	it('preserves the cache when key matches and is fresh', () => {
		const h = createHarness();
		const activeKey = h.controller.resolveCurrentKey()!;
		const cache = makeCache({ key: activeKey });
		h.controller.prewarmedContext = cache;
		h.controller.invalidateIfStale();
		expect(h.controller.prewarmedContext).toBe(cache);
	});
});

describe('PrewarmController — orchestrateTransportWarmup', () => {
	it('skips when not in a browser', () => {
		const h = createHarness({ isBrowser: false });
		expect(h.controller.orchestrateTransportWarmup()).toBeUndefined();
		expect(h.warmStreamTransport).not.toHaveBeenCalled();
	});

	it('skips when the modal is closed', () => {
		const h = createHarness({ isOpen: false });
		expect(h.controller.orchestrateTransportWarmup()).toBeUndefined();
		expect(h.warmStreamTransport).not.toHaveBeenCalled();
	});

	it('warms the stream transport when the modal is open', () => {
		const h = createHarness();
		const cleanup = h.controller.orchestrateTransportWarmup();
		expect(typeof cleanup).toBe('function');
		expect(h.warmStreamTransport).toHaveBeenCalledTimes(1);
	});

	it('returns a cleanup that aborts the transport warmup request', () => {
		const h = createHarness();
		const cleanup = h.controller.orchestrateTransportWarmup();
		cleanup!();
		const signal = h.warmStreamTransport.mock.calls[0]?.[0]?.signal as AbortSignal;
		expect(signal.aborted).toBe(true);
	});
});

describe('PrewarmController — orchestrate', () => {
	it('skips when not in a browser', () => {
		const h = createHarness({ isBrowser: false });
		expect(h.controller.orchestrate()).toBeUndefined();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('skips when the modal is closed', () => {
		const h = createHarness({ isOpen: false });
		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('skips when no context type is selected', () => {
		const h = createHarness({ selectedContextType: null });
		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('skips a project context with no entity id', () => {
		const h = createHarness({ selectedEntityId: undefined, resolvedProjectFocus: null });
		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('skips drafting when no session exists AND no draft signal is present', () => {
		const h = createHarness({ currentSession: null, canPrimeActiveChatSession: true });
		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('fires prewarm when session exists and key is novel', () => {
		const h = createHarness();
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('skips while a turn is active', () => {
		const h = createHarness({ isTurnActive: true });
		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();
	});

	it('does not refire when the key hasnt changed and cache plus prepared prompt are fresh', () => {
		const h = createHarness();
		h.controller.orchestrate();
		const key = h.controller.resolveCurrentKey()!;
		h.controller.prewarmedContext = makeCache({ key });
		h.controller.adoptPrepared(makePreparedPrompt({ cacheKey: key }));
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('rebuilds a prepared prompt after clear when context cache is still fresh', () => {
		const h = createHarness();
		const key = h.controller.resolveCurrentKey()!;
		const cache = makeCache({ key });
		h.controller.adopt(cache);
		h.controller.adoptPrepared(makePreparedPrompt({ cacheKey: key }));

		h.controller.clearPreparedPrompt();
		h.controller.orchestrate();

		expect(h.prewarm).toHaveBeenCalledTimes(1);
		expect(h.prewarm.mock.calls[0]?.[0]).toMatchObject({
			session_id: 'session-1',
			context_type: 'project',
			entity_id: 'project-1'
		});
		expect(h.prewarm.mock.calls[0]?.[0]).not.toHaveProperty('ensure_session');
	});

	it('waits until the active turn completes before rebuilding a prepared prompt', () => {
		const h = createHarness({ isTurnActive: true });
		const key = h.controller.resolveCurrentKey()!;
		const cache = makeCache({ key });
		h.controller.adopt(cache);
		h.controller.adoptPrepared(makePreparedPrompt({ cacheKey: key }));
		h.controller.clearPreparedPrompt();

		h.controller.orchestrate();
		expect(h.prewarm).not.toHaveBeenCalled();

		h.flags.isTurnActive = false;
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('does not spin when prepared prompt creation returns empty while context stays fresh', async () => {
		const h = createHarness();
		const key = h.controller.resolveCurrentKey()!;
		const cache = makeCache({ key });
		h.controller.adopt(cache);
		h.controller.clearPreparedPrompt();
		h.prewarm.mockResolvedValue({
			session: null,
			prewarmedContext: cache,
			preparedPrompt: null
		});

		h.controller.orchestrate();
		await flushMicrotasks();
		h.controller.orchestrate();

		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('fires when the key changes', () => {
		const h = createHarness();
		h.controller.orchestrate();
		h.flags.selectedEntityId = 'project-2';
		h.flags.resolvedProjectFocus = {
			...h.flags.resolvedProjectFocus!,
			projectId: 'project-2',
			projectName: 'Other'
		};
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(2);
	});

	it('fires during draft prewarm when inputValue is non-empty', () => {
		const h = createHarness({
			currentSession: null,
			canPrimeActiveChatSession: true,
			inputValue: 'hello'
		});
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('fires during voice recording even without typed input', () => {
		const h = createHarness({
			currentSession: null,
			canPrimeActiveChatSession: true,
			isVoiceBusy: true
		});
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);
	});

	it('returns a cleanup that aborts the in-flight request', () => {
		const h = createHarness();
		const cleanup = h.controller.orchestrate();
		expect(typeof cleanup).toBe('function');
		cleanup!();
		const signal = h.prewarm.mock.calls[0]?.[1]?.signal as AbortSignal;
		expect(signal.aborted).toBe(true);
	});
});

describe('PrewarmController — reset', () => {
	it('clears the cache so the next orchestrate refires', () => {
		const h = createHarness();
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);

		// Simulate the fetch resolving and caching a fresh entry
		const key = h.controller.resolveCurrentKey()!;
		h.controller.prewarmedContext = makeCache({ key });
		h.controller.adoptPrepared(makePreparedPrompt({ cacheKey: key }));

		// With the cache now present, second orchestrate is a no-op
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(1);

		// After reset, the cache is cleared and orchestrate fires again
		h.controller.reset();
		expect(h.controller.prewarmedContext).toBeNull();
		h.controller.orchestrate();
		expect(h.prewarm).toHaveBeenCalledTimes(2);
	});
});
