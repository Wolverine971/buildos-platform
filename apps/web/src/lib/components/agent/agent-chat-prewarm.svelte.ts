// apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts
//
// PrewarmController — owns the context-cache prewarm lifecycle for
// AgentChatModal. Consolidates the three call sites of
// `buildFastChatContextCacheKey` (§4.4 drift risk) into a single
// `resolveCurrentKey()` method and moves the two prewarm `$effect`
// bodies into named methods so the modal's effect blocks shrink to
// one-liners.
//
// See: apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md

import type { ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	buildFastChatContextCacheKey,
	isFastChatContextCacheFresh,
	type FastChatContextCache
} from '$lib/services/agentic-chat-v2/context-cache';
import { isProjectContext } from './agent-chat-session';
import type { ChatContextType } from '@buildos/shared-types';

// ---------------------------------------------------------------------------
// Dependency shape
// ---------------------------------------------------------------------------

export interface PrewarmControllerDeps {
	// Reactive state the controller reads
	getIsOpen(): boolean;
	getIsBrowser(): boolean;
	getSelectedContextType(): ChatContextType | null;
	getSelectedEntityId(): string | undefined;
	getResolvedProjectFocus(): ProjectFocus | null;
	getIsPreparingSession(): boolean;
	getCurrentSession(): ChatSession | null;
	getCanPrimeActiveChatSession(): boolean;
	getInputValue(): string;
	/** True when voice capture is mid-flight (recording/initializing/etc.). */
	getIsVoiceBusy(): boolean;
	/** True while awaiting transcription after user hit Send during recording. */
	getIsVoicePending(): boolean;

	/**
	 * Perform the prewarm POST. In production the modal injects the
	 * thin `prewarmAgentContext` wrapper from agent-chat-session.ts.
	 * Tests can inject a mock.
	 */
	prewarmAgentContext(
		payload: {
			session_id?: string;
			context_type: ChatContextType;
			entity_id?: string;
			projectFocus: ProjectFocus | null;
			ensure_session?: boolean;
		},
		options: { signal?: AbortSignal }
	): Promise<{
		session: ChatSession | null;
		prewarmedContext: FastChatContextCache | null;
	} | null>;

	/** Called when a prewarm response returns a session payload. */
	hydrateSessionFromEvent(session: ChatSession): void;

	/** Optional dev logger. */
	logWarn?: (message: string, err: unknown) => void;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class PrewarmController {
	prewarmedContext = $state<FastChatContextCache | null>(null);
	#lastPrewarmKey: string | null = null;
	#deps: PrewarmControllerDeps;

	constructor(deps: PrewarmControllerDeps) {
		this.#deps = deps;
	}

	/**
	 * The single source of truth for the prewarm cache key. Called from
	 * the effect body, the invalidator, and `sendMessage` so all three
	 * paths agree on the key format.
	 */
	resolveCurrentKey(): string | null {
		const contextType = this.#deps.getSelectedContextType();
		if (!contextType) return null;
		const focus = this.#deps.getResolvedProjectFocus();
		const entityId = this.#deps.getSelectedEntityId() ?? focus?.projectId ?? null;
		return buildFastChatContextCacheKey({
			contextType,
			entityId: entityId ?? null,
			projectFocus: focus
		});
	}

	/**
	 * Returns the prewarmed context that matches the provided key, or
	 * null if no fresh match exists. Used by `sendMessage` to decide
	 * whether to pass `prewarmedContext` in the stream request body.
	 */
	matchingFreshContext(key: string | null | undefined): FastChatContextCache | null {
		if (!key) return null;
		const cache = this.prewarmedContext;
		if (!cache || cache.key !== key) return null;
		return isFastChatContextCacheFresh(cache) ? cache : null;
	}

	/**
	 * Adopt a prewarmed-context payload returned by a non-orchestrator
	 * code path (e.g. the session-bootstrap flow), storing it only if
	 * it is still fresh. Also updates `lastPrewarmKey` so the next
	 * orchestrator tick won't refetch.
	 */
	adopt(cache: FastChatContextCache | null | undefined): void {
		if (!cache || !isFastChatContextCacheFresh(cache)) return;
		this.prewarmedContext = cache;
		this.#lastPrewarmKey = cache.key;
	}

	/**
	 * Body of the prewarm orchestrator `$effect`. Returns a cleanup
	 * function that aborts the in-flight request, or `undefined` when
	 * no request is started on this tick.
	 */
	orchestrate(): (() => void) | undefined {
		if (!this.#deps.getIsBrowser() || !this.#deps.getIsOpen()) return;
		const contextType = this.#deps.getSelectedContextType();
		if (!contextType) return;
		if (this.#deps.getIsPreparingSession()) return;

		const focus = this.#deps.getResolvedProjectFocus();
		const prewarmEntityId = this.#deps.getSelectedEntityId() ?? focus?.projectId;
		if (isProjectContext(contextType) && !prewarmEntityId) return;

		const shouldPrewarmDraftContext =
			this.#deps.getCanPrimeActiveChatSession() &&
			(this.#deps.getInputValue().trim().length > 0 ||
				this.#deps.getIsVoiceBusy() ||
				this.#deps.getIsVoicePending());

		const key = this.resolveCurrentKey();
		if (!key) return;

		// Keep draft-time prewarm cache-only. Creating a session while the user is typing
		// briefly disabled the composer, which caused mobile blur/keyboard thrash on the
		// first character. Session creation still happens on send.
		const currentSession = this.#deps.getCurrentSession();
		if (!currentSession?.id && !shouldPrewarmDraftContext) {
			return;
		}

		const cache = this.prewarmedContext;
		const hasFreshMatchingPrewarm =
			cache && cache.key === key && isFastChatContextCacheFresh(cache);
		if (key === this.#lastPrewarmKey && hasFreshMatchingPrewarm) return;

		this.#lastPrewarmKey = key;
		const controller = new AbortController();

		void (async () => {
			try {
				const warmed = await this.#deps.prewarmAgentContext(
					{
						session_id: currentSession?.id ?? undefined,
						context_type: contextType,
						entity_id: prewarmEntityId,
						projectFocus: focus,
						ensure_session: currentSession?.id ? undefined : false
					},
					{ signal: controller.signal }
				);

				if (controller.signal.aborted) return;
				if (warmed?.session) {
					this.#deps.hydrateSessionFromEvent(warmed.session);
				}
				if (
					warmed?.prewarmedContext &&
					warmed.prewarmedContext.key === key &&
					isFastChatContextCacheFresh(warmed.prewarmedContext)
				) {
					this.prewarmedContext = warmed.prewarmedContext;
				}
			} catch (err) {
				if ((err as DOMException)?.name !== 'AbortError') {
					this.#deps.logWarn?.('[AgentChat] Background prewarm failed', err);
				}
			}
		})();

		return () => controller.abort();
	}

	/**
	 * Body of the prewarm invalidator `$effect`. Clears the cache
	 * when the active key no longer matches what's stored, or when
	 * the stored cache has gone stale.
	 */
	invalidateIfStale(): void {
		if (!this.prewarmedContext) return;
		const key = this.resolveCurrentKey();
		const cache = this.prewarmedContext;
		if (cache.key !== key || !isFastChatContextCacheFresh(cache)) {
			this.prewarmedContext = null;
		}
	}

	/** Called on modal close to clear all state. */
	reset(): void {
		this.prewarmedContext = null;
		this.#lastPrewarmKey = null;
	}
}

export function createPrewarmController(deps: PrewarmControllerDeps): PrewarmController {
	return new PrewarmController(deps);
}
