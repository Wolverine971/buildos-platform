// apps/mobile/src/lib/chat/runtime.ts
/**
 * The phone's one agentic-chat runtime: the shared core (`@buildos/agentic-chat-client`) wired
 * to this device's Supabase client, bearer-token fetch and app lifecycle. It outlives screens,
 * so a turn sent from a chat keeps streaming into its session store after the sheet closes,
 * and reopening the chat shows what arrived. Created on first use, kept for the app's life;
 * the core itself follows sign-out through the Supabase auth events.
 */
import {
	AgenticChatWorkerRealtimeCoordinator,
	AgenticChatWorkerTurnAdoption,
	createAgentChatWorkerUiAdapter,
	createAgenticChatWorkerRealtimeRuntime,
	type AgenticChatWorkerRealtimeRuntime,
	type AgenticChatWorkerRealtimeRuntimeClient,
	type AgenticChatWorkerRealtimeRuntimeOptions
} from '@buildos/agentic-chat-client';
import { AppState } from 'react-native';

import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';

import { createBearerFetch } from './bearer-fetch';
import { createSessionStore, type SessionStore } from './session-store';

type VisibilityTarget = NonNullable<AgenticChatWorkerRealtimeRuntimeOptions['documentTarget']>;

/** The core listens for `visibilitychange` on a document; on the phone that is AppState. */
function appStateVisibility(): VisibilityTarget {
	const listeners = new Set<EventListener>();
	AppState.addEventListener('change', () => {
		for (const listener of listeners) listener({ type: 'visibilitychange' } as Event);
	});
	return {
		get visibilityState() {
			return AppState.currentState === 'active' ? 'visible' : 'hidden';
		},
		addEventListener(type, listener) {
			if (type === 'visibilitychange') listeners.add(listener);
		},
		removeEventListener(_type, listener) {
			listeners.delete(listener);
		}
	};
}

function devWarn(message: string, error: unknown) {
	if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn(message, error);
}

export type ChatRuntime = {
	runtime: AgenticChatWorkerRealtimeRuntime;
	adoption: AgenticChatWorkerTurnAdoption;
	/** The store for a stored session; one per session id, created on first ask. */
	storeFor(sessionId: string): SessionStore;
	/** The store for a chat that has no session yet (nothing sent). */
	draftStore(key: string): SessionStore;
	/** The first send created the session: the draft store becomes that session's store. */
	bindSession(key: string, sessionId: string): SessionStore;
	/** Turns running anywhere right now (for the Brain Bolt badge). */
	activeTurnCount(): number;
	subscribeActiveTurns(listener: () => void): () => void;
};

let shared: ChatRuntime | null = null;

export function getChatRuntime(): ChatRuntime {
	if (shared) return shared;

	const stores = new Map<string, SessionStore>();
	const drafts = new Map<string, SessionStore>();
	const storeFor = (sessionId: string) => {
		let store = stores.get(sessionId);
		if (!store) {
			store = createSessionStore({ sessionId });
			stores.set(sessionId, store);
		}
		return store;
	};

	const active = new Set<string>();
	const activeListeners = new Set<() => void>();
	const notifyActive = () => {
		for (const listener of activeListeners) listener();
	};

	const fetchImpl = createBearerFetch({
		baseUrl: config.apiBaseUrl,
		getAccessToken: async () =>
			(await supabase.auth.getSession()).data.session?.access_token ?? null
	});
	const coordinator = new AgenticChatWorkerRealtimeCoordinator({
		fetchImpl,
		onError: (error) => devWarn('[chat] realtime reconciliation degraded', error),
		// A reconcile 401 usually means an expired access token.
		refreshAuthSession: async () => {
			const { data, error } = await supabase.auth.refreshSession();
			return !error && Boolean(data.session);
		}
	});
	const runtime = createAgenticChatWorkerRealtimeRuntime({
		client: supabase as unknown as AgenticChatWorkerRealtimeRuntimeClient,
		coordinator,
		fetchImpl,
		windowTarget: null,
		documentTarget: appStateVisibility(),
		onError: (error) => devWarn('[chat] realtime runtime degraded', error),
		onUserChange: (userId) => {
			if (userId !== null) return;
			// Signed out: nothing on screen may keep another account's turns.
			adoption.clear('auth_changed');
			stores.clear();
			drafts.clear();
			active.clear();
			notifyActive();
		}
	});
	const adoption = new AgenticChatWorkerTurnAdoption({
		runtime,
		fetchImpl,
		createObserver: ({ handle, onTerminal }) =>
			createAgentChatWorkerUiAdapter({
				handle,
				onTerminal,
				port: storeFor(handle.sessionId).port
			}),
		onAdopted: ({ descriptor }) => {
			storeFor(descriptor.handle.sessionId).adoptHandle(descriptor.handle, descriptor.status);
			active.add(descriptor.handle.turnRunId);
			notifyActive();
		},
		onReleased: ({ handle }) => {
			active.delete(handle.turnRunId);
			notifyActive();
		},
		onError: (error) => devWarn('[chat] turn adoption degraded', error)
	});
	void runtime
		.start()
		.catch((error) => devWarn('[chat] realtime runtime failed to start', error));

	shared = {
		runtime,
		adoption,
		storeFor,
		draftStore(key) {
			let store = drafts.get(key);
			if (!store) {
				store = createSessionStore();
				drafts.set(key, store);
			}
			return store;
		},
		bindSession(key, sessionId) {
			const draft = drafts.get(key);
			drafts.delete(key);
			const existing = stores.get(sessionId);
			if (existing) return existing;
			const store = draft ?? createSessionStore({ sessionId });
			store.setSessionId(sessionId);
			stores.set(sessionId, store);
			return store;
		},
		activeTurnCount: () => active.size,
		subscribeActiveTurns(listener) {
			activeListeners.add(listener);
			return () => {
				activeListeners.delete(listener);
			};
		}
	};
	return shared;
}
