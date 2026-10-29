// apps/mobile/src/hooks/use-capture-queue.ts
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { invalidateDesktop } from '@/hooks/use-desktop';
import { createUserApi } from '@/lib/api';
import { deleteRecording, findRecordings, transcribeForm } from '@/lib/capture-audio';
import {
	type CaptureAudio,
	type CaptureQueue,
	createCaptureQueue,
	createDrainClaim,
	type QueueSnapshot,
	shouldRefreshToday,
	type SortedCapture
} from '@/lib/capture-queue';
import { secureStorage } from '@/lib/secure-storage';
import { useAuth } from '@/providers/auth-provider';

const EMPTY: QueueSnapshot = {
	items: Object.freeze([]),
	lastStop: null,
	active: null,
	sorted: Object.freeze([])
};
const queues = new Map<string, CaptureQueue>();
/** Up to four hooks (box + pending rows, on both tabs) share each drain; one refreshes. */
const claimDrain = createDrainClaim();

/**
 * Per-call limits, so one hung request can never hold the queue. The server gives a whole
 * recording up to ~95 s to transcribe; a sort is one fast model call plus a few writes. An
 * abort counts as server trouble, so a capture that keeps timing out stops blocking the rest.
 */
const TIMEOUT_MS = { transcribe: 115_000, save: 30_000, sort: 45_000 } as const;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	try {
		return await run(controller.signal);
	} finally {
		clearTimeout(timer);
	}
}

/** One queue per signed-in user, shared by every screen that shows or adds captures. */
function queueFor(userId: string): CaptureQueue {
	let queue = queues.get(userId);
	if (!queue) {
		// Speaks only for this account; with anyone else signed in, every call waits as signed out.
		const userApi = createUserApi(userId);
		queue = createCaptureQueue({
			store: secureStorage,
			key: `buildos.capture-queue.${userId}`,
			transcribe: (audio) =>
				withTimeout(TIMEOUT_MS.transcribe, async (signal) => {
					const result = await userApi.transcribe(transcribeForm(audio), { signal });
					return result.transcript;
				}),
			save: (input) =>
				withTimeout(TIMEOUT_MS.save, (signal) =>
					userApi.workspace.capture(input, { signal })
				),
			sort: (input) =>
				withTimeout(TIMEOUT_MS.sort, (signal) =>
					userApi.workspace.sortCapture(input, { signal })
				),
			discardAudio: (audio) => deleteRecording(audio),
			source: Platform.OS
		});
		queues.set(userId, queue);
		// Recordings left on the phone by a closed app or an interrupted save go back in line.
		void queue.adoptRecordings(findRecordings(userId)).catch(() => {});
	}
	return queue;
}

/**
 * Captures waiting on this phone, what the latest ones were sorted into, and the actions
 * around them. Drains on mount, whenever the app returns to the foreground, and right after
 * each new capture.
 */
export function useCaptureQueue() {
	const { session } = useAuth();
	const queryClient = useQueryClient();
	const userId = session?.user.id ?? null;
	const queue = useMemo(() => (userId ? queueFor(userId) : null), [userId]);

	const snapshot = useSyncExternalStore(
		(onChange) => (queue ? queue.subscribe(onChange) : () => {}),
		() => (queue ? queue.snapshot() : EMPTY),
		() => EMPTY
	);

	const refreshToday = useCallback(
		() => void queryClient.invalidateQueries({ queryKey: ['today'] }),
		[queryClient]
	);

	const drain = useCallback(async () => {
		if (!queue) return null;
		const result = await queue.drain();
		if (!claimDrain(result)) return result;
		// A sort can add tasks due today or finish one; a picked task (first build) may be due.
		if (shouldRefreshToday(result)) {
			refreshToday();
		}
		// A saved capture lands loose in the Workspace; a sort files it into a project.
		if (result?.saved?.length || result?.sorted?.length) {
			void invalidateDesktop(queryClient, userId);
		}
		return result;
	}, [queue, refreshToday, queryClient, userId]);

	useEffect(() => {
		if (!queue) return;
		void drain();
		const subscription = AppState.addEventListener('change', (state) => {
			if (state === 'active') void drain();
		});
		return () => subscription.remove();
	}, [queue, drain]);

	const enqueueText = useCallback(
		async (text: string) => {
			if (!queue) throw new Error('Sign in to capture.');
			const item = await queue.enqueueText(text);
			void drain();
			return item;
		},
		[queue, drain]
	);

	const enqueueVoice = useCallback(
		async (audio: CaptureAudio) => {
			// Signed out: the file stays on the phone and is picked up at the next sign-in.
			if (!queue) throw new Error('Sign in to capture.');
			const item = await queue.enqueueVoice(audio);
			void drain();
			return item;
		},
		[queue, drain]
	);

	/** Puts a sorted capture back the way it was written. Resolves to how many changes stuck. */
	const undo = useCallback(
		async (entry: SortedCapture) => {
			if (!entry.receipt) return { failed: 0 };
			if (!userId) throw new Error('Sign in to undo.');
			const result = await createUserApi(userId).workspace.undoSort(entry.receipt);
			queue?.dismissSorted(entry.id);
			refreshToday();
			void invalidateDesktop(queryClient, userId);
			return { failed: result.failed };
		},
		[queue, userId, refreshToday, queryClient]
	);

	const { items, lastStop, active, sorted } = snapshot;
	return {
		items,
		pendingCount: items.filter((item) => item.state === 'pending').length,
		failed: items.filter((item) => item.state === 'failed'),
		/** Why the last send attempt stopped; null while sending or when nothing is waiting. */
		stopped: lastStop,
		/** The capture being worked on right now and its step. */
		active,
		/** What the latest captures became, newest first, with Undo receipts. */
		sorted,
		enqueueText,
		enqueueVoice,
		drain,
		undo,
		dismissSorted: (id: string) => queue?.dismissSorted(id),
		retryAll: async () => {
			await queue?.retryAll().catch(() => {});
			await drain();
		},
		remove: (id: string) => queue?.remove(id).catch(() => {}) ?? Promise.resolve()
	};
}
