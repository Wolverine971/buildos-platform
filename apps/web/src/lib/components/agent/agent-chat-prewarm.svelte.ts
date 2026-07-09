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
import { isProjectContext, type PreparedPromptClient } from './agent-chat-session';
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
	/** True while the current turn is starting, streaming, or being restored. */
	getIsTurnActive(): boolean;
	getCurrentSession(): ChatSession | null;
	getCanPrimeActiveChatSession(): boolean;
	/**
	 * True when the composer holds a non-empty draft. Must be backed by a
	 * memoized boolean (`$derived`), NOT the raw input string — the
	 * orchestrator `$effect` tracks this read, and tracking the string
	 * would re-run (and abort/reissue) the prewarm on every keystroke.
	 */
	getHasDraftInput(): boolean;
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
		preparedPrompt: PreparedPromptClient | null;
	} | null>;

	/**
	 * Make a tiny request to the real v2 stream route so the browser/server
	 * transport path is warm before the user clicks Send.
	 */
	warmStreamTransport?(options: { signal?: AbortSignal }): Promise<boolean>;

	/** Called when a prewarm response returns a session payload. */
	hydrateSessionFromEvent(session: ChatSession): void;

	/** Optional dev logger. */
	logWarn?: (message: string, err: unknown) => void;
}

export interface PrewarmReadiness {
	key: string | null;
	contextCacheReady: boolean;
	preparedPromptReady: boolean;
	preparedPromptRetryBlocked: boolean;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

const PREPARED_PROMPT_RETRY_DELAY_MS = 10_000;
const DEFAULT_PREPARED_PROMPT_SEND_WAIT_MS = 250;

type InflightPrewarm = {
	key: string;
	controller: AbortController;
	promise: Promise<void>;
	heldForSend: boolean;
	abortAfterHold: boolean;
	/** Set by the effect cleanup; cleared when a same-key rerun re-claims the request. */
	pendingAbort: boolean;
};

async function waitForPromiseWithTimeout(
	promise: Promise<unknown>,
	timeoutMs: number
): Promise<boolean> {
	if (timeoutMs <= 0) {
		await promise;
		return true;
	}

	let timeoutId: ReturnType<typeof setTimeout> | null = null;
	const timeout = new Promise<false>((resolve) => {
		timeoutId = setTimeout(() => resolve(false), timeoutMs);
	});
	try {
		return await Promise.race([promise.then(() => true), timeout]);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	}
}

export class PrewarmController {
	prewarmedContext = $state<FastChatContextCache | null>(null);
	preparedPrompt = $state<PreparedPromptClient | null>(null);
	#lastPrewarmKey: string | null = null;
	#preparedPromptRetryKey: string | null = null;
	#preparedPromptRetryAfterMs = 0;
	#inflightPrewarm: InflightPrewarm | null = null;
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
	 * null if no fresh match exists. This is controller-local readiness;
	 * stream requests use nonce-protected prepared prompts instead of
	 * client-carried context payloads.
	 */
	matchingFreshContext(key: string | null | undefined): FastChatContextCache | null {
		if (!key) return null;
		const cache = this.prewarmedContext;
		if (!cache || cache.key !== key) return null;
		return isFastChatContextCacheFresh(cache) ? cache : null;
	}

	matchingFreshPreparedPrompt(key: string | null | undefined): PreparedPromptClient | null {
		if (!key) return null;
		const prepared = this.preparedPrompt;
		if (!prepared || prepared.cache_key !== key || !prepared.key) return null;
		const expiresAt = Date.parse(prepared.expires_at);
		if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
		return prepared;
	}

	resolveReadiness(key: string | null = this.resolveCurrentKey()): PrewarmReadiness {
		if (!key) {
			return {
				key: null,
				contextCacheReady: false,
				preparedPromptReady: false,
				preparedPromptRetryBlocked: false
			};
		}

		const contextCacheReady = Boolean(this.matchingFreshContext(key));
		const preparedPromptReady = Boolean(this.matchingFreshPreparedPrompt(key));
		return {
			key,
			contextCacheReady,
			preparedPromptReady,
			preparedPromptRetryBlocked:
				!preparedPromptReady && this.#isPreparedPromptRetryBlocked(key)
		};
	}

	async waitForPreparedPrompt(
		key: string | null | undefined,
		options: { timeoutMs?: number } = {}
	): Promise<PreparedPromptClient | null> {
		const existing = this.matchingFreshPreparedPrompt(key);
		if (existing || !key) return existing;

		const inflight = this.#inflightPrewarm;
		if (!inflight || inflight.key !== key) return null;

		inflight.heldForSend = true;
		try {
			await waitForPromiseWithTimeout(
				inflight.promise,
				options.timeoutMs ?? DEFAULT_PREPARED_PROMPT_SEND_WAIT_MS
			).catch(() => false);
		} finally {
			inflight.heldForSend = false;
			if (inflight.abortAfterHold && this.#inflightPrewarm === inflight) {
				inflight.controller.abort();
			}
		}

		return this.matchingFreshPreparedPrompt(key);
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

	adoptPrepared(prepared: PreparedPromptClient | null | undefined): boolean {
		if (!prepared?.key || !prepared.cache_key) return false;
		const expiresAt = Date.parse(prepared.expires_at);
		if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
		this.preparedPrompt = prepared;
		this.#lastPrewarmKey = prepared.cache_key;
		this.#clearPreparedPromptRetry();
		return true;
	}

	#clearPreparedPromptRetry(): void {
		this.#preparedPromptRetryKey = null;
		this.#preparedPromptRetryAfterMs = 0;
	}

	#isPreparedPromptRetryBlocked(key: string): boolean {
		return (
			this.#preparedPromptRetryKey === key && Date.now() < this.#preparedPromptRetryAfterMs
		);
	}

	#markPreparedPromptRetry(key: string): void {
		this.#preparedPromptRetryKey = key;
		this.#preparedPromptRetryAfterMs = Date.now() + PREPARED_PROMPT_RETRY_DELAY_MS;
	}

	/**
	 * Body of the transport warmup `$effect`. This is intentionally separate from
	 * prompt prewarm: it has no data side effects and is safe to abort on close.
	 */
	orchestrateTransportWarmup(): (() => void) | undefined {
		if (!this.#deps.getIsBrowser() || !this.#deps.getIsOpen()) return;
		if (!this.#deps.warmStreamTransport) return;

		const controller = new AbortController();
		void this.#deps.warmStreamTransport({ signal: controller.signal }).catch((err) => {
			if ((err as DOMException)?.name !== 'AbortError') {
				this.#deps.logWarn?.('[AgentChat] Stream transport warmup failed', err);
			}
		});

		return () => controller.abort();
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
		if (this.#deps.getIsTurnActive()) return;

		const focus = this.#deps.getResolvedProjectFocus();
		const prewarmEntityId = this.#deps.getSelectedEntityId() ?? focus?.projectId;
		if (isProjectContext(contextType) && !prewarmEntityId) return;

		const shouldPrewarmDraftContext =
			this.#deps.getCanPrimeActiveChatSession() &&
			(this.#deps.getHasDraftInput() ||
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

		const readiness = this.resolveReadiness(key);
		if (
			key === this.#lastPrewarmKey &&
			readiness.contextCacheReady &&
			(readiness.preparedPromptReady || readiness.preparedPromptRetryBlocked)
		) {
			return;
		}
		// A recent hard failure (e.g. 402-frozen account) marked the retry
		// block without adopting anything — wait out the window instead of
		// re-POSTing on every orchestrator rerun.
		if (
			key === this.#lastPrewarmKey &&
			!readiness.contextCacheReady &&
			readiness.preparedPromptRetryBlocked
		) {
			return;
		}

		// A same-key prewarm is already in flight — re-claim it instead of
		// aborting and reissuing. The effect cleanup that ran just before this
		// body only marked it pending-abort (see #releaseInflight); clearing
		// the flag keeps the request alive across benign effect reruns.
		const inflight = this.#inflightPrewarm;
		if (inflight && inflight.key === key && !inflight.controller.signal.aborted) {
			inflight.pendingAbort = false;
			return () => this.#releaseInflight(inflight);
		}

		this.#lastPrewarmKey = key;
		const controller = new AbortController();

		const prewarmPromise = (async () => {
			try {
				const warmed = await this.#deps.prewarmAgentContext(
					{
						session_id: currentSession?.id ?? undefined,
						context_type: contextType,
						entity_id: prewarmEntityId,
						projectFocus: focus,
						...(currentSession?.id ? {} : { ensure_session: false })
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
				const adoptedPreparedPrompt =
					warmed?.preparedPrompt?.cache_key === key &&
					this.adoptPrepared(warmed.preparedPrompt);
				if (!adoptedPreparedPrompt) {
					this.#markPreparedPromptRetry(key);
				}
			} catch (err) {
				if ((err as DOMException)?.name !== 'AbortError') {
					this.#deps.logWarn?.('[AgentChat] Background prewarm failed', err);
					// Block immediate refires (e.g. a 402-frozen account would
					// otherwise re-POST on every orchestrator rerun).
					this.#markPreparedPromptRetry(key);
				}
			}
		})();
		const newInflight: InflightPrewarm = {
			key,
			controller,
			promise: prewarmPromise,
			heldForSend: false,
			abortAfterHold: false,
			pendingAbort: false
		};
		this.#inflightPrewarm = newInflight;
		void prewarmPromise.finally(() => {
			if (this.#inflightPrewarm === newInflight) {
				this.#inflightPrewarm = null;
			}
		});

		return () => this.#releaseInflight(newInflight);
	}

	/**
	 * Effect-cleanup handler for an in-flight prewarm. Cleanups run
	 * synchronously right before the effect body reruns, so the abort is
	 * deferred one microtask: a same-key rerun re-claims the request by
	 * clearing `pendingAbort` before the abort fires. Only a real teardown
	 * (key change, guard exit, effect destroy) lets the abort go through.
	 */
	#releaseInflight(inflight: InflightPrewarm): void {
		inflight.pendingAbort = true;
		queueMicrotask(() => {
			if (!inflight.pendingAbort) return;
			inflight.pendingAbort = false;
			if (this.#inflightPrewarm === inflight && inflight.heldForSend) {
				inflight.abortAfterHold = true;
				return;
			}
			inflight.controller.abort();
		});
	}

	/**
	 * Body of the prewarm invalidator `$effect`. Clears the cache
	 * when the active key no longer matches what's stored, or when
	 * the stored cache has gone stale.
	 */
	invalidateIfStale(): void {
		const key = this.resolveCurrentKey();
		const cache = this.prewarmedContext;
		if (cache && (cache.key !== key || !isFastChatContextCacheFresh(cache))) {
			this.prewarmedContext = null;
		}
		const prepared = this.preparedPrompt;
		if (prepared) {
			const expiresAt = Date.parse(prepared.expires_at);
			if (
				prepared.cache_key !== key ||
				!Number.isFinite(expiresAt) ||
				expiresAt <= Date.now()
			) {
				this.preparedPrompt = null;
			}
		}
	}

	clearPreparedPrompt(): void {
		this.preparedPrompt = null;
		this.#clearPreparedPromptRetry();
	}

	/** Called on modal close to clear all state. */
	reset(): void {
		this.prewarmedContext = null;
		this.preparedPrompt = null;
		this.#lastPrewarmKey = null;
		this.#clearPreparedPromptRetry();
		// Drop any in-flight request so the next orchestrate starts fresh
		// instead of re-claiming a request issued before the reset.
		const inflight = this.#inflightPrewarm;
		if (inflight) {
			this.#inflightPrewarm = null;
			inflight.pendingAbort = false;
			inflight.controller.abort();
		}
	}
}

export function createPrewarmController(deps: PrewarmControllerDeps): PrewarmController {
	return new PrewarmController(deps);
}
